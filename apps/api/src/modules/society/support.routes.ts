import { Router } from 'express';
import { z } from 'zod';
import { SupportTicketStatus, idParamSchema, paginationQuerySchema, supportTicketSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, validate } from '../../middleware';
import { ok, created, paged } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { supportService } from '../public/support.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { User } from '../../models/user.model';

/** Society-side support: raise tickets with the platform team. Reachable even when the subscription is blocked. */
export const societySupportRouter = Router();
societySupportRouter.use(authenticate, requireSociety, requireModule('support'));

const listQuery = paginationQuerySchema.extend({ status: z.enum(Object.values(SupportTicketStatus) as [string, ...string[]]).optional() });

societySupportRouter.get(
  '/',
  authorizePermission('support:view', 'support:view_own'),
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    paged(res, await supportService.listForRequester(req.tenant!.societyId, req.auth!.userId, { all: !req.ownScope, page: q.page, limit: q.limit, status: q.status }));
  }),
);

societySupportRouter.post(
  '/',
  authorizePermission('support:create'),
  validate(supportTicketSchema),
  asyncHandler(async (req, res) => {
    const isAdmin = req.tenant!.permissions.has('society:manage_settings') || req.tenant!.roleKeys.includes('SOCIETY_ADMIN');
    if (!isAdmin) {
      const memberAllowed = await configurationService.getPlatformSetting<boolean>('platform.memberSupportEnabled', true);
      if (!memberAllowed) throw Errors.forbidden('Member support is disabled. Please contact your society office.');
    }
    const user = await User.findById(req.auth!.userId).select('name email phone').lean();
    const ticket = await supportService.create({
      source: isAdmin ? 'SOCIETY_ADMIN' : 'MEMBER',
      societyId: req.tenant!.societyId,
      requesterUserId: req.auth!.userId,
      name: user?.name ?? req.auth!.name,
      email: user?.email ?? req.auth!.email,
      phone: user?.phone ?? undefined,
      subject: req.body.subject,
      message: req.body.message,
      priority: req.body.priority,
      category: req.body.category,
    });
    created(res, ticket);
  }),
);

societySupportRouter.get(
  '/:id',
  authorizePermission('support:view', 'support:view_own'),
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    ok(res, await supportService.getForRequester(req.tenant!.societyId, req.auth!.userId, req.params.id, !req.ownScope));
  }),
);

societySupportRouter.post(
  '/:id/reply',
  authorizePermission('support:view', 'support:view_own'),
  validate(idParamSchema, 'params'),
  validate(z.object({ body: z.string().trim().min(1).max(8000) })),
  asyncHandler(async (req, res) => {
    ok(res, await supportService.replyAsRequester(req.tenant!.societyId, req.auth!.userId, req.params.id, req.body.body, !req.ownScope, req));
  }),
);
