import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { amenityService, type Actor } from './amenities.service';
import { amenitiesConfigSchema, amenityCreateSchema, amenityListQuerySchema, amenityUpdateSchema, availabilityQuerySchema, bookingCreateSchema, bookingListQuerySchema, calendarQuerySchema, cancelBookingSchema, decideBookingSchema, refundBookingSchema } from './amenities.schemas';
import './amenities.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const perms = (req: any) => req.tenant!.permissions as Set<string>;
/** Scope is decided by explicit permissions, not by which permission happened to match the route. */
const actor = (req: any): Actor => ({ userId: uid(req), ownScope: !perms(req).has('amenities:view_bookings'), unitIds: (req.tenant!.unitIds ?? []) as string[], residentId: req.tenant!.residentId ?? null, canCancelAny: perms(req).has('amenities:cancel'), canManage: perms(req).has('amenities:update') });
const wfUser = (req: any) => ({ userId: uid(req), roleKeys: req.tenant!.roleKeys as string[], permissions: perms(req) });
const ANY = ['amenities:view', 'amenities:view_own', 'amenities:book', 'amenities:view_bookings', 'amenities:update'] as const;

export const amenitiesRouter = Router();
amenitiesRouter.use(authenticate, requireSociety, requireModule('amenities'), requireSubscription());

// ---- settings, types, stats
amenitiesRouter.get('/settings', authorizePermission('amenities:update', 'amenities:view_bookings', 'amenities:view'), asyncHandler(async (req, res) => ok(res, await amenityService.getConfig(sid(req)))));
amenitiesRouter.put('/settings', authorizePermission('amenities:update'), validate(amenitiesConfigSchema), asyncHandler(async (req, res) => ok(res, await amenityService.updateConfig(sid(req), req.body, uid(req), req))));
amenitiesRouter.get('/types', authorizePermission(...ANY), asyncHandler(async (req, res) => ok(res, await amenityService.types(sid(req)))));
amenitiesRouter.get('/stats', authorizePermission('amenities:view_bookings'), asyncHandler(async (req, res) => ok(res, await amenityService.stats(sid(req)))));

// ---- bookings (before /:id routes)
amenitiesRouter.get('/bookings', authorizePermission('amenities:view_bookings', 'amenities:view_own', 'amenities:book'), validate(bookingListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await amenityService.list(sid(req), req.query as any, actor(req)))));
amenitiesRouter.get('/bookings/export', authorizePermission('amenities:export'), validate(bookingListQuerySchema, 'query'), asyncHandler(async (req, res) => { const rows = await amenityService.exportRows(sid(req), req.query as any, actor(req)); auditService.record({ action: 'amenity.bookings_exported', resource: 'AmenityBooking', societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="amenity-bookings.csv"'); res.send(toCsv(rows)); }));
amenitiesRouter.post('/bookings', authorizePermission('amenities:book'), validate(bookingCreateSchema), asyncHandler(async (req, res) => created(res, await amenityService.book(sid(req), req.body, actor(req), req))));
amenitiesRouter.get('/bookings/:id', authorizePermission('amenities:view_bookings', 'amenities:view_own', 'amenities:book'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await amenityService.get(sid(req), req.params.id, actor(req)))));
amenitiesRouter.post('/bookings/:id/cancel', authorizePermission('amenities:cancel', 'amenities:book', 'amenities:view_own'), validate(idParamSchema, 'params'), validate(cancelBookingSchema), asyncHandler(async (req, res) => ok(res, await amenityService.cancel(sid(req), req.params.id, req.body, actor(req), req))));
amenitiesRouter.post('/bookings/:id/decide', authorizePermission('amenities:approve'), validate(idParamSchema, 'params'), validate(decideBookingSchema), asyncHandler(async (req, res) => ok(res, await amenityService.decide(sid(req), req.params.id, req.body, wfUser(req), req))));
amenitiesRouter.post('/bookings/:id/refund', authorizePermission('payments:refund'), validate(idParamSchema, 'params'), validate(refundBookingSchema), asyncHandler(async (req, res) => ok(res, await amenityService.refund(sid(req), req.params.id, req.body, uid(req), req))));

// ---- catalogue
amenitiesRouter.get('/', authorizePermission(...ANY), validate(amenityListQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await amenityService.listAmenities(sid(req), req.query as any, actor(req)))));
amenitiesRouter.post('/', authorizePermission('amenities:create'), validate(amenityCreateSchema), asyncHandler(async (req, res) => created(res, await amenityService.createAmenity(sid(req), req.body, uid(req), req))));
amenitiesRouter.get('/:id', authorizePermission(...ANY), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await amenityService.getAmenity(sid(req), req.params.id, actor(req)))));
amenitiesRouter.patch('/:id', authorizePermission('amenities:update'), validate(idParamSchema, 'params'), validate(amenityUpdateSchema), asyncHandler(async (req, res) => ok(res, await amenityService.updateAmenity(sid(req), req.params.id, req.body, req))));
amenitiesRouter.delete('/:id', authorizePermission('amenities:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await amenityService.removeAmenity(sid(req), req.params.id, uid(req), req); noContent(res); }));
amenitiesRouter.get('/:id/availability', authorizePermission(...ANY), validate(idParamSchema, 'params'), validate(availabilityQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await amenityService.availability(sid(req), req.params.id, req.query.date as string | undefined, actor(req)))));
amenitiesRouter.get('/:id/calendar', authorizePermission(...ANY), validate(idParamSchema, 'params'), validate(calendarQuerySchema, 'query'), asyncHandler(async (req, res) => ok(res, await amenityService.calendar(sid(req), req.params.id, req.query.from as any, req.query.to as any, actor(req)))));
