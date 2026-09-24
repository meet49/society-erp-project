import { jobQueue } from './queue';
import { logger } from '../../lib/logger';
import { isTest } from '../../config/env';
import { subscriptionEngine } from '../subscription/subscription-engine.service';

export const JobNames = {
  SUBSCRIPTION_LIFECYCLE: 'subscription.lifecycle',
  NOTIFICATION_DELIVER: 'notification.deliver',
  EMAIL_SEND: 'email.send',
  WHATSAPP_SEND: 'whatsapp.send',
  PUSH_SEND: 'push.send',
  INVOICE_GENERATE: 'invoice.generate',
  INVOICE_OVERDUE: 'invoice.overdue',
  PAYMENT_RECONCILE: 'payment.reconcile',
  SLA_ESCALATE: 'sla.escalate',
  CONTRACT_REMIND: 'contract.remind',
  INVENTORY_LOW_STOCK: 'inventory.lowstock',
  ATTENDANCE_PROCESS: 'attendance.process',
  VISITOR_EXPIRE: 'visitor.expire',
  IMPORT_RUN: 'import.run',
  AMENITY_COMPLETE: 'amenity.complete',
  COMPLAINT_AUTOCLOSE: 'complaint.autoclose',
  COMMUNITY_SWEEP: 'community.sweep',
  DOCUMENT_EXPIRY: 'document.expiry',
  GOVERNANCE_SWEEP: 'governance.sweep',
  EMERGENCY_SWEEP: 'emergency.sweep',
  SECURITY_SWEEP: 'security.sweep',
  ASSET_REMIND: 'asset.remind',
} as const;

type Registrar = () => void;
const registrars: Registrar[] = [];

/** Modules call this at import time to register their job handlers. */
export function registerJobHandlers(fn: Registrar): void {
  registrars.push(fn);
}

registerJobHandlers(() => {
  jobQueue.register(JobNames.SUBSCRIPTION_LIFECYCLE, async () => {
    const result = await subscriptionEngine.runLifecycleCheck();
    if (result.pastDue || result.expired || result.suspended || result.reminders) logger.info(result, 'Subscription lifecycle sweep');
  });
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Repeatable schedules (idempotent handlers). Intervals are conservative defaults. */
const SCHEDULES: { name: string; everyMs: number }[] = [
  { name: JobNames.SUBSCRIPTION_LIFECYCLE, everyMs: 15 * MINUTE },
  { name: JobNames.INVOICE_OVERDUE, everyMs: HOUR },
  { name: JobNames.PAYMENT_RECONCILE, everyMs: 10 * MINUTE },
  { name: JobNames.SLA_ESCALATE, everyMs: 5 * MINUTE },
  { name: JobNames.CONTRACT_REMIND, everyMs: 6 * HOUR },
  { name: JobNames.INVENTORY_LOW_STOCK, everyMs: 6 * HOUR },
  { name: JobNames.VISITOR_EXPIRE, everyMs: 10 * MINUTE },
  { name: JobNames.AMENITY_COMPLETE, everyMs: 30 * MINUTE },
  { name: JobNames.COMPLAINT_AUTOCLOSE, everyMs: 6 * HOUR },
  { name: JobNames.COMMUNITY_SWEEP, everyMs: 5 * MINUTE },
  { name: JobNames.DOCUMENT_EXPIRY, everyMs: 12 * HOUR },
  { name: JobNames.GOVERNANCE_SWEEP, everyMs: 5 * MINUTE },
  { name: JobNames.ATTENDANCE_PROCESS, everyMs: 6 * HOUR },
  { name: JobNames.EMERGENCY_SWEEP, everyMs: 2 * MINUTE },
  { name: JobNames.SECURITY_SWEEP, everyMs: 6 * HOUR },
  { name: JobNames.ASSET_REMIND, everyMs: 12 * HOUR },
];

export async function startJobs(opts: { processJobs: boolean; schedule: boolean }): Promise<void> {
  for (const r of registrars) r();
  await jobQueue.start({ processJobs: opts.processJobs });
  if (opts.schedule && !isTest) {
    for (const s of SCHEDULES) await jobQueue.schedule(s.name, { everyMs: s.everyMs });
    logger.info({ driver: jobQueue.driver, schedules: SCHEDULES.length }, 'Background jobs scheduled');
  }
}

export async function stopJobs(): Promise<void> {
  await jobQueue.stop();
}
