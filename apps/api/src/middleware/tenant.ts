import type { RequestHandler } from 'express';
import { ErrorCodes } from '@society-erp/shared';
import { Errors } from '../lib/errors';
import { accessControlService } from '../core/access-control/access-control.service';
import { Membership } from '../models/membership.model';

/**
 * Resolves the society (tenant) context from the authenticated token ONLY.
 * The society id is never read from the body, query or headers.
 */
export const requireSociety: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw Errors.unauthenticated();
    if (!req.auth.societyId) throw Errors.forbidden('Select a society to continue', ErrorCodes.TENANT_CONTEXT_REQUIRED);
    const tenant = await accessControlService.resolveTenantContext(req.auth.userId, req.auth.societyId);
    if (!tenant) throw Errors.forbidden('You are not a member of this society', ErrorCodes.MEMBERSHIP_INACTIVE);
    if (tenant.society.status === 'SUSPENDED') throw Errors.forbidden('This society is suspended. Contact support.', ErrorCodes.SOCIETY_SUSPENDED);
    if (tenant.society.status === 'ARCHIVED') throw Errors.forbidden('This society is no longer active', ErrorCodes.SOCIETY_SUSPENDED);
    // membership status check is cheap and must not be served from a stale cache after deactivation
    const membership = await Membership.findById(tenant.membershipId).select('status').lean();
    if (!membership || membership.status !== 'ACTIVE') throw Errors.forbidden('Your access to this society has been deactivated', ErrorCodes.MEMBERSHIP_INACTIVE);
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
};

/** Resolves platform permissions for platform console routes. */
export const requirePlatform: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.auth) throw Errors.unauthenticated();
    const platform = await accessControlService.resolvePlatformContext(req.auth.userId);
    if (!platform) throw Errors.forbidden('Platform access required');
    req.platform = platform;
    next();
  } catch (err) {
    next(err);
  }
};
