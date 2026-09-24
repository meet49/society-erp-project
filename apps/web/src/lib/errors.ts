import { toast } from 'sonner';
import { isApiError, toApiError, type ApiError } from '@/lib/api-client';

const FRIENDLY: Record<string, string> = {
  NETWORK_ERROR: 'You appear to be offline. Changes were not saved.',
  TIMEOUT: 'The server took too long to respond. Please try again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  SESSION_REVOKED: 'Your session has ended. Please sign in again.',
  TOKEN_REUSED: 'Your session was invalidated for security reasons. Please sign in again.',
  PERMISSION_DENIED: 'You do not have permission to do that.',
  FORBIDDEN: 'You do not have access to this resource.',
  MODULE_DISABLED: 'This module is disabled for your society. An administrator can enable it in Settings → Modules.',
  MODULE_NOT_IN_PLAN: 'This module is not included in your current plan. Upgrade to unlock it.',
  MODULE_INACTIVE: 'This module is temporarily unavailable.',
  SUBSCRIPTION_EXPIRED: 'Your subscription has expired. Renew to regain access.',
  SUBSCRIPTION_SUSPENDED: 'Your subscription is suspended. Please contact support.',
  SUBSCRIPTION_CANCELLED: 'Your subscription is cancelled. Reactivate to continue.',
  SUBSCRIPTION_PAST_DUE: 'Your subscription payment is overdue.',
  SUBSCRIPTION_READ_ONLY: 'The workspace is read-only until the overdue payment is received.',
  PLAN_LIMIT_EXCEEDED: 'You have reached a plan limit. Upgrade your plan to add more.',
  FEATURE_DISABLED: 'This feature is not enabled on your platform.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again.',
  NOT_FOUND: 'The requested record was not found.',
  CONFLICT: 'This action conflicts with existing data.',
  VALIDATION_ERROR: 'Please fix the highlighted fields.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

export function getErrorMessage(err: unknown): string {
  const e = toApiError(err);
  if (e.code === 'VALIDATION_ERROR' && e.fields) {
    const first = Object.entries(e.fields)[0];
    if (first) return `${first[0] === '_' ? '' : `${first[0]}: `}${first[1][0]}`;
  }
  return e.message || FRIENDLY[e.code] || 'Something went wrong';
}

export function getFriendlyMessage(err: unknown): string {
  const e = toApiError(err);
  return FRIENDLY[e.code] ?? e.message ?? 'Something went wrong';
}

/** Global error → toast mapping. Auth failures are handled by the API client / router, not toasted twice. */
export function handleApiError(err: unknown, opts: { silent?: boolean; title?: string } = {}): ApiError {
  const e = toApiError(err);
  if (opts.silent || e.code === 'CANCELLED') return e;
  if (e.status === 401) return e;
  const description = e.code === 'VALIDATION_ERROR' ? getErrorMessage(e) : e.message && e.message !== FRIENDLY[e.code] ? e.message : undefined;
  const title = opts.title ?? FRIENDLY[e.code] ?? e.message ?? 'Something went wrong';
  if (e.status >= 500 || e.status === 0) toast.error(title, { description: e.requestId ? `Reference: ${e.requestId}` : description });
  else toast.error(title, { description });
  return e;
}

export { isApiError };
