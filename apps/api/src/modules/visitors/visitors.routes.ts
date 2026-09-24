import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { visitorService, type Actor } from './visitors.service';
import { deliveryService } from './deliveries.service';
import { checkInSchema, checkOutSchema, decisionSchema, deliveryAnnounceSchema, deliveryArriveSchema, deliveryListQuerySchema, deliveryStatusSchema, gateSchema, gateUpdateSchema, lookupSchema, preApproveSchema, visitorListQuerySchema, visitorSettingsSchema, walkInSchema } from './visitors.schemas';
import './visitors.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const actor = (req: any): Actor => ({ userId: uid(req), ownScope: Boolean(req.ownScope), unitIds: (req.tenant!.unitIds ?? []) as string[], residentId: req.tenant!.residentId ?? null, isGuard: req.tenant!.permissions.has('visitors:checkin') });

// ------------------------------------------------------------------ visitors (admin + resident self-service + guard)
export const visitorsRouter = Router();
visitorsRouter.use(authenticate, requireSociety, requireModule('visitors'), requireSubscription());

// settings & gates
visitorsRouter.get('/settings', authorizePermission('visitors:configure', 'visitors:view', 'visitors:checkin'), asyncHandler(async (req, res) => ok(res, await visitorService.getConfig(sid(req)))));
visitorsRouter.put('/settings', authorizePermission('visitors:configure'), validate(visitorSettingsSchema), asyncHandler(async (req, res) => ok(res, await visitorService.updateConfig(sid(req), req.body, uid(req), req))));
visitorsRouter.get('/units', authorizePermission('visitors:create', 'visitors:checkin', 'visitors:view', 'delivery:create'), validate(z.object({ q: z.string().trim().max(40).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }), 'query'), asyncHandler(async (req, res) => ok(res, await visitorService.unitLookup(sid(req), req.query.q as string | undefined, Number(req.query.limit) || 30))));
visitorsRouter.get('/gates', authorizePermission('visitors:view', 'visitors:checkin', 'visitors:create', 'visitors:configure', 'security:configure'), asyncHandler(async (req, res) => ok(res, await visitorService.listGates(sid(req)))));
visitorsRouter.post('/gates', authorizePermission('visitors:configure', 'security:configure'), validate(gateSchema), asyncHandler(async (req, res) => created(res, await visitorService.createGate(sid(req), req.body, uid(req), req))));
visitorsRouter.patch('/gates/:id', authorizePermission('visitors:configure', 'security:configure'), validate(idParamSchema, 'params'), validate(gateUpdateSchema), asyncHandler(async (req, res) => ok(res, await visitorService.updateGate(sid(req), req.params.id, req.body, req))));

// stats, board, timeline, export
visitorsRouter.get('/stats', authorizePermission('visitors:view'), asyncHandler(async (req, res) => ok(res, await visitorService.stats(sid(req)))));
visitorsRouter.get('/board', authorizePermission('visitors:checkin', 'visitors:checkout', 'visitors:view'), asyncHandler(async (req, res) => ok(res, await visitorService.gateBoard(sid(req)))));
visitorsRouter.get('/timeline', authorizePermission('visitors:view', 'visitors:checkin'), asyncHandler(async (req, res) => ok(res, await visitorService.timelineToday(sid(req), Number(req.query.limit) || 100))));
visitorsRouter.get('/export', authorizePermission('visitors:export'), validate(visitorListQuerySchema, 'query'), asyncHandler(async (req, res) => { const rows = await visitorService.exportRows(sid(req), req.query as any, actor(req)); auditService.record({ action: 'visitor.exported', resource: 'Visitor', societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="visitors.csv"'); res.send(toCsv(rows)); }));

// gate operations
visitorsRouter.post('/lookup', authorizePermission('visitors:checkin', 'visitors:checkout', 'visitors:view'), validate(lookupSchema), asyncHandler(async (req, res) => ok(res, await visitorService.lookup(sid(req), req.body.code))));
visitorsRouter.post('/walk-in', authorizePermission('visitors:create'), validate(walkInSchema), asyncHandler(async (req, res) => created(res, await visitorService.walkIn(sid(req), req.body, actor(req), { canApprove: req.tenant!.permissions.has('visitors:approve') }, req))));
visitorsRouter.post('/:id/check-in', authorizePermission('visitors:checkin'), validate(idParamSchema, 'params'), validate(checkInSchema), asyncHandler(async (req, res) => ok(res, await visitorService.checkIn(sid(req), req.params.id, req.body, actor(req), req))));
visitorsRouter.post('/:id/check-out', authorizePermission('visitors:checkout'), validate(idParamSchema, 'params'), validate(checkOutSchema), asyncHandler(async (req, res) => ok(res, await visitorService.checkOut(sid(req), req.params.id, req.body, actor(req), req))));

// resident pre-approval & decisions (own scope) / admin
visitorsRouter.get('/', authorizePermission('visitors:view', 'visitors:view_own'), validate(visitorListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await visitorService.list(sid(req), req.query as any, actor(req)))));
visitorsRouter.post('/', authorizePermission('visitors:create', 'visitors:create_own'), validate(preApproveSchema), asyncHandler(async (req, res) => created(res, await visitorService.preApprove(sid(req), req.body, actor(req), req))));
visitorsRouter.get('/:id', authorizePermission('visitors:view', 'visitors:view_own', 'visitors:checkin'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await visitorService.get(sid(req), req.params.id, actor(req)))));
visitorsRouter.get('/:id/pass', authorizePermission('visitors:view', 'visitors:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await visitorService.myPass(sid(req), req.params.id, actor(req)))));
visitorsRouter.post('/:id/approve', authorizePermission('visitors:approve', 'visitors:view_own'), validate(idParamSchema, 'params'), validate(decisionSchema), asyncHandler(async (req, res) => ok(res, await visitorService.decide(sid(req), req.params.id, 'APPROVED', actor(req), req.body.reason, req))));
visitorsRouter.post('/:id/deny', authorizePermission('visitors:deny', 'visitors:approve', 'visitors:view_own'), validate(idParamSchema, 'params'), validate(decisionSchema), asyncHandler(async (req, res) => ok(res, await visitorService.decide(sid(req), req.params.id, 'DENIED', actor(req), req.body.reason, req))));
visitorsRouter.post('/:id/cancel', authorizePermission('visitors:view', 'visitors:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await visitorService.cancel(sid(req), req.params.id, actor(req), req))));

// ------------------------------------------------------------------ deliveries
export const deliveriesRouter = Router();
deliveriesRouter.use(authenticate, requireSociety, requireModule('delivery'), requireSubscription());
deliveriesRouter.get('/stats', authorizePermission('delivery:view'), asyncHandler(async (req, res) => ok(res, await deliveryService.stats(sid(req)))));
deliveriesRouter.get('/at-gate', authorizePermission('delivery:view', 'delivery:create', 'delivery:view_own'), asyncHandler(async (req, res) => ok(res, await deliveryService.atGate(sid(req), actor(req)))));
deliveriesRouter.get('/', authorizePermission('delivery:view', 'delivery:view_own', 'delivery:create'), validate(deliveryListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await deliveryService.list(sid(req), req.query as any, req.ownScope ? actor(req) : { ...actor(req), ownScope: !req.tenant!.permissions.has('delivery:view') && !req.tenant!.permissions.has('delivery:create') }))));
deliveriesRouter.post('/announce', authorizePermission('delivery:create_own', 'delivery:create'), validate(deliveryAnnounceSchema), asyncHandler(async (req, res) => created(res, await deliveryService.announce(sid(req), req.body, actor(req), req))));
deliveriesRouter.post('/arrive', authorizePermission('delivery:create'), validate(deliveryArriveSchema), asyncHandler(async (req, res) => created(res, await deliveryService.arrive(sid(req), req.body, actor(req), req))));
deliveriesRouter.get('/:id', authorizePermission('delivery:view', 'delivery:view_own', 'delivery:create'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await deliveryService.get(sid(req), req.params.id, actor(req)))));
deliveriesRouter.post('/:id/status', authorizePermission('delivery:update', 'delivery:collect', 'delivery:create', 'delivery:view_own'), validate(idParamSchema, 'params'), validate(deliveryStatusSchema), asyncHandler(async (req, res) => ok(res, await deliveryService.setStatus(sid(req), req.params.id, req.body, actor(req), req))));

