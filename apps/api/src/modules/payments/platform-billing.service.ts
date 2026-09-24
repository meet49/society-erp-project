import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { PaymentOrder, type PaymentOrderDoc } from '../../models/payment-order.model';
import { PlatformPayment, type PlatformPaymentDoc } from '../../models/platform-payment.model';
import { Subscription } from '../../models/subscription.model';
import { Plan } from '../../models/plan.model';
import { Society } from '../../models/society.model';
import { Errors } from '../../lib/errors';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { domainEvents } from '../../core/events/event-bus';
import { subscriptionEngine } from '../../core/subscription/subscription-engine.service';
import { MockPaymentProvider, platformPaymentProvider } from '../../core/payments/payment-provider';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';

const ORDER_TTL_MINUTES = 30;

/** Subscription payments made by societies to the platform (online via the platform gateway, or recorded offline by the platform team). */
class PlatformBillingService {
  async quote(societyId: string, billingCycle?: 'MONTHLY' | 'ANNUAL') {
    const sub = await subscriptionEngine.getBySociety(societyId);
    const plan = await Plan.findById(sub.planId).lean();
    if (!plan) throw Errors.notFound('Plan');
    const cycle = billingCycle ?? (sub.billingCycle as 'MONTHLY' | 'ANNUAL');
    const amount = cycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
    return { subscriptionId: String(sub._id), planId: String(plan._id), planName: plan.name, billingCycle: cycle, amount, currency: plan.currency ?? 'INR', status: sub.status, renewalDate: sub.renewalDate, provider: platformPaymentProvider.name, testMode: env.PAYMENT_DRIVER !== 'razorpay' };
  }

  async createSubscriptionOrder(societyId: string, userId: string, input: { billingCycle?: 'MONTHLY' | 'ANNUAL' }, req?: any) {
    const sub = await subscriptionEngine.getBySociety(societyId);
    if (sub.status === 'CANCELLED') throw Errors.custom(409, ErrorCodes.SUBSCRIPTION_CANCELLED, 'The subscription is cancelled. Contact support to reactivate it.');
    const quote = await this.quote(societyId, input.billingCycle);
    if (quote.amount <= 0) {
      // free plan: nothing to collect, activate straight away
      if (quote.billingCycle !== sub.billingCycle) {
        sub.billingCycle = quote.billingCycle;
        await sub.save();
      }
      const updated = await subscriptionEngine.activate(sub, { byUserId: userId, note: 'Free plan activation', actorType: 'USER' });
      return { free: true, subscription: updated.toJSON() };
    }
    const society = await Society.findById(societyId).select('name slug').lean();
    const payment = await PlatformPayment.create({ societyId, subscriptionId: sub._id, planId: quote.planId, billingCycle: quote.billingCycle, amount: quote.amount, currency: quote.currency, status: 'PENDING', provider: platformPaymentProvider.name, initiatedBy: userId });
    const created = await platformPaymentProvider.createOrder({ amount: quote.amount, currency: quote.currency, receipt: `sub_${society?.slug ?? societyId}`.slice(0, 40), notes: { societyId, subscriptionId: String(sub._id), planId: quote.planId } });
    await PlatformPayment.updateOne({ _id: payment._id }, { $set: { providerOrderId: created.orderId } });
    const order = await PaymentOrder.create({ societyId, purpose: 'SUBSCRIPTION', referenceId: payment._id, amount: quote.amount, currency: quote.currency, provider: platformPaymentProvider.name, providerOrderId: created.orderId, providerKeyId: created.keyId, userId, expiresAt: dayjs().add(ORDER_TTL_MINUTES, 'minute').toDate(), metadata: { billingCycle: quote.billingCycle, planId: quote.planId } });
    auditService.record({ action: 'subscription.payment_initiated', resource: 'PlatformPayment', resourceId: payment._id, societyId, newValue: { amount: quote.amount, billingCycle: quote.billingCycle, plan: quote.planName }, req });
    return { free: false, orderId: String(order._id), providerOrderId: created.orderId, provider: platformPaymentProvider.name, keyId: created.keyId, amount: quote.amount, currency: quote.currency, planName: quote.planName, billingCycle: quote.billingCycle, expiresAt: order.expiresAt, testMode: quote.testMode };
  }

  async verifySubscriptionOrder(societyId: string, orderId: string, input: { paymentId: string; signature: string }, userId: string, req?: any) {
    const order = await PaymentOrder.findOne({ _id: orderId, societyId, purpose: 'SUBSCRIPTION' });
    if (!order) throw Errors.notFound('Payment order');
    if (order.status === 'PAID' && order.paymentId) {
      const existing = await PlatformPayment.findById(order.paymentId);
      return { payment: existing?.toJSON(), subscription: (await subscriptionEngine.getBySociety(societyId)).toJSON(), alreadyProcessed: true };
    }
    if (order.status !== 'CREATED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `This order is ${order.status.toLowerCase()}; start a new payment`);
    if (!platformPaymentProvider.verifyPaymentSignature({ orderId: order.providerOrderId, paymentId: input.paymentId, signature: input.signature })) {
      auditService.record({ action: 'subscription.payment_verification_failed', resource: 'PaymentOrder', resourceId: order._id, societyId, metadata: { providerOrderId: order.providerOrderId }, req });
      throw Errors.custom(400, ErrorCodes.PAYMENT_VERIFICATION_FAILED, 'Payment could not be verified. If money was deducted it will be reconciled automatically.');
    }
    const payment = await this.completeOrder(order, { providerPaymentId: input.paymentId, byUserId: userId, source: 'client', req });
    return { payment: payment.toJSON(), subscription: (await subscriptionEngine.getBySociety(societyId)).toJSON(), alreadyProcessed: false };
  }

  /** Demo gateway only (see PaymentService.simulateGateway). */
  async simulateSubscriptionGateway(societyId: string, orderId: string, outcome: 'success' | 'failure' = 'success') {
    const order = await PaymentOrder.findOne({ _id: orderId, societyId, purpose: 'SUBSCRIPTION' });
    if (!order) throw Errors.notFound('Payment order');
    if (order.status !== 'CREATED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `This order is ${order.status.toLowerCase()}`);
    if (!(platformPaymentProvider instanceof MockPaymentProvider)) throw Errors.custom(403, ErrorCodes.FEATURE_DISABLED, 'Simulated payments are only available with the demo gateway');
    if (outcome === 'failure') {
      await PaymentOrder.updateOne({ _id: order._id, status: 'CREATED' }, { $set: { status: 'FAILED', failureReason: 'Simulated failure' } });
      await PlatformPayment.updateOne({ _id: order.referenceId, status: 'PENDING' }, { $set: { status: 'FAILED', failureReason: 'Simulated failure' } });
      return { status: 'FAILED' as const };
    }
    const paymentId = `pay_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    return { status: 'PAID' as const, paymentId, signature: platformPaymentProvider.sign(order.providerOrderId, paymentId) };
  }

  /** Marks the platform payment successful and activates / renews the subscription (idempotent through the order claim). */
  async completeOrder(order: PaymentOrderDoc, meta: { providerPaymentId?: string; byUserId?: string; source: 'client' | 'webhook'; req?: any }): Promise<PlatformPaymentDoc> {
    const claimed = await PaymentOrder.findOneAndUpdate({ _id: order._id, status: 'CREATED' }, { $set: { status: 'PAID', providerPaymentId: meta.providerPaymentId, paidAt: new Date() } }, { new: true });
    if (!claimed) {
      for (let i = 0; i < 10; i += 1) {
        const fresh = await PaymentOrder.findById(order._id).lean();
        if (fresh?.paymentId) return (await PlatformPayment.findById(fresh.paymentId))!;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Errors.conflict('Payment is being processed');
    }
    const payment = await PlatformPayment.findById(claimed.referenceId);
    if (!payment) throw Errors.notFound('Platform payment');
    const societyId = String(claimed.societyId);
    payment.status = 'SUCCESS';
    payment.providerPaymentId = meta.providerPaymentId;
    payment.paidAt = new Date();
    payment.method = 'ONLINE';
    payment.receiptNumber = await sequenceService.next(null, 'platform_receipt', { prefix: 'PR', padding: 6, resetPolicy: 'YEARLY' });
    payment.metadata = { ...(payment.metadata ?? {}), verifiedVia: meta.source };
    await payment.save();
    await PaymentOrder.updateOne({ _id: claimed._id }, { $set: { paymentId: payment._id } });
    const sub = await Subscription.findById(payment.subscriptionId);
    if (sub) {
      const cycle = (claimed.metadata as any)?.billingCycle as 'MONTHLY' | 'ANNUAL' | undefined;
      if (cycle && cycle !== sub.billingCycle) {
        sub.billingCycle = cycle;
        await sub.save();
      }
      await subscriptionEngine.activate(sub, { byUserId: meta.byUserId, paymentId: String(payment._id), note: `Online payment ${payment.receiptNumber}`, actorType: meta.byUserId ? 'USER' : 'SYSTEM' });
    }
    const [society, plan] = await Promise.all([Society.findById(societyId).select('name').lean(), Plan.findById(payment.planId).select('name').lean()]);
    auditService.record({ action: 'subscription.payment_received', resource: 'PlatformPayment', resourceId: payment._id, societyId, newValue: { amount: payment.amount, receiptNumber: payment.receiptNumber, provider: payment.provider, via: meta.source }, actor: meta.byUserId ? undefined : { type: 'SYSTEM' }, req: meta.req });
    domainEvents.emit('platform.payment_received', { paymentId: String(payment._id), societyId, societyName: society?.name, planName: plan?.name, amount: payment.amount, billingCycle: payment.billingCycle }, { societyId, actorId: meta.byUserId });
    return payment;
  }

  /** Platform team records an offline (bank transfer / cheque) subscription payment and activates the subscription. */
  async recordOfflinePayment(input: { societyId: string; amount: number; method: string; reference?: string; billingCycle?: 'MONTHLY' | 'ANNUAL'; paidAt?: Date; note?: string }, byUserId: string, req?: any) {
    const sub = await subscriptionEngine.getBySociety(input.societyId);
    if (input.billingCycle && input.billingCycle !== sub.billingCycle) {
      sub.billingCycle = input.billingCycle;
      await sub.save();
    }
    const payment = await PlatformPayment.create({ societyId: input.societyId, subscriptionId: sub._id, planId: sub.planId, billingCycle: sub.billingCycle, amount: input.amount, currency: sub.currency ?? 'INR', status: 'SUCCESS', provider: 'manual', method: input.method, reference: input.reference, paidAt: input.paidAt ?? new Date(), recordedBy: byUserId, receiptNumber: await sequenceService.next(null, 'platform_receipt', { prefix: 'PR', padding: 6, resetPolicy: 'YEARLY' }), metadata: { note: input.note } });
    await subscriptionEngine.activate(sub, { byUserId, paymentId: String(payment._id), note: `Offline payment ${payment.receiptNumber}${input.reference ? ` (${input.reference})` : ''}`, actorType: 'PLATFORM_ADMIN' });
    auditService.record({ action: 'subscription.payment_recorded', resource: 'PlatformPayment', resourceId: payment._id, societyId: input.societyId, newValue: { amount: input.amount, method: input.method, reference: input.reference }, req });
    return payment.toJSON();
  }

  async listForSociety(societyId: string, query: { page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const [items, total] = await Promise.all([PlatformPayment.find({ societyId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('planId', 'name').lean(), PlatformPayment.countDocuments({ societyId })]);
    return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
  }
}

export const platformBillingService = new PlatformBillingService();
