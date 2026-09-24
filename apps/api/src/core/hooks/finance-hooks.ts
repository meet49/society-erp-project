import type { ClientSession } from 'mongoose';
import { logger } from '../../lib/logger';

/**
 * Finance hook registry. Billing and payments raise these; the accounting module (when present and
 * enabled for the society) posts double-entry journals. Keeps billing usable without accounting.
 */
export interface FinanceHooks {
  onInvoiceIssued?: (invoice: any, ctx: { societyId: string; byUserId?: string; session?: ClientSession }) => Promise<void>;
  onInvoiceCancelled?: (invoice: any, ctx: { societyId: string; byUserId?: string }) => Promise<void>;
  onPaymentReceived?: (payment: any, ctx: { societyId: string; byUserId?: string }) => Promise<void>;
  onPaymentRefunded?: (payment: any, ctx: { societyId: string; byUserId?: string; amount: number }) => Promise<void>;
  onExpensePaid?: (expense: any, ctx: { societyId: string; byUserId?: string }) => Promise<void>;
  onExpenseApproved?: (expense: any, ctx: { societyId: string; byUserId?: string }) => Promise<void>;
}

const handlers: FinanceHooks[] = [];

export function registerFinanceHooks(h: FinanceHooks): void {
  handlers.push(h);
}

type HookName = keyof FinanceHooks;

export async function runFinanceHook<K extends HookName>(name: K, ...args: Parameters<NonNullable<FinanceHooks[K]>>): Promise<void> {
  for (const h of handlers) {
    const fn = h[name] as ((...a: any[]) => Promise<void>) | undefined;
    if (!fn) continue;
    try {
      await fn(...args);
    } catch (err) {
      // accounting failures must never block money movements; they are logged and visible in reconciliation
      logger.error({ err, hook: name }, 'Finance hook failed');
    }
  }
}
