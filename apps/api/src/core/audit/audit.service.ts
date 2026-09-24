import type { Request } from 'express';
import { AuditLog } from '../../models/audit-log.model';
import { logger } from '../../lib/logger';
import { paginate } from '../../lib/pagination';

const SENSITIVE_KEYS = /pass(word)?|secret|token|hash|key$|apikey|credential|otp/i;

/** Strips secrets from audit payloads so passwords / tokens never reach the audit trail. */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitizeForAudit(v, depth + 1));
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if (typeof (value as any).toHexString === 'function') return String(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = sanitizeForAudit(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

export interface AuditInput {
  action: string;
  resource: string;
  resourceId?: string | { toString(): string } | null;
  societyId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  actor?: { id?: string | null; type?: 'USER' | 'PLATFORM_ADMIN' | 'SYSTEM' | 'ANONYMOUS'; name?: string; email?: string } | null;
  req?: Request;
}

class AuditService {
  /** Fire-and-forget audit record. Failures are logged, never thrown into the business flow. */
  record(input: AuditInput): void {
    void this.write(input).catch((err) => logger.error({ err, action: input.action }, 'Failed to write audit log'));
  }

  async write(input: AuditInput): Promise<void> {
    const req = input.req;
    const actor = input.actor ?? (req?.auth ? { id: req.auth.userId, type: req.auth.isPlatform ? 'PLATFORM_ADMIN' : 'USER', name: req.auth.name, email: req.auth.email } : { type: 'ANONYMOUS' });
    await AuditLog.create({
      actorId: actor.id ?? undefined,
      actorType: actor.type ?? 'USER',
      actorName: actor.name,
      actorEmail: actor.email,
      societyId: input.societyId ?? req?.tenant?.societyId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ? String(input.resourceId) : undefined,
      oldValue: sanitizeForAudit(input.oldValue),
      newValue: sanitizeForAudit(input.newValue),
      metadata: sanitizeForAudit(input.metadata),
      ip: req?.ip,
      userAgent: req?.headers['user-agent']?.slice(0, 300),
      requestId: req?.id,
    });
  }

  async list(filter: Record<string, unknown>, opts: { page?: number; limit?: number; sort?: string }) {
    return paginate(AuditLog as any, filter, { ...opts, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'action', 'resource'] });
  }
}

export const auditService = new AuditService();
