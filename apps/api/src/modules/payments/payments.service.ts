import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Payment, type PaymentDoc } from '../../models/payment.model';
import { PaymentOrder, type PaymentOrderDoc } from '../../models/payment-order.model';
import { WebhookEvent } from '../../models/webhook-event.model';
import { PaymentGatewayConfig } from '../../models/payment-gateway-config.model';
import { Invoice } from '../../models/invoice.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { Society } from '../../models/society.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { encryptSecret, maskString } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { configurationService } from '../../core/configuration/configuration.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';
import { runFinanceHook } from '../../core/hooks/finance-hooks';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { MockPaymentProvider, getSocietyPaymentProvider, platformPaymentProvider, type PaymentProvider } from '../../core/payments/payment-provider';
import { billingService } from '../billing/billing.service';
import { round2 } from '../billing/charge-calculator';
import { platformBillingService } from './platform-billing.service';

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];
const ORDER_TTL_MINUTES = 30;

export interface Scope {
  unitIds?: string[];
}

interface RecordInput {
  unitId: string;
  amount: number;
  method: string;
  receivedAt?: Date;
  reference?: string;
  payerName?: string;
  invoiceIds?: string[];
  bankAccountId?: string;
  notes?: string;
}

interface ProviderMeta {
  provider?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  signatureVerified?: boolean;
  metadata?: Record<string, unknown>;
}

class PaymentService {
  // ------------------------------------------------------------------ allocation
  /** Allocates an amount to the unit's open invoices (explicit list or oldest due first). Returns the leftover. */
  private async allocate(societyId: string, unitId: any, amount: number, invoiceIds?: string[]) {
    const filter: Record<string, unknown> = { societyId, unitId, status: { $in: OPEN_STATUSES }, balanceDue: { $gt: 0 } };
    if (invoiceIds?.length) filter._id = { $in: invoiceIds };
    const invoices = await Invoice.find(filter).sort({ dueDate: 1, createdAt: 1 });
    if (invoiceIds?.length && invoices.length !== new Set(invoiceIds.map(String)).size) throw Errors.validation({ invoiceIds: ['One or more invoices are not open invoices of this unit'] });
    const allocations: { invoiceId: any; invoiceNumber: string; amount: number }[] = [];
    let remaining = round2(amount);
    const now = new Date();
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const alloc = round2(Math.min(remaining, inv.balanceDue));
      inv.amountPaid = round2(inv.amountPaid + alloc);
      inv.balanceDue = round2(inv.balanceDue - alloc);
      if (inv.balanceDue <= 0) {
        inv.balanceDue = 0;
        inv.status = 'PAID';
        inv.paidAt = now;
      } else if (inv.status !== 'OVERDUE') {
        inv.status = 'PARTIALLY_PAID';
      }
      await inv.save();
      allocations.push({ invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, amount: alloc });
      remaining = round2(remaining - alloc);
    }
    return { allocations, unallocated: remaining };
  }

  /** Reverses allocations (used by refunds): newest allocation first. */
  private async deallocate(payment: PaymentDoc, amount: number): Promise<void> {
    let remaining = round2(amount);
    const fromAdvance = Math.min(remaining, payment.unallocatedAmount);
    payment.unallocatedAmount = round2(payment.unallocatedAmount - fromAdvance);
    remaining = round2(remaining - fromAdvance);
    const now = new Date();
    for (let i = payment.allocations.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const alloc = payment.allocations[i];
      const r = round2(Math.min(remaining, alloc.amount));
      const inv = await Invoice.findById(alloc.invoiceId);
      if (inv) {
        inv.amountPaid = round2(Math.max(0, inv.amountPaid - r));
        inv.balanceDue = round2(inv.total - inv.amountPaid);
        inv.paidAt = null as any;
        if (inv.status !== 'CANCELLED') inv.status = inv.amountPaid > 0 ? 'PARTIALLY_PAID' : inv.dueDate && dayjs(inv.dueDate).isBefore(now) && inv.overdueAt ? 'OVERDUE' : 'ISSUED';
        await inv.save();
      }
      alloc.amount = round2(alloc.amount - r);
      remaining = round2(remaining - r);
    }
    payment.allocations = payment.allocations.filter((a) => a.amount > 0) as any;
  }

  // ------------------------------------------------------------------ record (offline or verified online)
  async recordPayment(societyId: string, input: RecordInput, byUserId: string | null, req?: any, meta: ProviderMeta = {}): Promise<PaymentDoc> {
    const unit = await Unit.findOne({ _id: input.unitId, societyId, deletedAt: null }).lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    const cfg = await billingService.getConfig(societyId);
    const paymentsCfg = await configurationService.getSocietySetting<{ allowPartialPayments: boolean }>(societyId, 'payments.config');
    const receivedAt = input.receivedAt ?? new Date();
    if (!paymentsCfg.allowPartialPayments && input.invoiceIds?.length) {
      const selected = await Invoice.find({ _id: { $in: input.invoiceIds }, societyId, unitId: unit._id }).select('balanceDue').lean();
      const due = round2(selected.reduce((s, i) => s + i.balanceDue, 0));
      if (round2(input.amount) < due) throw Errors.conflict(`Partial payments are not allowed. The selected invoices need ₹${due}.`);
    }
    const { allocations, unallocated } = await this.allocate(societyId, unit._id, input.amount, input.invoiceIds);
    const resident = await Resident.findOne({ societyId, unitId: unit._id, status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1, type: 1 }).select('name').lean();
    const general = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    const [paymentNumber, receiptNumber] = await Promise.all([
      sequenceService.next(societyId, 'payment', { prefix: 'PAY', padding: 6 }),
      sequenceService.next(societyId, 'receipt', { prefix: cfg.receiptPrefix || 'RCP', padding: 5, resetPolicy: 'FISCAL_YEAR', fiscalYearStartMonth: general.financialYearStartMonth }),
    ]);
    const payment = await Payment.create({
      societyId,
      paymentNumber,
      receiptNumber,
      unitId: unit._id,
      residentId: resident?._id ?? null,
      payerName: input.payerName ?? resident?.name,
      amount: round2(input.amount),
      currency: 'INR',
      method: input.method,
      provider: meta.provider ?? 'manual',
      providerOrderId: meta.providerOrderId,
      providerPaymentId: meta.providerPaymentId,
      signatureVerified: meta.signatureVerified ?? false,
      status: 'SUCCESS',
      allocations,
      unallocatedAmount: unallocated,
      receivedAt,
      reference: input.reference,
      bankAccountId: input.bankAccountId ?? null,
      notes: input.notes,
      recordedBy: byUserId,
      metadata: meta.metadata ?? {},
    });
    await billingService.addLedgerEntry({ societyId, unitId: unit._id, date: receivedAt, type: 'PAYMENT', refType: 'Payment', refId: payment._id, refNumber: receiptNumber, description: `Payment ${receiptNumber} (${input.method})${unallocated > 0 ? ` · advance ₹${unallocated}` : ''}`, credit: payment.amount, createdBy: byUserId ?? undefined });
    await runFinanceHook('onPaymentReceived', payment.toObject(), { societyId, byUserId: byUserId ?? undefined });
    auditService.record({ action: 'payment.recorded', resource: 'Payment', resourceId: payment._id, societyId, newValue: { receiptNumber, unit: unit.code, amount: payment.amount, method: input.method, provider: payment.provider, allocations: allocations.length, unallocated }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    domainEvents.emit('payment.received', { paymentId: String(payment._id), receiptNumber, paymentNumber, unitId: String(unit._id), unitCode: unit.code, amount: payment.amount, method: input.method, provider: payment.provider, invoiceIds: allocations.map((a) => String(a.invoiceId)) }, { societyId, actorId: byUserId });
    return payment;
  }

  // ------------------------------------------------------------------ online orders
  async createOrder(societyId: string, input: { unitId?: string; invoiceIds?: string[]; amount?: number }, user: { userId: string; ownScope: boolean; unitIds: string[] }, req?: any) {
    let unitId = input.unitId;
    if (user.ownScope) {
      if (unitId && !user.unitIds.includes(unitId)) throw Errors.notFound('Unit');
      if (!unitId) {
        if (user.unitIds.length !== 1) throw Errors.validation({ unitId: ['Select which unit you are paying for'] });
        unitId = user.unitIds[0];
      }
    }
    if (!unitId) throw Errors.validation({ unitId: ['Unit is required'] });
    const unit = await Unit.findOne({ _id: unitId, societyId, deletedAt: null }).select('code').lean();
    if (!unit) throw Errors.notFound('Unit');
    const { provider, config } = await getSocietyPaymentProvider(societyId);
    let purpose: 'INVOICE' | 'ADVANCE' = 'INVOICE';
    let baseAmount = 0;
    let invoiceIds: any[] = [];
    if (input.amount && !input.invoiceIds?.length) {
      purpose = 'ADVANCE';
      baseAmount = round2(input.amount);
    } else {
      const filter: Record<string, unknown> = { societyId, unitId: unit._id, status: { $in: OPEN_STATUSES }, balanceDue: { $gt: 0 } };
      if (input.invoiceIds?.length) filter._id = { $in: input.invoiceIds };
      const invoices = await Invoice.find(filter).select('balanceDue').lean();
      if (input.invoiceIds?.length && invoices.length !== new Set(input.invoiceIds).size) throw Errors.validation({ invoiceIds: ['One or more invoices are not payable'] });
      if (!invoices.length) throw Errors.conflict('There are no outstanding invoices to pay');
      baseAmount = round2(invoices.reduce((s, i) => s + i.balanceDue, 0));
      invoiceIds = invoices.map((i) => i._id);
    }
    if (baseAmount < 1) throw Errors.validation({ amount: ['Amount must be at least ₹1'] });
    const fee = round2((baseAmount * (config.convenienceFeePercent ?? 0)) / 100);
    const total = round2(baseAmount + fee);
    const receipt = `${unit.code}-${Date.now().toString(36)}`.slice(0, 40);
    const createdOrder = await provider.createOrder({ amount: total, currency: 'INR', receipt, notes: { societyId, unitId: String(unit._id), purpose } });
    const order = await PaymentOrder.create({ societyId, purpose, unitId: unit._id, invoiceIds, amount: total, currency: 'INR', provider: provider.name, providerOrderId: createdOrder.orderId, providerKeyId: createdOrder.keyId, userId: user.userId, expiresAt: dayjs().add(ORDER_TTL_MINUTES, 'minute').toDate(), metadata: { baseAmount, convenienceFee: fee, unitCode: unit.code } });
    auditService.record({ action: 'payment.order_created', resource: 'PaymentOrder', resourceId: order._id, societyId, newValue: { unit: unit.code, amount: total, purpose, provider: provider.name }, req });
    return { orderId: String(order._id), providerOrderId: createdOrder.orderId, provider: provider.name, keyId: createdOrder.keyId, amount: total, baseAmount, convenienceFee: fee, currency: 'INR', purpose, unitId: String(unit._id), invoiceIds: invoiceIds.map(String), expiresAt: order.expiresAt, displayName: config.displayName, testMode: config.testMode, allowedMethods: config.allowedMethods };
  }

  /** Client-side checkout callback. The signature is verified server-side before anything is recorded. */
  async verifyOrder(societyId: string, orderId: string, input: { paymentId: string; signature: string }, user: { userId: string; ownScope: boolean }, req?: any) {
    const order = await PaymentOrder.findOne({ _id: orderId, societyId, purpose: { $in: ['INVOICE', 'ADVANCE'] } });
    if (!order || (user.ownScope && String(order.userId) !== user.userId)) throw Errors.notFound('Payment order');
    if (order.status === 'PAID' && order.paymentId) return { payment: (await Payment.findById(order.paymentId))!.toJSON(), alreadyProcessed: true };
    if (order.status !== 'CREATED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `This order is ${order.status.toLowerCase()}; start a new payment`);
    const { provider } = await getSocietyPaymentProvider(societyId);
    if (!provider.verifyPaymentSignature({ orderId: order.providerOrderId, paymentId: input.paymentId, signature: input.signature })) {
      auditService.record({ action: 'payment.verification_failed', resource: 'PaymentOrder', resourceId: order._id, societyId, metadata: { providerOrderId: order.providerOrderId, providerPaymentId: input.paymentId }, req });
      logger.warn({ societyId, orderId: order.providerOrderId }, 'Payment signature verification failed');
      throw Errors.custom(400, ErrorCodes.PAYMENT_VERIFICATION_FAILED, 'Payment could not be verified. If money was deducted it will be reconciled automatically.');
    }
    const payment = await this.markOrderPaid(order, { providerPaymentId: input.paymentId, provider, source: 'client', req });
    return { payment: payment.toJSON(), alreadyProcessed: false };
  }

  /** Atomically claims the order (CREATED → PAID) so client callback and webhook cannot both record it. */
  private async markOrderPaid(order: PaymentOrderDoc, meta: { providerPaymentId?: string; provider: PaymentProvider; source: 'client' | 'webhook'; req?: any }): Promise<PaymentDoc> {
    const claimed = await PaymentOrder.findOneAndUpdate({ _id: order._id, status: 'CREATED' }, { $set: { status: 'PAID', providerPaymentId: meta.providerPaymentId, paidAt: new Date() } }, { new: true });
    if (!claimed) {
      // lost the race: wait for the other writer to attach the payment
      for (let i = 0; i < 10; i += 1) {
        const fresh = await PaymentOrder.findById(order._id).lean();
        if (fresh?.paymentId) return (await Payment.findById(fresh.paymentId))!;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw Errors.conflict('Payment is being processed');
    }
    const baseAmount = Number((claimed.metadata as any)?.baseAmount ?? claimed.amount);
    const payment = await this.recordPayment(
      String(claimed.societyId),
      { unitId: String(claimed.unitId), amount: baseAmount, method: 'ONLINE', invoiceIds: claimed.invoiceIds.map(String), receivedAt: new Date(), reference: meta.providerPaymentId },
      String(claimed.userId),
      meta.req,
      { provider: meta.provider.name, providerOrderId: claimed.providerOrderId, providerPaymentId: meta.providerPaymentId, signatureVerified: true, metadata: { orderId: String(claimed._id), grossAmount: claimed.amount, convenienceFee: (claimed.metadata as any)?.convenienceFee ?? 0, verifiedVia: meta.source } },
    );
    await PaymentOrder.updateOne({ _id: claimed._id }, { $set: { paymentId: payment._id } });
    return payment;
  }

  /**
   * Demo gateway only: plays the role of the payment gateway's checkout and returns what it would hand
   * back to the browser (payment id + HMAC signature). The client still goes through /verify, so the
   * server-side verification path is exercised end to end. Refused for real providers.
   */
  async simulateGateway(societyId: string, orderId: string, user: { userId: string; ownScope: boolean }, outcome: 'success' | 'failure' = 'success') {
    const order = await PaymentOrder.findOne({ _id: orderId, societyId, purpose: { $in: ['INVOICE', 'ADVANCE'] } });
    if (!order || (user.ownScope && String(order.userId) !== user.userId)) throw Errors.notFound('Payment order');
    if (order.status !== 'CREATED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `This order is ${order.status.toLowerCase()}`);
    const { provider } = await getSocietyPaymentProvider(societyId);
    if (!(provider instanceof MockPaymentProvider)) throw Errors.custom(403, ErrorCodes.FEATURE_DISABLED, 'Simulated payments are only available with the demo gateway');
    if (outcome === 'failure') {
      await PaymentOrder.updateOne({ _id: order._id, status: 'CREATED' }, { $set: { status: 'FAILED', failureReason: 'Simulated failure' } });
      return { status: 'FAILED' as const };
    }
    const paymentId = `pay_mock_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
    return { status: 'PAID' as const, paymentId, signature: provider.sign(order.providerOrderId, paymentId) };
  }

  async listOrders(societyId: string, query: Record<string, any>, user: { userId: string; ownScope: boolean }) {
    const filter: Record<string, unknown> = { societyId, purpose: { $in: ['INVOICE', 'ADVANCE'] } };
    if (user.ownScope) filter.userId = user.userId;
    if (query.status) filter.status = query.status;
    return paginate(PaymentOrder as any, filter, { page: query.page, limit: query.limit, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'amount', 'status'], select: '-metadata' });
  }

  // ------------------------------------------------------------------ webhooks (idempotent)
  async handleWebhook(input: { scope: 'society' | 'platform'; societyId?: string; providerName: string; rawBody: Buffer | string; signature?: string; payload: any }): Promise<{ status: string; eventId?: string }> {
    let provider: PaymentProvider;
    if (input.scope === 'platform') provider = platformPaymentProvider;
    else {
      try {
        provider = (await getSocietyPaymentProvider(input.societyId!)).provider;
      } catch {
        throw Errors.custom(404, ErrorCodes.NOT_FOUND, 'Unknown payment gateway configuration');
      }
    }
    if (provider.name !== input.providerName) throw Errors.custom(404, ErrorCodes.NOT_FOUND, 'Unknown provider');
    const parsed = provider.parseWebhook(input.payload);
    // signature first: an unsigned request must never be able to "reserve" a genuine event id
    if (!provider.verifyWebhookSignature(input.rawBody, input.signature)) {
      auditService.record({ action: 'payment.webhook_rejected', resource: 'WebhookEvent', societyId: input.societyId ?? null, metadata: { provider: provider.name, type: parsed.type, eventId: parsed.eventId }, actor: { type: 'SYSTEM' } });
      logger.warn({ provider: provider.name, scope: input.scope, type: parsed.type }, 'Webhook rejected: invalid signature');
      throw Errors.custom(401, ErrorCodes.WEBHOOK_SIGNATURE_INVALID, 'Webhook signature is invalid');
    }
    if (await WebhookEvent.exists({ provider: provider.name, eventId: parsed.eventId })) return { status: 'DUPLICATE', eventId: parsed.eventId };
    let event;
    try {
      event = await WebhookEvent.create({ provider: provider.name, eventId: parsed.eventId, type: parsed.type, scope: input.scope, societyId: input.societyId ?? null, signatureValid: true, payload: input.payload, status: 'IGNORED' });
    } catch (err: any) {
      if (err?.code === 11000) return { status: 'DUPLICATE', eventId: parsed.eventId };
      throw err;
    }
    try {
      let status = 'IGNORED';
      if (parsed.status === 'PAID' && parsed.orderId) {
        const order = await PaymentOrder.findOne({ providerOrderId: parsed.orderId });
        if (order && order.status === 'CREATED') {
          if (order.purpose === 'SUBSCRIPTION') await platformBillingService.completeOrder(order, { providerPaymentId: parsed.paymentId, source: 'webhook' });
          else await this.markOrderPaid(order, { providerPaymentId: parsed.paymentId, provider, source: 'webhook' });
          status = 'PROCESSED';
        } else if (order) status = 'PROCESSED'; // already handled by the client callback
      } else if (parsed.status === 'FAILED' && parsed.orderId) {
        await PaymentOrder.updateOne({ providerOrderId: parsed.orderId, status: 'CREATED' }, { $set: { status: 'FAILED', failureReason: parsed.type } });
        status = 'PROCESSED';
      } else if (parsed.status === 'REFUNDED' && parsed.paymentId && input.scope === 'society') {
        const payment = await Payment.findOne({ providerPaymentId: parsed.paymentId, status: 'SUCCESS' });
        if (payment && !payment.refund?.at) {
          await this.applyRefund(payment, parsed.amount ?? payment.amount, 'Refunded at the payment gateway', null, undefined);
          status = 'PROCESSED';
        }
      }
      event.status = status as any;
      event.processedAt = new Date();
      await event.save();
      return { status, eventId: parsed.eventId };
    } catch (err) {
      event.status = 'FAILED';
      event.error = (err as Error).message;
      await event.save();
      throw err;
    }
  }

  // ------------------------------------------------------------------ refunds
  private async applyRefund(payment: PaymentDoc, amount: number, reason: string, byUserId: string | null, providerRefundId?: string, req?: any): Promise<PaymentDoc> {
    await this.deallocate(payment, amount);
    payment.set('refund', { amount, reason, at: new Date(), by: byUserId, providerRefundId });
    if (amount >= payment.amount) payment.status = 'REFUNDED';
    await payment.save();
    const societyId = String(payment.societyId);
    await billingService.addLedgerEntry({ societyId, unitId: payment.unitId, date: new Date(), type: 'REFUND', refType: 'PaymentRefund', refId: payment._id, refNumber: payment.receiptNumber ?? payment.paymentNumber, description: `Refund against ${payment.receiptNumber ?? payment.paymentNumber}: ${reason}`, debit: amount, createdBy: byUserId ?? undefined });
    await runFinanceHook('onPaymentRefunded', payment.toObject(), { societyId, byUserId: byUserId ?? undefined, amount });
    auditService.record({ action: 'payment.refunded', resource: 'Payment', resourceId: payment._id, societyId, newValue: { amount, reason, providerRefundId }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    domainEvents.emit('payment.refunded', { paymentId: String(payment._id), receiptNumber: payment.receiptNumber, unitId: String(payment.unitId), amount, reason }, { societyId, actorId: byUserId });
    return payment;
  }

  async refund(societyId: string, id: string, input: { amount?: number; reason: string }, byUserId: string, req?: any) {
    const payment = await Payment.findOne({ _id: id, societyId });
    if (!payment) throw Errors.notFound('Payment');
    if (payment.status !== 'SUCCESS') throw Errors.invalidTransition(payment.status, 'REFUNDED', 'Payment');
    if (payment.refund?.at) throw Errors.conflict('This payment already has a refund');
    const amount = round2(input.amount ?? payment.amount);
    if (amount > payment.amount) throw Errors.validation({ amount: [`Refund cannot exceed the payment amount (₹${payment.amount})`] });
    let providerRefundId: string | undefined;
    if (payment.provider !== 'manual' && payment.providerPaymentId) {
      const { provider } = await getSocietyPaymentProvider(societyId);
      providerRefundId = (await provider.refund({ paymentId: payment.providerPaymentId, amount, notes: { reason: input.reason } })).refundId;
    }
    return (await this.applyRefund(payment, amount, input.reason, byUserId, providerRefundId, req)).toJSON();
  }

  // ------------------------------------------------------------------ queries
  async list(societyId: string, query: Record<string, any>, scope: Scope = {}) {
    const filter: Record<string, unknown> = { societyId };
    if (scope.unitIds) filter.unitId = { $in: scope.unitIds };
    if (query.unitId) filter.unitId = scope.unitIds ? { $in: scope.unitIds.filter((u) => u === query.unitId) } : query.unitId;
    if (query.status) filter.status = query.status;
    if (query.method) filter.method = query.method;
    if (query.provider) filter.provider = query.provider;
    if (query.reconciled !== undefined) filter.reconciled = query.reconciled;
    if (query.from || query.to) filter.receivedAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ receiptNumber: rx }, { paymentNumber: rx }, { reference: rx }, { payerName: rx }, { providerPaymentId: rx }];
    return paginate(Payment as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-receivedAt', allowedSorts: ['receivedAt', 'amount', 'status', 'method', 'createdAt'], populate: [{ path: 'unitId', select: 'code buildingId', populate: { path: 'buildingId', select: 'name' } }, { path: 'recordedBy', select: 'name' }] });
  }

  async get(societyId: string, id: string, scope: Scope = {}) {
    const payment = await Payment.findOne({ _id: id, societyId }).populate('unitId', 'code number buildingId').populate('residentId', 'name phone email').populate('recordedBy', 'name').lean();
    if (!payment) throw Errors.notFound('Payment');
    if (scope.unitIds && !scope.unitIds.includes(String((payment.unitId as any)?._id ?? payment.unitId))) throw Errors.notFound('Payment');
    return { ...payment, id: String(payment._id) };
  }

  /** Data for the printable receipt (society letterhead + allocations). */
  async receipt(societyId: string, id: string, scope: Scope = {}) {
    const payment = await this.get(societyId, id, scope);
    const [society, cfg] = await Promise.all([Society.findById(societyId).select('name registrationNumber address contact logoUrl').lean(), billingService.getConfig(societyId)]);
    const invoices = await Invoice.find({ _id: { $in: payment.allocations.map((a: any) => a.invoiceId) } }).select('invoiceNumber period total balanceDue status dueDate').lean();
    return { payment, society, config: { receiptPrefix: cfg.receiptPrefix, taxLabel: cfg.taxLabel }, invoices: invoices.map((i) => ({ ...i, id: String(i._id) })) };
  }

  async reconcile(societyId: string, id: string, input: { reconciled: boolean; bankTransactionId?: string; note?: string }, byUserId: string, req?: any) {
    const payment = await Payment.findOne({ _id: id, societyId });
    if (!payment) throw Errors.notFound('Payment');
    payment.reconciled = input.reconciled;
    payment.reconciledAt = input.reconciled ? new Date() : (null as any);
    payment.bankTransactionId = (input.bankTransactionId ?? null) as any;
    if (input.note) payment.notes = `${payment.notes ? `${payment.notes}\n` : ''}Reconciliation: ${input.note}`;
    await payment.save();
    auditService.record({ action: 'payment.reconciled', resource: 'Payment', resourceId: payment._id, societyId, newValue: { reconciled: input.reconciled, by: byUserId }, req });
    return payment.toJSON();
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const monthStart = dayjs().startOf('month').toDate();
    const [month, byMethod, unreconciled, refunds, trend] = await Promise.all([
      Payment.aggregate([{ $match: { societyId: sid, status: { $in: ['SUCCESS', 'REFUNDED'] }, receivedAt: { $gte: monthStart } } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { societyId: sid, status: { $in: ['SUCCESS', 'REFUNDED'] }, receivedAt: { $gte: dayjs().subtract(90, 'day').toDate() } } }, { $group: { _id: '$method', amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
      Payment.countDocuments({ societyId, status: 'SUCCESS', reconciled: false, method: { $in: ['CHEQUE', 'BANK_TRANSFER', 'ONLINE', 'UPI', 'CARD', 'NETBANKING', 'WALLET'] } }),
      Payment.aggregate([{ $match: { societyId: sid, 'refund.at': { $gte: monthStart } } }, { $group: { _id: null, amount: { $sum: '$refund.amount' }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { societyId: sid, status: { $in: ['SUCCESS', 'REFUNDED'] }, receivedAt: { $gte: dayjs().subtract(5, 'month').startOf('month').toDate() } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$receivedAt' } }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    const online = byMethod.filter((m) => ['ONLINE', 'UPI', 'CARD', 'NETBANKING', 'WALLET'].includes(m._id)).reduce((s, m) => s + m.amount, 0);
    const offline = byMethod.filter((m) => !['ONLINE', 'UPI', 'CARD', 'NETBANKING', 'WALLET'].includes(m._id)).reduce((s, m) => s + m.amount, 0);
    return { collectedThisMonth: round2(month[0]?.amount ?? 0), paymentsThisMonth: month[0]?.count ?? 0, byMethod: byMethod.map((m) => ({ method: m._id, amount: round2(m.amount), count: m.count })), onlineShare: online + offline > 0 ? Math.round((online / (online + offline)) * 100) : 0, unreconciled, refundsThisMonth: round2(refunds[0]?.amount ?? 0), trend: trend.map((t) => ({ month: t._id, amount: round2(t.amount), count: t.count })) };
  }

  async exportRows(societyId: string, query: Record<string, any>) {
    const rows: any[] = [];
    let pageNo = 1;
    while (rows.length < 5000) {
      const page = await this.list(societyId, { ...query, limit: 200, page: pageNo });
      rows.push(...page.items.map((p: any) => ({ receiptNumber: p.receiptNumber, paymentNumber: p.paymentNumber, unit: p.unitId?.code ?? '', building: p.unitId?.buildingId?.name ?? '', payer: p.payerName ?? '', amount: p.amount, method: p.method, provider: p.provider, reference: p.reference ?? p.providerPaymentId ?? '', receivedAt: dayjs(p.receivedAt).format('YYYY-MM-DD'), status: p.status, allocated: round2(p.amount - (p.unallocatedAmount ?? 0)), advance: p.unallocatedAmount ?? 0, reconciled: p.reconciled ? 'yes' : 'no', refund: p.refund?.amount ?? '' })));
      if (pageNo >= page.pages) break;
      pageNo += 1;
    }
    return rows;
  }

  // ------------------------------------------------------------------ gateway configuration
  async getGatewayConfig(societyId: string) {
    const cfg = await PaymentGatewayConfig.findOne({ societyId }).select('+keySecretEncrypted +webhookSecretEncrypted').lean();
    if (!cfg) return { provider: 'mock', enabled: false, displayName: 'Online payment', keyId: '', hasKeySecret: false, hasWebhookSecret: false, testMode: true, allowedMethods: ['UPI', 'CARD', 'NETBANKING', 'WALLET'], convenienceFeePercent: 0 };
    return { id: String(cfg._id), provider: cfg.provider, enabled: cfg.enabled, displayName: cfg.displayName, keyId: cfg.keyId ?? '', keyIdMasked: maskString(cfg.keyId, 6), hasKeySecret: Boolean(cfg.keySecretEncrypted), hasWebhookSecret: Boolean(cfg.webhookSecretEncrypted), testMode: cfg.testMode, allowedMethods: cfg.allowedMethods, convenienceFeePercent: cfg.convenienceFeePercent, updatedAt: cfg.updatedAt };
  }

  async setGatewayConfig(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const existing = await PaymentGatewayConfig.findOne({ societyId }).select('+keySecretEncrypted +webhookSecretEncrypted');
    const doc = existing ?? new PaymentGatewayConfig({ societyId });
    doc.provider = input.provider;
    doc.enabled = input.enabled;
    doc.displayName = input.displayName ?? doc.displayName;
    doc.testMode = input.testMode ?? doc.testMode;
    doc.allowedMethods = input.allowedMethods ?? doc.allowedMethods;
    doc.convenienceFeePercent = input.convenienceFeePercent ?? doc.convenienceFeePercent;
    if (input.keyId !== undefined) doc.keyId = input.keyId;
    if (input.keySecret) doc.keySecretEncrypted = encryptSecret(input.keySecret);
    if (input.webhookSecret) doc.webhookSecretEncrypted = encryptSecret(input.webhookSecret);
    if (doc.enabled && doc.provider === 'razorpay' && (!doc.keyId || !doc.keySecretEncrypted)) throw Errors.validation({ keySecret: ['Key ID and Key Secret are required to enable Razorpay'] });
    doc.updatedBy = byUserId as any;
    await doc.save();
    await configurationService.setSocietySetting(societyId, 'payments.config', { onlinePaymentsEnabled: doc.enabled }, byUserId);
    auditService.record({ action: 'payment.gateway_updated', resource: 'PaymentGatewayConfig', resourceId: doc._id, societyId, newValue: { provider: doc.provider, enabled: doc.enabled, testMode: doc.testMode, keyId: maskString(doc.keyId, 6), secretRotated: Boolean(input.keySecret) }, req });
    return this.getGatewayConfig(societyId);
  }

  /** What a member's checkout needs (never secrets). */
  async publicGatewayInfo(societyId: string) {
    const cfg = await PaymentGatewayConfig.findOne({ societyId }).lean();
    if (!cfg || !cfg.enabled) return { enabled: false };
    return { enabled: true, provider: cfg.provider, displayName: cfg.displayName, keyId: cfg.keyId, testMode: cfg.testMode, allowedMethods: cfg.allowedMethods, convenienceFeePercent: cfg.convenienceFeePercent };
  }

  // ------------------------------------------------------------------ jobs
  async expireStaleOrders(now = new Date()): Promise<number> {
    const r = await PaymentOrder.updateMany({ status: 'CREATED', expiresAt: { $lt: now } }, { $set: { status: 'EXPIRED' } });
    return r.modifiedCount;
  }

  /** Reconciles CREATED orders whose provider can report status (covers lost webhooks / closed browsers). */
  async reconcilePendingOrders(): Promise<{ expired: number; recovered: number }> {
    const expired = await this.expireStaleOrders();
    let recovered = 0;
    const pending = await PaymentOrder.find({ status: 'CREATED', providerPaymentId: { $exists: true, $ne: null } }).limit(200);
    for (const order of pending) {
      try {
        const provider = order.purpose === 'SUBSCRIPTION' ? platformPaymentProvider : (await getSocietyPaymentProvider(String(order.societyId))).provider;
        if (!provider.fetchPaymentStatus || !order.providerPaymentId) continue;
        const status = await provider.fetchPaymentStatus(order.providerPaymentId);
        if (status.status === 'PAID' && status.orderId === order.providerOrderId) {
          if (order.purpose === 'SUBSCRIPTION') await platformBillingService.completeOrder(order, { providerPaymentId: order.providerPaymentId, source: 'webhook' });
          else await this.markOrderPaid(order, { providerPaymentId: order.providerPaymentId, provider, source: 'webhook' });
          recovered += 1;
        }
      } catch (err) {
        logger.warn({ err, orderId: String(order._id) }, 'Order reconciliation failed');
      }
    }
    return { expired, recovered };
  }
}

export const paymentService = new PaymentService();

registerJobHandlers(() => {
  jobQueue.register(JobNames.PAYMENT_RECONCILE, async () => {
    const r = await paymentService.reconcilePendingOrders();
    if (r.expired || r.recovered) logger.info(r, 'Payment order reconciliation');
  });
});
