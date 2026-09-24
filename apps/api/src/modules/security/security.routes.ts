import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { incidentService, type Actor as IncidentActor } from './incidents.service';
import { emergencyService, type Actor as EmergencyActor } from './emergency.service';
import { acknowledgeSchema, alertListQuerySchema, alertResolveSchema, broadcastSchema, contactSchema, contactUpdateSchema, contactsReorderSchema, emergencyConfigSchema, gateSchema, gateUpdateSchema, incidentAssignSchema, incidentCloseSchema, incidentCreateSchema, incidentListQuerySchema, incidentNoteSchema, incidentResolveSchema, incidentStatusSchema, incidentUpdateSchema, securityConfigSchema, sosSchema } from './security.schemas';
import './security.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const perms = (req: any) => req.tenant!.permissions as Set<string>;
const isGuard = (req: any) => perms(req).has('visitors:checkin') && !perms(req).has('society:update');

// ------------------------------------------------------------------ security: incidents & gates
const incidentActor = (req: any): IncidentActor => ({ userId: uid(req), canViewAll: perms(req).has('security:view'), canUpdate: perms(req).has('security:update'), canResolve: perms(req).has('security:resolve'), isGuard: isGuard(req) });
export const securityRouter = Router();
securityRouter.use(authenticate, requireSociety, requireModule('security'), requireSubscription());
securityRouter.get('/settings', authorizePermission('security:view', 'security:configure'), asyncHandler(async (req, res) => ok(res, await incidentService.getConfig(sid(req)))));
securityRouter.put('/settings', authorizePermission('security:configure'), validate(securityConfigSchema), asyncHandler(async (req, res) => ok(res, await incidentService.updateConfig(sid(req), req.body, uid(req), req))));
securityRouter.get('/types', authorizePermission('security:view', 'security:create'), asyncHandler(async (req, res) => ok(res, await incidentService.types(sid(req)))));
securityRouter.get('/stats', authorizePermission('security:view', 'security:create'), asyncHandler(async (req, res) => ok(res, await incidentService.stats(sid(req), incidentActor(req)))));
securityRouter.get('/gates', authorizePermission('security:view', 'security:configure', 'security:create'), asyncHandler(async (req, res) => ok(res, (await incidentService.listGates(sid(req))).map((g: any) => ({ ...g, id: String(g._id) })))));
securityRouter.post('/gates', authorizePermission('security:configure'), validate(gateSchema), asyncHandler(async (req, res) => created(res, await incidentService.createGate(sid(req), req.body, uid(req), req))));
securityRouter.patch('/gates/:id', authorizePermission('security:configure'), validate(idParamSchema, 'params'), validate(gateUpdateSchema), asyncHandler(async (req, res) => ok(res, await incidentService.updateGate(sid(req), req.params.id, req.body, req))));
securityRouter.get('/incidents/export', authorizePermission('security:export'), validate(incidentListQuerySchema, 'query'), asyncHandler(async (req, res) => { const rows = await incidentService.exportRows(sid(req), req.query as any, incidentActor(req)); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="incidents.csv"'); res.send(toCsv(rows)); }));
securityRouter.get('/incidents', authorizePermission('security:view', 'security:create'), validate(incidentListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await incidentService.list(sid(req), req.query as any, incidentActor(req)))));
securityRouter.post('/incidents', authorizePermission('security:create'), validate(incidentCreateSchema), asyncHandler(async (req, res) => { const r: any = await incidentService.create(sid(req), req.body, incidentActor(req), req); return r.replayed ? ok(res, r) : created(res, r); }));
securityRouter.get('/incidents/:id', authorizePermission('security:view', 'security:create'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await incidentService.get(sid(req), req.params.id, incidentActor(req)))));
securityRouter.patch('/incidents/:id', authorizePermission('security:update'), validate(idParamSchema, 'params'), validate(incidentUpdateSchema), asyncHandler(async (req, res) => ok(res, await incidentService.update(sid(req), req.params.id, req.body, incidentActor(req), req))));
securityRouter.post('/incidents/:id/assign', authorizePermission('security:update'), validate(idParamSchema, 'params'), validate(incidentAssignSchema), asyncHandler(async (req, res) => ok(res, await incidentService.assign(sid(req), req.params.id, req.body.assignedTo, incidentActor(req), req))));
securityRouter.post('/incidents/:id/notes', authorizePermission('security:update', 'security:create'), validate(idParamSchema, 'params'), validate(incidentNoteSchema), asyncHandler(async (req, res) => ok(res, await incidentService.addNote(sid(req), req.params.id, req.body, incidentActor(req), req))));
securityRouter.post('/incidents/:id/status', authorizePermission('security:update'), validate(idParamSchema, 'params'), validate(incidentStatusSchema), asyncHandler(async (req, res) => ok(res, await incidentService.setStatus(sid(req), req.params.id, req.body.status, req.body.note, incidentActor(req), req))));
securityRouter.post('/incidents/:id/resolve', authorizePermission('security:resolve'), validate(idParamSchema, 'params'), validate(incidentResolveSchema), asyncHandler(async (req, res) => ok(res, await incidentService.resolve(sid(req), req.params.id, req.body, incidentActor(req), req))));
securityRouter.post('/incidents/:id/close', authorizePermission('security:resolve', 'security:update'), validate(idParamSchema, 'params'), validate(incidentCloseSchema), asyncHandler(async (req, res) => ok(res, await incidentService.close(sid(req), req.params.id, req.body.note, incidentActor(req), req))));
securityRouter.delete('/incidents/:id', authorizePermission('security:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await incidentService.remove(sid(req), req.params.id, incidentActor(req), req); return noContent(res); }));

// ------------------------------------------------------------------ emergency: contacts, SOS, broadcasts
const emergencyActor = (req: any): EmergencyActor => ({ userId: uid(req), unitIds: (req.tenant!.unitIds ?? []) as string[], roleKeys: (req.tenant!.roleKeys ?? []) as string[], canRespond: perms(req).has('emergency:respond'), canManage: perms(req).has('emergency:manage'), canBroadcast: perms(req).has('emergency:broadcast'), isGuard: isGuard(req) });
export const emergencyRouter = Router();
emergencyRouter.use(authenticate, requireSociety, requireModule('emergency'));
// Emergency reads and SOS stay available on a lapsed subscription: the gate and residents must always be able to call for help.
emergencyRouter.get('/settings', authorizePermission('emergency:manage', 'emergency:respond'), asyncHandler(async (req, res) => ok(res, await emergencyService.getConfig(sid(req)))));
emergencyRouter.put('/settings', authorizePermission('emergency:manage'), validate(emergencyConfigSchema), asyncHandler(async (req, res) => ok(res, await emergencyService.updateConfig(sid(req), req.body, uid(req), req))));
emergencyRouter.get('/contacts', authorizePermission('emergency:view'), asyncHandler(async (req, res) => ok(res, await emergencyService.contacts(sid(req), emergencyActor(req)))));
emergencyRouter.post('/contacts', authorizePermission('emergency:manage'), requireSubscription(), validate(contactSchema), asyncHandler(async (req, res) => created(res, await emergencyService.createContact(sid(req), req.body, uid(req), req))));
emergencyRouter.post('/contacts/reorder', authorizePermission('emergency:manage'), validate(contactsReorderSchema), asyncHandler(async (req, res) => ok(res, await emergencyService.reorderContacts(sid(req), req.body.ids, uid(req)))));
emergencyRouter.patch('/contacts/:id', authorizePermission('emergency:manage'), validate(idParamSchema, 'params'), validate(contactUpdateSchema), asyncHandler(async (req, res) => ok(res, await emergencyService.updateContact(sid(req), req.params.id, req.body, uid(req), req))));
emergencyRouter.delete('/contacts/:id', authorizePermission('emergency:manage'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await emergencyService.removeContact(sid(req), req.params.id, uid(req), req); return noContent(res); }));
emergencyRouter.get('/stats', authorizePermission('emergency:manage', 'emergency:respond'), asyncHandler(async (req, res) => ok(res, await emergencyService.stats(sid(req)))));
emergencyRouter.get('/active', authorizePermission('emergency:view'), asyncHandler(async (req, res) => ok(res, await emergencyService.active(sid(req), emergencyActor(req)))));
emergencyRouter.get('/alerts', authorizePermission('emergency:view'), validate(alertListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await emergencyService.list(sid(req), req.query as any, emergencyActor(req)))));
emergencyRouter.post('/sos', authorizePermission('emergency:sos'), validate(sosSchema), asyncHandler(async (req, res) => { const r: any = await emergencyService.raiseSos(sid(req), req.body, emergencyActor(req), req); return r.replayed ? ok(res, r) : created(res, r); }));
emergencyRouter.post('/broadcast', authorizePermission('emergency:broadcast'), validate(broadcastSchema), asyncHandler(async (req, res) => created(res, await emergencyService.broadcast(sid(req), req.body, emergencyActor(req), req))));
emergencyRouter.get('/alerts/:id', authorizePermission('emergency:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await emergencyService.get(sid(req), req.params.id, emergencyActor(req)))));
emergencyRouter.post('/alerts/:id/acknowledge', authorizePermission('emergency:respond'), validate(idParamSchema, 'params'), validate(acknowledgeSchema), asyncHandler(async (req, res) => ok(res, await emergencyService.acknowledge(sid(req), req.params.id, req.body.note, emergencyActor(req), req))));
emergencyRouter.post('/alerts/:id/resolve', authorizePermission('emergency:respond', 'emergency:broadcast', 'emergency:sos'), validate(idParamSchema, 'params'), validate(alertResolveSchema), asyncHandler(async (req, res) => ok(res, await emergencyService.resolve(sid(req), req.params.id, req.body, emergencyActor(req), req))));
