import dayjs from 'dayjs';
import type { ClientSession } from 'mongoose';
import { ErrorCodes, SubscriptionStatus, type SubscriptionAccess, type BillingCycle } from '@society-erp/shared';
import { Subscription, type SubscriptionDoc } from '../../models/subscription.model';
import { Plan } from '../../models/plan.model';
import { Society } from '../../models/society.model';
import { accessCache, invalidationBus } from '../../lib/cache';
import { Errors } from '../../lib/errors';
import { configurationService } from '../configuration/configuration.service';
import { domainEvents } from '../events/event-bus';
import { auditService } from '../audit/audit.service';
import { logger } from '../../lib/logger';

type Status = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Default transition rules; overridable through platform setting `subscription.transitions`. */
export const DEFAULT_TRANSITIONS: Record<Status, Status[]> = {
  TRIALING: ['ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
  ACTIVE: ['PAST_DUE', 'EXPIRED', 'SUSPENDED', 'CANCELLED', 'ACTIVE'],
  PAST_DUE: ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
  EXPIRED: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'TRIALING'],
  SUSPENDED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  CANCELLED: ['ACTIVE', 'TRIALING'],
};

const BLOCKED: Status[] = ['EXPIRED', 'SUSPENDED', 'CANCELLED'];

export function addCycle(date: Date, cycle: BillingCycle): Date {
  return cycle === 'ANNUAL' ? dayjs(date).add(1, 'year').toDate() : dayjs(date).add(1, 'month').toDate();
}

class SubscriptionEngine {
  // ------------------------------------------------------------------ access
  async getAccess(societyId: string): Promise<SubscriptionAccess> {
    return accessCache.getOrSet(`access:subscription:${societyId}`, async () => {
      const sub = await Subscription.findOne({ societyId }).lean();
      if (!sub) return { status: 'NONE', readOnly: false, blocked: true } satisfies SubscriptionAccess;
      const plan = await configurationService.getPlanConfiguration(String(sub.planId));
      const behavior = await configurationService.getPlatformSetting<string>('subscription.pastDueBehavior', 'READ_ONLY');
      const status = sub.status as Status;
      const readOnly = status === 'PAST_DUE' && behavior === 'READ_ONLY';
      const blocked = BLOCKED.includes(status) || (status === 'PAST_DUE' && behavior === 'BLOCK');
      const anchor = status === 'TRIALING' && sub.trialEndDate ? sub.trialEndDate : sub.renewalDate;
      return {
        status,
        readOnly,
        blocked,
        renewalDate: sub.renewalDate?.toISOString() ?? null,
        trialEndDate: sub.trialEndDate?.toISOString() ?? null,
        gracePeriodEndsAt: sub.gracePeriodEndsAt?.toISOString() ?? null,
        planName: plan?.name,
        planId: plan ? String(plan._id) : undefined,
        daysRemaining: anchor ? dayjs(anchor).startOf('day').diff(dayjs().startOf('day'), 'day') : null,
      } satisfies SubscriptionAccess;
    });
  }

  async invalidate(societyId: string): Promise<void> {
    await invalidationBus.invalidate('access:subscription', societyId);
    await invalidationBus.invalidate('access:modules', societyId);
    await invalidationBus.invalidate('access:tenant', '*');
  }

  // ------------------------------------------------------------------ creation
  async createForSociety(input: {
    societyId: string;
    planId: string;
    billingCycle: BillingCycle;
    byUserId?: string;
    startTrial?: boolean;
    trialDaysOverride?: number;
    session?: ClientSession;
  }): Promise<SubscriptionDoc> {
    const plan = await Plan.findById(input.planId);
    if (!plan || plan.status !== 'ACTIVE') throw Errors.custom(400, ErrorCodes.PLAN_UNAVAILABLE, 'Selected plan is not available');
    const now = new Date();
    const platformTrial = await configurationService.getPlatformSetting<number>('subscription.defaultTrialDays', 14);
    const trialDays = input.trialDaysOverride ?? (plan.trialDays > 0 ? plan.trialDays : platformTrial);
    const startTrial = input.startTrial ?? trialDays > 0;
    const amount = input.billingCycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
    const trialEnd = startTrial ? dayjs(now).add(trialDays, 'day').toDate() : undefined;
    const status: Status = startTrial ? 'TRIALING' : 'ACTIVE';
    const [sub] = await Subscription.create(
      [
        {
          societyId: input.societyId,
          planId: plan._id,
          billingCycle: input.billingCycle,
          status,
          startDate: now,
          renewalDate: startTrial ? trialEnd : addCycle(now, input.billingCycle),
          trialEndDate: trialEnd,
          amount,
          currency: plan.currency,
          paymentStatus: startTrial ? 'NA' : 'PENDING',
          history: [{ status, at: now, byUserId: input.byUserId, note: startTrial ? `Trial started (${trialDays} days)` : 'Subscription created', planId: plan._id }],
          updatedBy: input.byUserId,
        },
      ],
      { session: input.session },
    );
    await this.invalidate(input.societyId);
    domainEvents.emit('subscription.created', { subscriptionId: String(sub._id), societyId: input.societyId, status }, { societyId: input.societyId });
    return sub;
  }

  // ------------------------------------------------------------------ transitions
  private async assertTransition(sub: SubscriptionDoc, to: Status): Promise<void> {
    const rules = await configurationService.getPlatformSetting<Record<Status, Status[]>>('subscription.transitions', DEFAULT_TRANSITIONS);
    const allowed = rules[sub.status as Status] ?? DEFAULT_TRANSITIONS[sub.status as Status] ?? [];
    if (!allowed.includes(to)) throw Errors.invalidTransition(sub.status, to, 'Subscription');
  }

  private async transition(
    sub: SubscriptionDoc,
    to: Status,
    changes: Partial<Record<string, unknown>>,
    meta: { byUserId?: string; note?: string; actorType?: 'USER' | 'PLATFORM_ADMIN' | 'SYSTEM'; event?: string },
  ): Promise<SubscriptionDoc> {
    await this.assertTransition(sub, to);
    const from = sub.status;
    const snapshot = { status: sub.status, renewalDate: sub.renewalDate, planId: String(sub.planId), billingCycle: sub.billingCycle };
    sub.set({ ...changes, status: to, updatedBy: meta.byUserId });
    sub.history.push({ status: to, at: new Date(), byUserId: meta.byUserId as any, note: meta.note, planId: sub.planId } as any);
    await sub.save();
    await this.invalidate(String(sub.societyId));
    auditService.record({
      action: `subscription.${to.toLowerCase()}`,
      resource: 'Subscription',
      resourceId: sub._id,
      societyId: String(sub.societyId),
      oldValue: snapshot,
      newValue: { status: sub.status, renewalDate: sub.renewalDate, planId: String(sub.planId), billingCycle: sub.billingCycle, note: meta.note },
      actor: { id: meta.byUserId ?? null, type: meta.actorType ?? (meta.byUserId ? 'PLATFORM_ADMIN' : 'SYSTEM') },
    });
    domainEvents.emit(meta.event ?? `subscription.${to.toLowerCase()}`, { subscriptionId: String(sub._id), societyId: String(sub.societyId), from, to }, { societyId: String(sub.societyId), actorId: meta.byUserId });
    return sub;
  }

  async getBySociety(societyId: string): Promise<SubscriptionDoc> {
    const sub = await Subscription.findOne({ societyId });
    if (!sub) throw Errors.notFound('Subscription');
    return sub;
  }

  /** Activate after a successful payment (or manual platform activation). Extends by one billing cycle. */
  async activate(sub: SubscriptionDoc, meta: { byUserId?: string; paymentId?: string; note?: string; actorType?: 'USER' | 'PLATFORM_ADMIN' | 'SYSTEM' }) {
    const base = sub.status === 'ACTIVE' && dayjs(sub.renewalDate).isAfter(dayjs()) ? sub.renewalDate : new Date();
    const plan = await Plan.findById(sub.planId).lean();
    const amount = sub.billingCycle === 'ANNUAL' ? plan?.annualPrice ?? sub.amount : plan?.monthlyPrice ?? sub.amount;
    return this.transition(
      sub,
      'ACTIVE',
      {
        renewalDate: addCycle(base, sub.billingCycle as BillingCycle),
        gracePeriodEndsAt: null,
        paymentStatus: 'PAID',
        lastPaymentId: meta.paymentId,
        lastPaymentAt: new Date(),
        suspendedAt: null,
        suspendReason: null,
        cancelledAt: null,
        cancelReason: null,
        amount,
      },
      { ...meta, note: meta.note ?? 'Activated', event: 'subscription.activated' },
    );
  }

  async markPastDue(sub: SubscriptionDoc, meta: { byUserId?: string; note?: string } = {}) {
    const graceDays = await configurationService.getPlatformSetting<number>('subscription.gracePeriodDays', 7);
    return this.transition(
      sub,
      'PAST_DUE',
      { gracePeriodEndsAt: dayjs(sub.renewalDate).add(graceDays, 'day').toDate(), paymentStatus: 'PENDING' },
      { ...meta, note: meta.note ?? 'Renewal date passed', actorType: meta.byUserId ? 'PLATFORM_ADMIN' : 'SYSTEM' },
    );
  }

  async expire(sub: SubscriptionDoc, meta: { byUserId?: string; note?: string } = {}) {
    return this.transition(sub, 'EXPIRED', {}, { ...meta, note: meta.note ?? 'Subscription expired', actorType: meta.byUserId ? 'PLATFORM_ADMIN' : 'SYSTEM' });
  }

  async suspend(sub: SubscriptionDoc, meta: { byUserId?: string; reason?: string }) {
    return this.transition(sub, 'SUSPENDED', { suspendedAt: new Date(), suspendReason: meta.reason }, { byUserId: meta.byUserId, note: meta.reason ?? 'Suspended', actorType: meta.byUserId ? 'PLATFORM_ADMIN' : 'SYSTEM' });
  }

  async cancel(sub: SubscriptionDoc, meta: { byUserId?: string; reason?: string; actorType?: 'USER' | 'PLATFORM_ADMIN' }) {
    return this.transition(sub, 'CANCELLED', { cancelledAt: new Date(), cancelReason: meta.reason, autoRenew: false }, { byUserId: meta.byUserId, note: meta.reason ?? 'Cancelled', actorType: meta.actorType });
  }

  /** Platform action: reactivate a suspended / cancelled / expired subscription without payment. */
  async reactivate(sub: SubscriptionDoc, meta: { byUserId: string; days?: number; note?: string }) {
    const renewal = meta.days ? dayjs().add(meta.days, 'day').toDate() : dayjs(sub.renewalDate).isAfter(dayjs()) ? sub.renewalDate : addCycle(new Date(), sub.billingCycle as BillingCycle);
    return this.transition(
      sub,
      'ACTIVE',
      { renewalDate: renewal, gracePeriodEndsAt: null, suspendedAt: null, suspendReason: null, cancelledAt: null, cancelReason: null, autoRenew: true },
      { byUserId: meta.byUserId, note: meta.note ?? 'Reactivated by platform', actorType: 'PLATFORM_ADMIN', event: 'subscription.reactivated' },
    );
  }

  /** Extend the current period by N days. Expired / past-due subscriptions become ACTIVE again. */
  async extend(sub: SubscriptionDoc, meta: { byUserId: string; days: number; note?: string }) {
    const base = dayjs(sub.renewalDate).isAfter(dayjs()) ? sub.renewalDate : new Date();
    const renewalDate = dayjs(base).add(meta.days, 'day').toDate();
    const changes: Record<string, unknown> = { renewalDate, gracePeriodEndsAt: null };
    if (sub.status === 'TRIALING') changes.trialEndDate = renewalDate;
    const target: Status = sub.status === 'TRIALING' ? 'TRIALING' : 'ACTIVE';
    if (target === sub.status) {
      const snapshot = { renewalDate: sub.renewalDate };
      sub.set({ ...changes, updatedBy: meta.byUserId });
      sub.history.push({ status: sub.status, at: new Date(), byUserId: meta.byUserId as any, note: meta.note ?? `Extended by ${meta.days} days`, planId: sub.planId } as any);
      await sub.save();
      await this.invalidate(String(sub.societyId));
      auditService.record({ action: 'subscription.extended', resource: 'Subscription', resourceId: sub._id, societyId: String(sub.societyId), oldValue: snapshot, newValue: { renewalDate, days: meta.days }, actor: { id: meta.byUserId, type: 'PLATFORM_ADMIN' } });
      domainEvents.emit('subscription.extended', { subscriptionId: String(sub._id), societyId: String(sub.societyId), days: meta.days }, { societyId: String(sub.societyId), actorId: meta.byUserId });
      return sub;
    }
    return this.transition(sub, target, { ...changes, suspendedAt: null, suspendReason: null }, { byUserId: meta.byUserId, note: meta.note ?? `Extended by ${meta.days} days`, actorType: 'PLATFORM_ADMIN', event: 'subscription.extended' });
  }

  async changePlan(sub: SubscriptionDoc, meta: { byUserId: string; planId: string; billingCycle?: BillingCycle; note?: string; actorType?: 'USER' | 'PLATFORM_ADMIN' }) {
    const plan = await Plan.findById(meta.planId).lean();
    if (!plan || plan.status !== 'ACTIVE') throw Errors.custom(400, ErrorCodes.PLAN_UNAVAILABLE, 'Selected plan is not available');
    const cycle = meta.billingCycle ?? (sub.billingCycle as BillingCycle);
    const snapshot = { planId: String(sub.planId), billingCycle: sub.billingCycle, amount: sub.amount };
    sub.set({ planId: plan._id, billingCycle: cycle, amount: cycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice, currency: plan.currency, updatedBy: meta.byUserId });
    sub.history.push({ status: sub.status, at: new Date(), byUserId: meta.byUserId as any, note: meta.note ?? `Plan changed to ${plan.name}`, planId: plan._id } as any);
    await sub.save();
    await this.invalidate(String(sub.societyId));
    auditService.record({ action: 'subscription.plan_changed', resource: 'Subscription', resourceId: sub._id, societyId: String(sub.societyId), oldValue: snapshot, newValue: { planId: String(plan._id), billingCycle: cycle, amount: sub.amount }, actor: { id: meta.byUserId, type: meta.actorType ?? 'PLATFORM_ADMIN' } });
    domainEvents.emit('subscription.plan_changed', { subscriptionId: String(sub._id), societyId: String(sub.societyId), planId: String(plan._id), planName: plan.name }, { societyId: String(sub.societyId), actorId: meta.byUserId });
    return sub;
  }

  // ------------------------------------------------------------------ lifecycle job
  /** Idempotent lifecycle sweep executed by the background scheduler. */
  async runLifecycleCheck(now = new Date()): Promise<{ pastDue: number; expired: number; suspended: number; reminders: number }> {
    const result = { pastDue: 0, expired: 0, suspended: 0, reminders: 0 };
    const trialEndBehavior = await configurationService.getPlatformSetting<string>('subscription.trialEndBehavior', 'EXPIRE');
    const suspendAfterDays = await configurationService.getPlatformSetting<number>('subscription.expiredToSuspendedDays', 30);
    const reminderDays = await configurationService.getPlatformSetting<number[]>('subscription.reminderDays', [30, 15, 7, 3, 1]);

    const trials = await Subscription.find({ status: 'TRIALING', trialEndDate: { $lt: now } });
    for (const sub of trials) {
      try {
        if (trialEndBehavior === 'PAST_DUE') {
          await this.markPastDue(sub, { note: 'Trial ended' });
          result.pastDue += 1;
        } else {
          await this.expire(sub, { note: 'Trial ended without payment' });
          result.expired += 1;
        }
      } catch (err) {
        logger.error({ err, sub: sub._id }, 'Trial transition failed');
      }
    }

    const active = await Subscription.find({ status: 'ACTIVE', renewalDate: { $lt: now } });
    for (const sub of active) {
      try {
        await this.markPastDue(sub);
        result.pastDue += 1;
      } catch (err) {
        logger.error({ err, sub: sub._id }, 'Past-due transition failed');
      }
    }

    const pastDue = await Subscription.find({ status: 'PAST_DUE', gracePeriodEndsAt: { $lt: now } });
    for (const sub of pastDue) {
      try {
        await this.expire(sub, { note: 'Grace period ended' });
        result.expired += 1;
      } catch (err) {
        logger.error({ err, sub: sub._id }, 'Expiry transition failed');
      }
    }

    const expired = await Subscription.find({ status: 'EXPIRED', updatedAt: { $lt: dayjs(now).subtract(suspendAfterDays, 'day').toDate() } });
    for (const sub of expired) {
      try {
        await this.suspend(sub, { reason: `Expired for more than ${suspendAfterDays} days` });
        result.suspended += 1;
      } catch (err) {
        logger.error({ err, sub: sub._id }, 'Suspension transition failed');
      }
    }

    // renewal / trial-end reminders (idempotent through remindersSent keys)
    const maxDay = Math.max(...reminderDays, 0);
    const upcoming = await Subscription.find({ status: { $in: ['ACTIVE', 'TRIALING'] }, renewalDate: { $gte: now, $lte: dayjs(now).add(maxDay, 'day').endOf('day').toDate() } });
    for (const sub of upcoming) {
      const days = dayjs(sub.renewalDate).startOf('day').diff(dayjs(now).startOf('day'), 'day');
      if (!reminderDays.includes(days)) continue;
      const key = `${dayjs(sub.renewalDate).format('YYYY-MM-DD')}:${days}`;
      if (sub.remindersSent.some((r) => r.key === key)) continue;
      sub.remindersSent.push({ key, at: now } as any);
      await sub.save();
      domainEvents.emit('subscription.expiring', { subscriptionId: String(sub._id), societyId: String(sub.societyId), daysRemaining: days, status: sub.status }, { societyId: String(sub.societyId) });
      result.reminders += 1;
    }
    return result;
  }

  // ------------------------------------------------------------------ platform views
  async expiryRadar() {
    const buckets = await configurationService.getPlatformSetting<{ key: string; label: string; from: number; to: number }[]>('subscription.expiryRadarBuckets', []);
    const today = dayjs().startOf('day');
    const subs = await Subscription.find({ status: { $in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'EXPIRED'] } })
      .populate('planId', 'name slug')
      .populate('societyId', 'name slug status primaryAdminUserId contact')
      .lean();
    const rows = subs.map((s) => ({ ...s, daysRemaining: dayjs(s.renewalDate).startOf('day').diff(today, 'day') }));
    return buckets.map((b) => ({
      ...b,
      count: rows.filter((r) => r.daysRemaining >= b.from && r.daysRemaining <= b.to).length,
      items: rows.filter((r) => r.daysRemaining >= b.from && r.daysRemaining <= b.to).sort((a, b2) => a.daysRemaining - b2.daysRemaining),
    }));
  }

  async stats() {
    const [byStatus, revenue, expiringSoon, societyCount] = await Promise.all([
      Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Subscription.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, mrr: { $sum: { $cond: [{ $eq: ['$billingCycle', 'ANNUAL'] }, { $divide: ['$amount', 12] }, '$amount'] } } } },
      ]),
      Subscription.countDocuments({ status: { $in: ['ACTIVE', 'TRIALING'] }, renewalDate: { $lte: dayjs().add(7, 'day').toDate(), $gte: new Date() } }),
      Society.countDocuments({ status: { $ne: 'ARCHIVED' } }),
    ]);
    const counts: Record<string, number> = {};
    for (const row of byStatus) counts[row._id] = row.count;
    const mrr = Math.round(revenue[0]?.mrr ?? 0);
    return { counts, mrr, arr: mrr * 12, expiringSoon, societies: societyCount };
  }
}

export const subscriptionEngine = new SubscriptionEngine();
