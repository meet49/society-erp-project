import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { staffService } from './staff.service';
import { domesticHelpService } from './domestic-help.service';
import { parkingService, vehicleService } from './vehicles.service';
import { allocateSchema, attendanceMarkSchema, helpBlockSchema, helpConfigSchema, helpListQuerySchema, helpLogsQuerySchema, helpLookupSchema, helpPunchSchema, helpRegisterSchema, helpUpdateSchema, helpVerifySchema, punchSchema, registerQuerySchema, slotBulkSchema, slotCreateSchema, slotListQuerySchema, slotUpdateSchema, staffConfigSchema, staffCreateSchema, staffListQuerySchema, staffUpdateSchema, vehicleCreateSchema, vehicleListQuerySchema, vehicleLookupQuerySchema, vehicleUpdateSchema } from './operations.schemas';
import './operations.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const perms = (req: any) => req.tenant!.permissions as Set<string>;
const unitIds = (req: any) => (req.tenant!.unitIds ?? []) as string[];
const csv = (res: any, name: string, rows: Record<string, unknown>[]) => { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.send(toCsv(rows)); };

// ------------------------------------------------------------------ staff & attendance
const staffActor = (req: any) => ({ userId: uid(req), canViewSensitive: perms(req).has('staff:update') });
export const staffRouter = Router();
staffRouter.use(authenticate, requireSociety, requireModule('staff'), requireSubscription());
staffRouter.get('/settings', authorizePermission('staff:view', 'staff:configure'), asyncHandler(async (req, res) => ok(res, await staffService.getConfig(sid(req)))));
staffRouter.put('/settings', authorizePermission('staff:configure'), validate(staffConfigSchema), asyncHandler(async (req, res) => ok(res, await staffService.updateConfig(sid(req), req.body, uid(req), req))));
staffRouter.get('/categories', authorizePermission('staff:view', 'staff:attendance'), asyncHandler(async (req, res) => ok(res, await staffService.categories(sid(req)))));
staffRouter.get('/stats', authorizePermission('staff:view'), asyncHandler(async (req, res) => ok(res, await staffService.stats(sid(req)))));
staffRouter.get('/attendance/register', authorizePermission('staff:attendance', 'staff:view'), validate(registerQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await staffService.register(sid(req), (req.query.month as string) ?? new Date().toISOString().slice(0, 7), { categoryKey: req.query.categoryKey as string | undefined }))));
staffRouter.get('/attendance/export', authorizePermission('staff:export', 'staff:attendance'), validate(registerQuerySchema, 'query'), asyncHandler(async (req, res) => { const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7); const rows = await staffService.exportRegister(sid(req), month); auditService.record({ action: 'staff.register_exported', resource: 'Attendance', societyId: sid(req), metadata: { month, count: rows.length }, req }); csv(res, `attendance-${month}.csv`, rows); }));
staffRouter.post('/attendance', authorizePermission('staff:attendance'), validate(attendanceMarkSchema), asyncHandler(async (req, res) => ok(res, await staffService.markAttendance(sid(req), req.body, uid(req), req))));
staffRouter.get('/', authorizePermission('staff:view', 'staff:attendance'), validate(staffListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await staffService.list(sid(req), req.query as any, staffActor(req)))));
staffRouter.post('/', authorizePermission('staff:create'), validate(staffCreateSchema), asyncHandler(async (req, res) => created(res, await staffService.create(sid(req), req.body, uid(req), req))));
staffRouter.get('/:id', authorizePermission('staff:view', 'staff:attendance'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await staffService.get(sid(req), req.params.id, staffActor(req)))));
staffRouter.patch('/:id', authorizePermission('staff:update'), validate(idParamSchema, 'params'), validate(staffUpdateSchema), asyncHandler(async (req, res) => ok(res, await staffService.update(sid(req), req.params.id, req.body, uid(req), req))));
staffRouter.delete('/:id', authorizePermission('staff:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await staffService.remove(sid(req), req.params.id, uid(req), req); noContent(res); }));
staffRouter.post('/:id/check-in', authorizePermission('staff:attendance'), validate(idParamSchema, 'params'), validate(punchSchema), asyncHandler(async (req, res) => ok(res, await staffService.punch(sid(req), req.params.id, 'IN', req.body, uid(req), req))));
staffRouter.post('/:id/check-out', authorizePermission('staff:attendance'), validate(idParamSchema, 'params'), validate(punchSchema), asyncHandler(async (req, res) => ok(res, await staffService.punch(sid(req), req.params.id, 'OUT', req.body, uid(req), req))));

// ------------------------------------------------------------------ domestic help
const helpActor = (req: any) => ({ userId: uid(req), ownScope: !perms(req).has('domestic_help:view'), unitIds: unitIds(req), isGuard: perms(req).has('visitors:checkin') && !perms(req).has('domestic_help:update') });
export const domesticHelpRouter = Router();
domesticHelpRouter.use(authenticate, requireSociety, requireModule('domestic_help'), requireSubscription());
domesticHelpRouter.get('/settings', authorizePermission('domestic_help:view', 'domestic_help:verify'), asyncHandler(async (req, res) => ok(res, await domesticHelpService.getConfig(sid(req)))));
domesticHelpRouter.put('/settings', authorizePermission('domestic_help:verify', 'domestic_help:update'), validate(helpConfigSchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.updateConfig(sid(req), req.body, uid(req), req))));
domesticHelpRouter.get('/types', authorizePermission('domestic_help:view', 'domestic_help:view_own', 'domestic_help:create_own'), asyncHandler(async (req, res) => ok(res, await domesticHelpService.types(sid(req)))));
domesticHelpRouter.get('/stats', authorizePermission('domestic_help:view'), asyncHandler(async (req, res) => ok(res, await domesticHelpService.stats(sid(req)))));
domesticHelpRouter.post('/lookup', authorizePermission('domestic_help:view'), validate(helpLookupSchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.lookup(sid(req), req.body.code))));
domesticHelpRouter.get('/logs', authorizePermission('domestic_help:view', 'domestic_help:view_own'), validate(helpLogsQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await domesticHelpService.logs(sid(req), req.query as any, helpActor(req)))));
domesticHelpRouter.get('/', authorizePermission('domestic_help:view', 'domestic_help:view_own'), validate(helpListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await domesticHelpService.list(sid(req), req.query as any, helpActor(req)))));
domesticHelpRouter.post('/', authorizePermission('domestic_help:create', 'domestic_help:create_own'), validate(helpRegisterSchema), asyncHandler(async (req, res) => created(res, await domesticHelpService.register(sid(req), req.body, { ...helpActor(req), ownScope: !perms(req).has('domestic_help:create') }, req))));
domesticHelpRouter.get('/:id', authorizePermission('domestic_help:view', 'domestic_help:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await domesticHelpService.get(sid(req), req.params.id, helpActor(req)))));
domesticHelpRouter.patch('/:id', authorizePermission('domestic_help:update', 'domestic_help:create_own'), validate(idParamSchema, 'params'), validate(helpUpdateSchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.update(sid(req), req.params.id, req.body, { ...helpActor(req), ownScope: !perms(req).has('domestic_help:update') }, req))));
domesticHelpRouter.post('/:id/units/:unitId/remove', authorizePermission('domestic_help:update', 'domestic_help:create_own'), validate(idParamSchema.extend({ unitId: idParamSchema.shape.id }), 'params'), asyncHandler(async (req, res) => ok(res, await domesticHelpService.removeFromUnit(sid(req), req.params.id, req.params.unitId, { ...helpActor(req), ownScope: !perms(req).has('domestic_help:update') }, req))));
domesticHelpRouter.post('/:id/verify', authorizePermission('domestic_help:verify'), validate(idParamSchema, 'params'), validate(helpVerifySchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.verify(sid(req), req.params.id, req.body, uid(req), req))));
domesticHelpRouter.post('/:id/block', authorizePermission('domestic_help:update', 'domestic_help:verify'), validate(idParamSchema, 'params'), validate(helpBlockSchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.setBlocked(sid(req), req.params.id, true, req.body.reason, uid(req), req))));
domesticHelpRouter.post('/:id/unblock', authorizePermission('domestic_help:update', 'domestic_help:verify'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await domesticHelpService.setBlocked(sid(req), req.params.id, false, undefined, uid(req), req))));
domesticHelpRouter.post('/:id/check-in', authorizePermission('domestic_help:view'), validate(idParamSchema, 'params'), validate(helpPunchSchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.punch(sid(req), req.params.id, 'IN', req.body, uid(req), req))));
domesticHelpRouter.post('/:id/check-out', authorizePermission('domestic_help:view'), validate(idParamSchema, 'params'), validate(helpPunchSchema), asyncHandler(async (req, res) => ok(res, await domesticHelpService.punch(sid(req), req.params.id, 'OUT', req.body, uid(req), req))));

// ------------------------------------------------------------------ vehicles
const vehicleActor = (req: any) => ({ userId: uid(req), ownScope: !perms(req).has('vehicles:view'), unitIds: unitIds(req), isGuard: !perms(req).has('vehicles:update') && perms(req).has('visitors:checkin') });
export const vehiclesRouter = Router();
vehiclesRouter.use(authenticate, requireSociety, requireModule('vehicles'), requireSubscription());
vehiclesRouter.get('/lookup', authorizePermission('vehicles:view', 'visitors:checkin'), validate(vehicleLookupQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await vehicleService.lookup(sid(req), String(req.query.q), vehicleActor(req)))));
vehiclesRouter.get('/stats', authorizePermission('vehicles:view'), asyncHandler(async (req, res) => ok(res, await vehicleService.stats(sid(req)))));
vehiclesRouter.get('/', authorizePermission('vehicles:view', 'vehicles:view_own'), validate(vehicleListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await vehicleService.list(sid(req), req.query as any, vehicleActor(req)))));
vehiclesRouter.post('/', authorizePermission('vehicles:create', 'vehicles:create_own'), validate(vehicleCreateSchema), asyncHandler(async (req, res) => created(res, await vehicleService.create(sid(req), req.body, { ...vehicleActor(req), ownScope: !perms(req).has('vehicles:create') }, req))));
vehiclesRouter.get('/:id', authorizePermission('vehicles:view', 'vehicles:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await vehicleService.get(sid(req), req.params.id, vehicleActor(req)))));
vehiclesRouter.patch('/:id', authorizePermission('vehicles:update', 'vehicles:create_own'), validate(idParamSchema, 'params'), validate(vehicleUpdateSchema), asyncHandler(async (req, res) => ok(res, await vehicleService.update(sid(req), req.params.id, req.body, { ...vehicleActor(req), ownScope: !perms(req).has('vehicles:update') }, req))));
vehiclesRouter.delete('/:id', authorizePermission('vehicles:delete', 'vehicles:create_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await vehicleService.remove(sid(req), req.params.id, { ...vehicleActor(req), ownScope: !perms(req).has('vehicles:delete') }, req); noContent(res); }));

// ------------------------------------------------------------------ parking
export const parkingRouter = Router();
parkingRouter.use(authenticate, requireSociety, requireModule('parking'), requireSubscription());
parkingRouter.get('/stats', authorizePermission('parking:view'), asyncHandler(async (req, res) => ok(res, await parkingService.stats(sid(req)))));
parkingRouter.get('/', authorizePermission('parking:view'), validate(slotListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await parkingService.list(sid(req), req.query as any))));
parkingRouter.post('/', authorizePermission('parking:create'), validate(slotCreateSchema), asyncHandler(async (req, res) => created(res, await parkingService.create(sid(req), req.body, req))));
parkingRouter.post('/bulk', authorizePermission('parking:create'), validate(slotBulkSchema), asyncHandler(async (req, res) => created(res, await parkingService.bulkCreate(sid(req), req.body, req))));
parkingRouter.patch('/:id', authorizePermission('parking:update'), validate(idParamSchema, 'params'), validate(slotUpdateSchema), asyncHandler(async (req, res) => ok(res, await parkingService.update(sid(req), req.params.id, req.body, req))));
parkingRouter.delete('/:id', authorizePermission('parking:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await parkingService.remove(sid(req), req.params.id, req); noContent(res); }));
parkingRouter.post('/:id/allocate', authorizePermission('parking:allocate'), validate(idParamSchema, 'params'), validate(allocateSchema), asyncHandler(async (req, res) => ok(res, await parkingService.allocate(sid(req), req.params.id, req.body, uid(req), req))));
parkingRouter.post('/:id/release', authorizePermission('parking:allocate'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await parkingService.release(sid(req), req.params.id, uid(req), req))));
