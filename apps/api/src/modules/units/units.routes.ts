import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, noContent, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { unitService } from './units.service';
import { buildingCreateSchema, buildingUpdateSchema, unitBulkSchema, unitCreateSchema, unitListQuerySchema, unitUpdateSchema } from './units.schemas';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;

export const buildingsRouter = Router();
buildingsRouter.use(authenticate, requireSociety, requireModule('units'), requireSubscription());
buildingsRouter.get('/', authorizePermission('units:view', 'units:manage_structure', 'residents:view_own'), asyncHandler(async (req, res) => ok(res, await unitService.listBuildings(sid(req)))));
buildingsRouter.post('/', authorizePermission('units:manage_structure'), validate(buildingCreateSchema), asyncHandler(async (req, res) => created(res, await unitService.createBuilding(sid(req), req.body, uid(req), req))));
buildingsRouter.patch('/:id', authorizePermission('units:manage_structure'), validate(idParamSchema, 'params'), validate(buildingUpdateSchema), asyncHandler(async (req, res) => ok(res, await unitService.updateBuilding(sid(req), req.params.id, req.body, req))));
buildingsRouter.delete('/:id', authorizePermission('units:manage_structure'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await unitService.deleteBuilding(sid(req), req.params.id, uid(req), req); noContent(res); }));

export const unitsRouter = Router();
unitsRouter.use(authenticate, requireSociety, requireModule('units'), requireSubscription());
unitsRouter.get('/stats', authorizePermission('units:view'), asyncHandler(async (req, res) => ok(res, await unitService.stats(sid(req)))));
unitsRouter.get(
  '/export',
  authorizePermission('units:export'),
  asyncHandler(async (req, res) => {
    const rows = await unitService.exportRows(sid(req));
    auditService.record({ action: 'unit.exported', resource: 'Unit', societyId: sid(req), metadata: { count: rows.length }, req });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="units.csv"');
    res.send(toCsv(rows));
  }),
);
unitsRouter.get('/', authorizePermission('units:view', 'residents:view_own'), validate(unitListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await unitService.list(sid(req), req.query as any, req.ownScope ? { unitIds: req.tenant!.unitIds } : {}))));
unitsRouter.post('/', authorizePermission('units:create'), validate(unitCreateSchema), asyncHandler(async (req, res) => created(res, await unitService.create(sid(req), req.body, uid(req), req))));
unitsRouter.post('/bulk', authorizePermission('units:create'), validate(unitBulkSchema), asyncHandler(async (req, res) => created(res, await unitService.bulkCreate(sid(req), req.body, uid(req), req))));
unitsRouter.get('/:id', authorizePermission('units:view', 'residents:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await unitService.get(sid(req), req.params.id, req.ownScope ? { unitIds: req.tenant!.unitIds } : {}))));
unitsRouter.patch('/:id', authorizePermission('units:update'), validate(idParamSchema, 'params'), validate(unitUpdateSchema), asyncHandler(async (req, res) => ok(res, await unitService.update(sid(req), req.params.id, req.body, req))));
unitsRouter.delete('/:id', authorizePermission('units:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await unitService.remove(sid(req), req.params.id, uid(req), req); noContent(res); }));
