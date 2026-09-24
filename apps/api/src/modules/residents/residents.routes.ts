import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, noContent, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { residentService } from './residents.service';
import { familyMemberSchema, inviteResidentSchema, lookupQuerySchema, moveListQuerySchema, moveRequestSchema, rejectSchema, residentCreateSchema, residentListQuerySchema, residentUpdateSchema } from './residents.schemas';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const scope = (req: any) => (req.ownScope ? { unitIds: req.tenant!.unitIds as string[] } : {});
const canViewContact = (req: any) => req.tenant!.permissions.has('residents:view_contact') || req.tenant!.permissions.has('residents:update') || Boolean(req.ownScope);

export const residentsRouter = Router();
residentsRouter.use(authenticate, requireSociety, requireModule('residents'), requireSubscription());

residentsRouter.get('/stats', authorizePermission('residents:view'), asyncHandler(async (req, res) => ok(res, await residentService.stats(sid(req)))));
residentsRouter.get('/lookup', authorizePermission('residents:lookup', 'residents:view'), validate(lookupQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await residentService.lookup(sid(req), String(req.query.q), Number(req.query.limit)))));
residentsRouter.get(
  '/export',
  authorizePermission('residents:export'),
  asyncHandler(async (req, res) => {
    const rows = await residentService.exportRows(sid(req), canViewContact(req));
    auditService.record({ action: 'resident.exported', resource: 'Resident', societyId: sid(req), metadata: { count: rows.length }, req });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="residents.csv"');
    res.send(toCsv(rows));
  }),
);

// ---- member self-service household
residentsRouter.get('/my', authorizePermission('residents:view_own'), asyncHandler(async (req, res) => ok(res, await residentService.household(sid(req), uid(req)))));
residentsRouter.post('/my/family', authorizePermission('residents:manage_own'), validate(familyMemberSchema), asyncHandler(async (req, res) => created(res, (await residentService.addFamilyMember(sid(req), uid(req), req.body, req)).toJSON())));

// ---- move workflows
residentsRouter.get('/moves', authorizePermission('residents:move', 'residents:approve_move', 'residents:view'), validate(moveListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await residentService.listMoves(sid(req), req.query as any))));
residentsRouter.post('/moves', authorizePermission('residents:move', 'residents:approve_move'), validate(moveRequestSchema), asyncHandler(async (req, res) => created(res, (await residentService.requestMove(sid(req), req.body, { userId: uid(req), canApprove: req.tenant!.permissions.has('residents:approve_move') }, req)).toJSON())));
residentsRouter.post('/moves/:id/approve', authorizePermission('residents:approve_move'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, (await residentService.approveMove(sid(req), req.params.id, uid(req), req)).toJSON())));
residentsRouter.post('/moves/:id/reject', authorizePermission('residents:approve_move'), validate(idParamSchema, 'params'), validate(rejectSchema), asyncHandler(async (req, res) => ok(res, (await residentService.rejectMove(sid(req), req.params.id, req.body.reason, uid(req), req)).toJSON())));

// ---- CRUD
residentsRouter.get('/', authorizePermission('residents:view', 'residents:view_own'), validate(residentListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await residentService.list(sid(req), req.query as any, scope(req), { canViewContact: canViewContact(req) }))));
residentsRouter.post('/', authorizePermission('residents:create'), validate(residentCreateSchema), asyncHandler(async (req, res) => created(res, (await residentService.create(sid(req), req.body, uid(req), req)).toJSON())));
residentsRouter.get('/:id', authorizePermission('residents:view', 'residents:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await residentService.get(sid(req), req.params.id, scope(req), { canViewContact: canViewContact(req) }))));
residentsRouter.patch('/:id', authorizePermission('residents:update', 'residents:manage_own'), validate(idParamSchema, 'params'), validate(residentUpdateSchema), asyncHandler(async (req, res) => ok(res, (await residentService.update(sid(req), req.params.id, req.ownScope ? { ...req.body, unitId: undefined, type: undefined, status: undefined, ownership: undefined, tenancy: undefined } : req.body, uid(req), req, scope(req))).toJSON())));
residentsRouter.delete('/:id', authorizePermission('residents:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await residentService.remove(sid(req), req.params.id, uid(req), req); noContent(res); }));
residentsRouter.post('/:id/invite', authorizePermission('residents:update'), validate(idParamSchema, 'params'), validate(inviteResidentSchema), asyncHandler(async (req, res) => created(res, await residentService.inviteLogin(sid(req), req.params.id, req.body, uid(req), req))));
