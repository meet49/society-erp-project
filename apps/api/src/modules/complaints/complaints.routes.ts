import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { complaintService, type Actor } from './complaints.service';
import { assignSchema, commentSchema, complaintCreateSchema, complaintListQuerySchema, complaintUpdateSchema, complaintsConfigSchema, escalationSettingsSchema, rateSchema, slaSettingsSchema, statusSchema } from './complaints.schemas';
import './complaints.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const actor = (req: any): Actor => ({ userId: uid(req), ownScope: Boolean(req.ownScope), unitIds: (req.tenant!.unitIds ?? []) as string[], residentId: req.tenant!.residentId ?? null, canViewInternal: !req.ownScope });

export const complaintsRouter = Router();
complaintsRouter.use(authenticate, requireSociety, requireModule('complaints'), requireSubscription());

// ---- settings (SLA, escalation, behaviour)
complaintsRouter.get('/settings', authorizePermission('complaints:configure', 'complaints:view'), asyncHandler(async (req, res) => ok(res, await complaintService.settings(sid(req)))));
complaintsRouter.put('/settings', authorizePermission('complaints:configure'), validate(z.object({ config: complaintsConfigSchema.optional(), sla: slaSettingsSchema.optional(), escalation: escalationSettingsSchema.optional() })), asyncHandler(async (req, res) => ok(res, await complaintService.updateSettings(sid(req), req.body as any, uid(req), req))));

// ---- stats & export
complaintsRouter.get('/stats', authorizePermission('complaints:view', 'complaints:view_own'), asyncHandler(async (req, res) => ok(res, await complaintService.stats(sid(req), actor(req)))));
complaintsRouter.get('/export', authorizePermission('complaints:export'), validate(complaintListQuerySchema, 'query'), asyncHandler(async (req, res) => { const rows = await complaintService.exportRows(sid(req), req.query as any, actor(req)); auditService.record({ action: 'complaint.exported', resource: 'Complaint', societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="complaints.csv"'); res.send(toCsv(rows)); }));

// ---- tickets
complaintsRouter.get('/', authorizePermission('complaints:view', 'complaints:view_own'), validate(complaintListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await complaintService.list(sid(req), req.query as any, actor(req)))));
complaintsRouter.post('/', authorizePermission('complaints:create', 'complaints:view_own'), validate(complaintCreateSchema), asyncHandler(async (req, res) => created(res, await complaintService.create(sid(req), req.body, { ...actor(req), ownScope: !req.tenant!.permissions.has('complaints:create') || Boolean(req.ownScope) }, req))));
complaintsRouter.get('/:id', authorizePermission('complaints:view', 'complaints:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await complaintService.get(sid(req), req.params.id, actor(req)))));
complaintsRouter.patch('/:id', authorizePermission('complaints:update', 'complaints:view_own'), validate(idParamSchema, 'params'), validate(complaintUpdateSchema), asyncHandler(async (req, res) => ok(res, await complaintService.update(sid(req), req.params.id, req.body, actor(req), req))));
complaintsRouter.post('/:id/assign', authorizePermission('complaints:assign'), validate(idParamSchema, 'params'), validate(assignSchema), asyncHandler(async (req, res) => ok(res, await complaintService.assign(sid(req), req.params.id, req.body, uid(req), req))));
complaintsRouter.post(
  '/:id/status',
  authorizePermission('complaints:resolve', 'complaints:close', 'complaints:update', 'complaints:view_own'),
  validate(idParamSchema, 'params'),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const perms = req.tenant!.permissions;
    if (!req.ownScope) {
      if (req.body.status === 'RESOLVED' && !perms.has('complaints:resolve') && !perms.has('complaints:update')) return void res.status(403).json({ code: 'PERMISSION_DENIED', message: 'complaints:resolve is required' });
      if (req.body.status === 'CLOSED' && !perms.has('complaints:close') && !perms.has('complaints:resolve')) return void res.status(403).json({ code: 'PERMISSION_DENIED', message: 'complaints:close is required' });
    }
    ok(res, await complaintService.changeStatus(sid(req), req.params.id, req.body, actor(req), req));
  }),
);
complaintsRouter.post('/:id/comments', authorizePermission('complaints:comment', 'complaints:view_own'), validate(idParamSchema, 'params'), validate(commentSchema), asyncHandler(async (req, res) => created(res, await complaintService.comment(sid(req), req.params.id, req.body, actor(req), req))));
complaintsRouter.post('/:id/rate', authorizePermission('complaints:view_own', 'complaints:create'), validate(idParamSchema, 'params'), validate(rateSchema), asyncHandler(async (req, res) => ok(res, await complaintService.rate(sid(req), req.params.id, req.body, actor(req), req))));
