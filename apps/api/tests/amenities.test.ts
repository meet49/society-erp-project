import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { amenityService } from '../src/modules/amenities/amenities.service';
import { AmenityBooking } from '../src/models/amenity-booking.model';
import { Invoice } from '../src/models/invoice.model';
import { Payment } from '../src/models/payment.model';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let adminUserId = '';
let otherAdmin = '';
let member = '';
let memberUserId = '';
const units: string[] = [];
let gym: any;
let hall: any;
let court: any;
let gymBooking: any;
let paidCourtBooking: any;

const at = (daysAhead: number, hour: number) => dayjs().add(daysAhead, 'day').hour(hour).minute(0).second(0).millisecond(0);
const post = (path: string, token: string, body: Record<string, unknown>) => api.post(`/api/v1${path}`).set(auth(token)).send(body);
const get = (path: string, token: string) => api.get(`/api/v1${path}`).set(auth(token));

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  const a = await login(api, s.adminEmail, s.adminPassword);
  admin = a.accessToken;
  adminUserId = a.context.user.id;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await post('/buildings', admin, { name: 'Tower A', code: 'A', floors: 1 })).body.data;
  for (const n of ['101', '102', '103', '104', '105', '106']) units.push((await post('/units', admin, { buildingId: b.id, floor: 1, number: n })).body.data.id);
  const roles = (await get('/society/roles', admin)).body.data;
  const resident = (await post('/residents', admin, { unitId: units[0], name: 'Resident One', email: `res-${Date.now()}@test.local`, phone: '9000000111', type: 'OWNER' })).body.data;
  const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
  const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
  member = accepted.body.data.accessToken;
  memberUserId = accepted.body.data.context.user.id;
});
afterAll(teardownTestApp);

describe('amenities & bookings', () => {
  it('admin sets up the catalogue with pricing, capacity and approval rules; members see active amenities only', async () => {
    const g = await post('/amenities', admin, { name: 'Gym', typeKey: 'gym', capacity: 1, schedule: { openTime: '06:00', closeTime: '22:00', maxSlotsPerBooking: 2 } });
    expect(g.status).toBe(201);
    gym = g.body.data;
    expect(gym.code).toBe('GYM');
    expect(gym.pricing.mode).toBe('FREE');
    hall = (await post('/amenities', admin, { name: 'Community Hall', typeKey: 'HALL', bookingMode: 'FULL_DAY', requiresApproval: true, maxGuests: 150, pricing: { mode: 'PER_BOOKING', amount: 5000, deposit: 2000 }, schedule: { openTime: '08:00', closeTime: '23:00' } })).body.data;
    court = (await post('/amenities', admin, { name: 'Tennis Court', typeKey: 'COURT', capacity: 2, pricing: { mode: 'PER_SLOT', amount: 100 } })).body.data;
    expect((await post('/amenities', admin, { name: 'Old Pool', typeKey: 'POOL', status: 'INACTIVE' })).status).toBe(201);
    expect((await post('/amenities', admin, { name: 'Gym 2', code: 'GYM' })).status).toBe(409);
    expect((await post('/amenities', admin, { name: 'Sauna', typeKey: 'NOPE' })).status).toBe(422);
    expect((await post('/amenities', member, { name: 'Members cannot create' })).status).toBe(403);
    expect((await get('/amenities', member)).body.data.map((a: any) => a.name).sort()).toEqual(['Community Hall', 'Gym', 'Tennis Court']);
    expect((await get('/amenities?includeInactive=true', admin)).body.data).toHaveLength(4);
    expect((await get('/amenities/types', member)).body.data.map((t: any) => t.key)).toContain('GYM');
    expect((await api.put('/api/v1/amenities/settings').set(auth(member)).send({ cancellationHours: 1 })).status).toBe(403);
    const cfg = await api.put('/api/v1/amenities/settings').set(auth(admin)).send({ cancellationHours: 12, maxActiveBookingsPerUnit: 0 });
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.cancellationHours).toBe(12);
    expect(cfg.body.data.slotMinutes).toBe(60);
  });

  it('availability lists slots with capacity; bookings must align with the slot grid and the booking window', async () => {
    const av = await get(`/amenities/${gym.id}/availability?date=${at(1, 0).format('YYYY-MM-DD')}`, member);
    expect(av.status).toBe(200);
    expect(av.body.data.slots).toHaveLength(16);
    expect(dayjs(av.body.data.slots[0].startAt).hour()).toBe(6);
    expect(av.body.data.slots.every((sl: any) => sl.bookable && sl.available === 1)).toBe(true);
    expect((await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(1, 10).add(30, 'minute').toISOString() })).status).toBe(422);
    expect((await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(-1, 10).toISOString() })).status).toBe(422);
    expect((await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(40, 10).toISOString() })).status).toBe(422);
    expect((await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(1, 10).toISOString(), slots: 3 })).status).toBe(422);
    expect((await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(1, 10).toISOString(), unitId: units[1] })).status).toBe(403);
  });

  it('exclusive amenities cannot be double-booked; free bookings confirm instantly and notify the resident', async () => {
    const res = await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(1, 10).toISOString(), slots: 2 });
    expect(res.status).toBe(201);
    gymBooking = res.body.data;
    expect(gymBooking.status).toBe('CONFIRMED');
    expect(gymBooking.bookingNumber).toMatch(/^BK\//);
    expect(gymBooking.unitId.id).toBe(units[0]);
    expect(gymBooking.paymentStatus).toBe('NOT_REQUIRED');
    expect(dayjs(gymBooking.endAt).diff(dayjs(gymBooking.startAt), 'minute')).toBe(120);
    expect(gymBooking.mine).toBe(true);
    const clash = await post('/amenities/bookings', admin, { amenityId: gym.id, unitId: units[1], startAt: at(1, 11).toISOString() });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('BOOKING_OVERLAP');
    expect((await post('/amenities/bookings', admin, { amenityId: gym.id, unitId: units[1], startAt: at(1, 12).toISOString() })).status).toBe(201);
    const av = (await get(`/amenities/${gym.id}/availability?date=${at(1, 0).format('YYYY-MM-DD')}`, member)).body.data;
    const ten = av.slots.find((sl: any) => dayjs(sl.startAt).hour() === 10);
    expect(ten.booked).toBe(1);
    expect(ten.bookable).toBe(false);
    expect(ten.mine).toBe(true);
    const twelve = av.slots.find((sl: any) => dayjs(sl.startAt).hour() === 12);
    expect(twelve.mine).toBe(false);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: memberUserId, type: 'amenity.booking_confirmed' })).toBe(1);
    expect((await get('/amenities/bookings', member)).body.data).toHaveLength(1);
    expect((await get('/amenities/bookings', admin)).body.data).toHaveLength(2);
    const cal = await get(`/amenities/${gym.id}/calendar?from=${at(1, 0).toISOString()}&to=${at(2, 0).toISOString()}`, member);
    expect(cal.body.data).toHaveLength(2);
    expect(cal.body.data.find((c: any) => !c.mine).bookingNumber).toBeUndefined(); // other units' details are hidden from members
  });

  it('concurrent requests for a shared-capacity amenity never exceed capacity; paid bookings wait for payment', async () => {
    const start = at(3, 9).toISOString();
    const results = await Promise.all(units.slice(1).map((u) => post('/amenities/bookings', admin, { amenityId: court.id, unitId: u, startAt: start })));
    const okRes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(okRes).toHaveLength(2);
    expect(conflicts).toHaveLength(3);
    expect(conflicts.every((r) => r.body.code === 'BOOKING_OVERLAP')).toBe(true);
    paidCourtBooking = okRes[0].body.data;
    expect(paidCourtBooking.status).toBe('PENDING_PAYMENT');
    expect(paidCourtBooking.total).toBe(100);
    expect(paidCourtBooking.invoiceId).toBeTruthy();
    expect(dayjs(paidCourtBooking.paymentDueAt).isAfter(dayjs())).toBe(true);
    const invoice = await Invoice.findById(paidCourtBooking.invoiceId.id ?? paidCourtBooking.invoiceId).lean();
    expect(invoice!.status).toBe('ISSUED');
    expect(invoice!.total).toBe(100);
    const pay = await post('/payments', admin, { unitId: paidCourtBooking.unitId.id, amount: 100, method: 'CASH', invoiceIds: [String(invoice!._id)] });
    expect(pay.status).toBe(201);
    await flush(400);
    const after = (await get(`/amenities/bookings/${paidCourtBooking.id}`, admin)).body.data;
    expect(after.status).toBe('CONFIRMED');
    expect(after.paymentStatus).toBe('PAID');
    expect(after.paymentId.receiptNumber).toBeTruthy();
  });

  it('approval workflow: committee decides, then the resident pays; rejection and cancellation release the slot', async () => {
    const h1 = await post('/amenities/bookings', member, { amenityId: hall.id, startAt: at(5, 8).toISOString(), guests: 80, purpose: 'Birthday' });
    expect(h1.status).toBe(201);
    expect(h1.body.data.status).toBe('PENDING_APPROVAL');
    expect(h1.body.data.total).toBe(7000);
    expect(h1.body.data.workflow?.status).toBe('PENDING');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'amenity.booking_pending' })).toBe(1);
    const pending = await get('/approvals', admin);
    expect(pending.body.data.some((p: any) => p.entityType === 'AmenityBooking' && p.entityId === h1.body.data.id)).toBe(true);
    expect((await post(`/amenities/bookings/${h1.body.data.id}/decide`, member, { decision: 'APPROVED' })).status).toBe(403);
    const approved = await post(`/amenities/bookings/${h1.body.data.id}/decide`, admin, { decision: 'APPROVED', note: 'Enjoy' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('PENDING_PAYMENT');
    expect(approved.body.data.invoiceId.total).toBe(7000);
    expect(dayjs(approved.body.data.paymentDueAt).isAfter(dayjs())).toBe(true);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: memberUserId, type: 'amenity.payment_due' })).toBe(1);
    // resident changes their mind before paying: the invoice is voided and the slot is released
    const cancelled = await post(`/amenities/bookings/${h1.body.data.id}/cancel`, member, { reason: 'Plans changed' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.paymentStatus).toBe('VOID');
    expect((await Invoice.findById(approved.body.data.invoiceId.id).lean())!.status).toBe('CANCELLED');
    const h2 = (await post('/amenities/bookings', member, { amenityId: hall.id, startAt: at(6, 8).toISOString() })).body.data;
    const rejected = await post(`/amenities/bookings/${h2.id}/decide`, admin, { decision: 'REJECTED', note: 'Hall under repair' });
    expect(rejected.body.data.status).toBe('REJECTED');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: memberUserId, type: 'amenity.booking_rejected' })).toBe(1);
    expect((await post('/amenities/bookings', member, { amenityId: hall.id, startAt: at(5, 8).toISOString() })).status).toBe(201);
  });

  it('cancellation policy computes refunds and finance processes them through the payment', async () => {
    // committee cancels a paid booking → full refund due, finance notified, refund processed against the payment
    const cancelled = await post(`/amenities/bookings/${paidCourtBooking.id}/cancel`, admin, { reason: 'Court resurfacing' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.paymentStatus).toBe('REFUND_DUE');
    expect(cancelled.body.data.refund.amount).toBe(100);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'amenity.refund_due' })).toBe(1);
    expect((await post(`/amenities/bookings/${paidCourtBooking.id}/refund`, member, { reason: 'x' })).status).toBe(403);
    const refunded = await post(`/amenities/bookings/${paidCourtBooking.id}/refund`, admin, { reason: 'Court resurfacing' });
    expect(refunded.status).toBe(200);
    expect(refunded.body.data.paymentStatus).toBe('REFUNDED');
    const payment = await Payment.findById(refunded.body.data.paymentId.id ?? refunded.body.data.paymentId).lean();
    expect(payment!.refund?.amount).toBe(100);
    // late cancellation by the resident follows the configured percentage
    const mine = (await post('/amenities/bookings', member, { amenityId: court.id, startAt: at(2, 9).toISOString() })).body.data;
    await post('/payments', admin, { unitId: units[0], amount: 100, method: 'UPI', invoiceIds: [mine.invoiceId.id] }).expect(201);
    await flush(300);
    expect((await get(`/amenities/bookings/${mine.id}`, member)).body.data.status).toBe('CONFIRMED');
    await api.put('/api/v1/amenities/settings').set(auth(admin)).send({ cancellationHours: 100, lateCancellationRefundPercent: 50 }).expect(200);
    const late = await post(`/amenities/bookings/${mine.id}/cancel`, member, { reason: 'Travelling' });
    expect(late.body.data.paymentStatus).toBe('REFUND_DUE');
    expect(late.body.data.refund.amount).toBe(50);
    await api.put('/api/v1/amenities/settings').set(auth(admin)).send({ cancellationHours: 12, lateCancellationRefundPercent: 0 }).expect(200);
  });

  it('sweep completes finished bookings, expires unpaid holds, cancels unanswered approvals and returns deposits', async () => {
    const unpaid = (await post('/amenities/bookings', member, { amenityId: court.id, startAt: at(4, 9).toISOString() })).body.data;
    const unanswered = (await post('/amenities/bookings', member, { amenityId: hall.id, startAt: at(7, 8).toISOString() })).body.data;
    const r1 = await amenityService.sweep(at(1, 13).toDate());
    expect(r1.completed).toBeGreaterThanOrEqual(1);
    expect((await AmenityBooking.findById(gymBooking.id).lean())!.status).toBe('COMPLETED');
    const r2 = await amenityService.sweep(dayjs().add(25, 'hour').toDate());
    expect(r1.expired + r2.expired).toBeGreaterThanOrEqual(1); // the 24h payment window may already have lapsed at r1 depending on the time of day
    const expired = await AmenityBooking.findById(unpaid.id).lean();
    expect(expired!.status).toBe('CANCELLED');
    expect(expired!.paymentStatus).toBe('VOID');
    expect((await Invoice.findById(expired!.invoiceId).lean())!.status).toBe('CANCELLED');
    const r3 = await amenityService.sweep(at(7, 9).toDate());
    expect(r3.unapproved).toBeGreaterThanOrEqual(1);
    expect((await AmenityBooking.findById(unanswered.id).lean())!.status).toBe('CANCELLED');
    // deposit comes back after a completed paid booking
    const party = (await post('/amenities/bookings', member, { amenityId: hall.id, startAt: at(8, 8).toISOString() })).body.data;
    const ok = await post(`/amenities/bookings/${party.id}/decide`, admin, { decision: 'APPROVED' });
    await post('/payments', admin, { unitId: units[0], amount: 7000, method: 'BANK_TRANSFER', invoiceIds: [ok.body.data.invoiceId.id] }).expect(201);
    await flush(300);
    expect((await AmenityBooking.findById(party.id).lean())!.status).toBe('CONFIRMED');
    await amenityService.sweep(at(9, 1).toDate());
    const done = await AmenityBooking.findById(party.id).lean();
    expect(done!.status).toBe('COMPLETED');
    expect(done!.paymentStatus).toBe('REFUND_DUE');
    expect(done!.refund?.amount).toBe(2000);
  });

  it('limits active bookings per unit, exports, reports and isolates societies', async () => {
    await api.put('/api/v1/amenities/settings').set(auth(admin)).send({ maxActiveBookingsPerUnit: 1 }).expect(200);
    expect((await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(10, 10).toISOString() })).status).toBe(201);
    const limited = await post('/amenities/bookings', member, { amenityId: gym.id, startAt: at(10, 12).toISOString() });
    expect(limited.status).toBe(409);
    expect(limited.body.message).toContain('limit 1');
    const stats = await get('/amenities/stats', admin);
    expect(stats.status).toBe(200);
    expect(stats.body.data.activeAmenities).toBe(3);
    expect(stats.body.data.revenue30d).toBeGreaterThanOrEqual(5000);
    const csv = await get('/amenities/bookings/export', admin);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(gymBooking.bookingNumber);
    expect((await get('/amenities', otherAdmin)).body.data).toHaveLength(0);
    expect((await get(`/amenities/bookings/${gymBooking.id}`, otherAdmin)).status).toBe(404);
    expect((await post(`/amenities/bookings/${gymBooking.id}/cancel`, otherAdmin, {})).status).toBe(404);
    expect((await api.delete(`/api/v1/amenities/${gym.id}`).set(auth(admin))).status).toBe(409); // has an active booking
    const del = await api.delete(`/api/v1/amenities/${court.id}`).set(auth(admin));
    expect(del.status).toBe(204);
    expect((await get('/amenities', member)).body.data.map((a: any) => a.name)).not.toContain('Tennis Court');
  });
});
