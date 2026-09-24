import type { RequestHandler } from 'express';
import { ErrorCodes, hasPermission } from '@society-erp/shared';
import { Errors } from '../lib/errors';
import { moduleEngine } from '../core/modules/module-engine.service';
import { configurationService } from '../core/configuration/configuration.service';

/**
 * Society permission gate. Accepts one or more permission keys; any match grants access.
 * When only an `*_own` permission matches, req.ownScope = true so services restrict queries
 * to the caller's own units / records.
 */
export function authorizePermission(...permissions: string[]): RequestHandler {
  return (req, _res, next) => {
    const ctx = req.tenant;
    if (!ctx) return next(Errors.forbidden('Society context required', ErrorCodes.TENANT_CONTEXT_REQUIRED));
    const full = permissions.filter((p) => !p.endsWith('_own'));
    const own = permissions.filter((p) => p.endsWith('_own'));
    if (full.length && hasPermission(ctx.permissions, full)) {
      req.ownScope = false;
      return next();
    }
    if (own.length && hasPermission(ctx.permissions, own)) {
      req.ownScope = true;
      return next();
    }
    return next(Errors.permissionDenied(permissions));
  };
}

/** Platform permission gate (SUPER_ADMIN and future platform roles). */
export function authorizePlatformPermission(...permissions: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.platform) return next(Errors.forbidden('Platform access required'));
    if (!hasPermission(req.platform.permissions, permissions)) return next(Errors.permissionDenied(permissions));
    next();
  };
}

/** Module gate: global status → plan → society toggle → feature flag → dependencies. */
export function requireModule(moduleKey: string): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.tenant) throw Errors.forbidden('Society context required', ErrorCodes.TENANT_CONTEXT_REQUIRED);
      req.moduleKey = moduleKey;
      if (req.tenant.accessibleModules.has(moduleKey)) return next();
      await moduleEngine.assertAccessible(req.tenant.societyId, moduleKey); // throws the precise reason
      next();
    } catch (err) {
      next(err);
    }
  };
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Subscription gate. Blocked statuses reject every request; PAST_DUE read-only mode
 * (configurable) allows only safe methods. Routes needed to recover a subscription (billing,
 * profile) are mounted without this middleware.
 */
export function requireSubscription(opts: { allowReadOnly?: boolean } = {}): RequestHandler {
  return (req, _res, next) => {
    const sub = req.tenant?.subscription;
    if (!sub) return next(Errors.subscription(ErrorCodes.SUBSCRIPTION_REQUIRED, 'No active subscription for this society'));
    if (sub.blocked) {
      const code =
        sub.status === 'SUSPENDED'
          ? ErrorCodes.SUBSCRIPTION_SUSPENDED
          : sub.status === 'CANCELLED'
            ? ErrorCodes.SUBSCRIPTION_CANCELLED
            : sub.status === 'PAST_DUE'
              ? ErrorCodes.SUBSCRIPTION_PAST_DUE
              : sub.status === 'NONE'
                ? ErrorCodes.SUBSCRIPTION_REQUIRED
                : ErrorCodes.SUBSCRIPTION_EXPIRED;
      return next(Errors.subscription(code, 'Your subscription does not allow access. Please renew to continue.', { status: sub.status, renewalDate: sub.renewalDate }));
    }
    if (sub.readOnly && !READ_METHODS.has(req.method) && !opts.allowReadOnly) {
      return next(Errors.subscription(ErrorCodes.SUBSCRIPTION_READ_ONLY, 'Your subscription is past due. The workspace is read-only until payment is received.', { status: sub.status }));
    }
    next();
  };
}

/** Feature flag gate (platform-level flags with society / plan rollout). */
export function requireFeature(flag: string): RequestHandler {
  return async (req, _res, next) => {
    try {
      const enabled = await configurationService.getFeatureFlag(flag, { societyId: req.tenant?.societyId ?? null, planId: req.tenant?.subscription?.planId ?? null });
      if (!enabled) throw Errors.featureDisabled(flag);
      next();
    } catch (err) {
      next(err);
    }
  };
}
