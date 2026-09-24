import { Router } from 'express';
import { booleanQuerySchema, idParamSchema, paginationQuerySchema } from '@society-erp/shared';
import { asyncHandler, authenticate, validate } from '../../middleware';
import { ok, noContent, paged } from '../../lib/response';
import { notificationService } from '../../core/notifications/notification.service';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const listQuery = paginationQuerySchema.extend({ unreadOnly: booleanQuerySchema });

notificationsRouter.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as any;
    paged(res, await notificationService.list(req.auth!.userId, { page: q.page, limit: q.limit, unreadOnly: q.unreadOnly, societyId: req.auth!.societyId }));
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    ok(res, { count: await notificationService.unreadCount(req.auth!.userId, req.auth!.societyId) });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    ok(res, { updated: await notificationService.markAllRead(req.auth!.userId) });
  }),
);

notificationsRouter.post(
  '/:id/read',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await notificationService.markRead(req.auth!.userId, req.params.id);
    noContent(res);
  }),
);
