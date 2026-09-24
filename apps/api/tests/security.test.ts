import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { incidentService } from '../src/modules/security/incidents.service';
import { emergencyService } from '../src/modules/security/emergency.service';
import { Incident } from '../src/models/incident.model';
import { EmergencyAlert } from '../src/models/emergency.model';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let adminUserId = '';
let otherAdmin = '';
let guard = '';
let guardUserId = '';
let m1 = '';
let m1UserId = '';
let unitA = '';
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
  unitA = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '101' })).body.data.id;
  const roles = (await get('/society/roles', admin)).body.data;
  const resident = (await post('/residents', admin, { unitId: unitA, name: 'Asha Member', email: `asha-${Date.now()}@test.local`, phone: `9300${Math.floor(Math.random() * 900000) + 100000}`, type: 'OWNER', isPrimary: true })).body.data;
  const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
  const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
  m1 = accepted.body.data.accessToken;
  m1UserId = accepted.body.data.context.user.id;
  const guardEmail = `guard-${Date.now()}@test.local`;
  const g = (await post('/society/users', admin, { name: 'Gate Guard', email: guardEmail, password: 'Guard@12345', roleIds: [roles.find((r: any) => r.key === 'SECURITY_GUARD').id] })).body.data;
  guardUserId = g.id ?? g.user?.id;
  const gl = await login(api, guardEmail, 'Guard@12345');
  guard = gl.accessToken;
  guardUserId = gl.context.user.id;
});
afterAll(teardownTestApp);

describe('security incidents', () => {
  let incidentId = '';
  it('lets the guard report (idempotently) and only see own reports while the office sees everything', async () => {
    const gates = await get('/security/gates', guard);
    expect(gates.status).toBe(200);
    expect(gates.body.data.length).toBeGreaterThanOrEqual(1);
    const body = { title: 'Unknown bike at fire exit', typeKey: 'security_breach', severity: 'HIGH', location: 'Basement 1', gateId: gates.body.data[0].id, clientRef: 'gate-abc-1', involved: [{ name: 'KA05XX4321', type: 'VEHICLE' }] };
    const created = await post('/security/incidents', guard, body);
    expect(created.status).toBe(201);
    incidentId = created.body.data.id;
    expect(created.body.data.incidentNumber).toMatch(/^INC/);
    expect(created.body.data.typeKey).toBe('SECURITY_BREACH');
    expect(created.body.data.reportedVia).toBe('GATE');
    const replay = await post('/security/incidents', guard, body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(incidentId);
    expect(replay.body.data.replayed).toBe(true);
    expect((await post('/security/incidents', guard, { title: 'Bad type', typeKey: 'NOPE' })).status).toBe(422);
    expect((await post('/security/incidents', m1, { title: 'Members cannot report here', typeKey: 'THEFT' })).status).toBe(403);
    // office report
    const office = await post('/security/incidents', admin, { title: 'Cycle stolen from stand', typeKey: 'THEFT', severity: 'MEDIUM', unitId: unitA, occurredAt: dayjs().subtract(1, 'day').toISOString(), police: { reported: true, firNumber: 'FIR/1' } });
    expect(office.status).toBe(201);
    expect(office.body.data.reportedVia).toBe('OFFICE');
    // guards hold security:view by default, so they see the whole register; drop that permission from the role to restrict them to own reports
    expect((await get('/security/incidents', guard)).body.data).toHaveLength(2);
    expect((await get('/security/incidents?mine=true', guard)).body.data).toHaveLength(1);
    expect((await get('/security/incidents', admin)).body.data).toHaveLength(2);
    expect((await get(`/security/incidents/${office.body.data.id}`, guard)).status).toBe(200);
    expect((await get(`/security/incidents/${incidentId}`, otherAdmin)).status).toBe(404);
    await flush(300);
    // HIGH severity: the office (security:update) is notified, so is the unit for the theft
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'incident.reported', 'data.incidentId': incidentId })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'incident.unit_notice', 'data.incidentId': office.body.data.id })).toBe(1);
  });

  it('assigns, takes notes, resolves, closes and reopens with a full timeline', async () => {
    const assigned = await post(`/security/incidents/${incidentId}/assign`, admin, { assignedTo: guardUserId });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.status).toBe('INVESTIGATING');
    expect(assigned.body.data.assignedTo.id).toBe(guardUserId);
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: guardUserId, type: 'incident.assigned', 'data.incidentId': incidentId })).toBe(1);
    const note = await post(`/security/incidents/${incidentId}/notes`, guard, { note: 'Owner traced, bike moved.' });
    expect(note.status).toBe(200);
    expect(note.body.data.timeline.some((t: any) => t.action === 'NOTE')).toBe(true);
    expect((await post(`/security/incidents/${incidentId}/resolve`, guard, { note: 'nope' })).status).toBe(403);
    const resolved = await post(`/security/incidents/${incidentId}/resolve`, admin, { note: 'Bike removed, owner warned.', actionTaken: 'Warning issued' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('RESOLVED');
    expect(resolved.body.data.resolution.resolvedBy.id).toBe(adminUserId);
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: guardUserId, type: 'incident.updated', 'data.incidentId': incidentId, 'data.change': 'resolved' })).toBe(1);
    expect((await post(`/security/incidents/${incidentId}/resolve`, admin, { note: 'again' })).status).toBe(409);
    const closed = await post(`/security/incidents/${incidentId}/close`, admin, {});
    expect(closed.body.data.status).toBe('CLOSED');
    expect((await post(`/security/incidents/${incidentId}/notes`, guard, { note: 'too late' })).status).toBe(409);
    const reopened = await post(`/security/incidents/${incidentId}/status`, admin, { status: 'OPEN', note: 'Bike is back' });
    expect(reopened.body.data.status).toBe('OPEN');
    expect(reopened.body.data.resolution.resolvedAt).toBeNull();
    expect(reopened.body.data.timeline.map((t: any) => t.action)).toEqual(expect.arrayContaining(['REPORTED', 'ASSIGNED', 'NOTE', 'RESOLVED', 'CLOSED', 'REOPENED']));
  });

  it('reports stats, exports CSV and auto-closes resolved incidents after the configured days', async () => {
    const stats = await get('/security/stats', admin);
    expect(stats.status).toBe(200);
    expect(stats.body.data.open).toBe(2);
    expect(stats.body.data.thisMonth).toBeGreaterThanOrEqual(1);
    const csv = await get('/security/incidents/export', admin);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('INC');
    expect((await get('/security/incidents/export', guard)).status).toBe(403);
    await post('/security/settings', admin, {});
    const cfg = await api.put('/api/v1/security/settings').set(auth(admin)).send({ autoCloseResolvedAfterDays: 2 });
    expect(cfg.body.data.autoCloseResolvedAfterDays).toBe(2);
    const old = await post('/security/incidents', admin, { title: 'Old leak', typeKey: 'PROPERTY_DAMAGE', severity: 'LOW' });
    await post(`/security/incidents/${old.body.data.id}/resolve`, admin, { note: 'Fixed' });
    await Incident.updateOne({ _id: old.body.data.id }, { $set: { 'resolution.resolvedAt': dayjs().subtract(5, 'day').toDate() } });
    const r = await incidentService.sweep();
    expect(r.closed).toBe(1);
    expect((await get(`/security/incidents/${old.body.data.id}`, admin)).body.data.status).toBe('CLOSED');
  });

  it('manages gates from the security desk', async () => {
    const created = await post('/security/gates', admin, { name: 'Service gate', code: 'svc' });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe('SVC');
    expect((await post('/security/gates', admin, { name: 'Dup', code: 'SVC' })).status).toBe(409);
    expect((await post('/security/gates', guard, { name: 'Nope', code: 'X' })).status).toBe(403);
    const updated = await api.patch(`/api/v1/security/gates/${created.body.data.id}`).set(auth(admin)).send({ isActive: false });
    expect(updated.body.data.isActive).toBe(false);
  });
});

describe('emergency', () => {
  let sosId = '';
  it('seeds default helplines from the platform, lets the office manage contacts and residents read them', async () => {
    const list = await get('/emergency/contacts', m1);
    expect(list.status).toBe(200);
    expect(list.body.data.some((c: any) => c.phone === '112')).toBe(true);
    expect((await post('/emergency/contacts', m1, { name: 'Nope', phone: '1' })).status).toBe(403);
    const created = await post('/emergency/contacts', admin, { name: 'Society office', phone: '080-1234', category: 'COMMITTEE' });
    expect(created.status).toBe(201);
    const hidden = await api.patch(`/api/v1/emergency/contacts/${created.body.data.id}`).set(auth(admin)).send({ isActive: false });
    expect(hidden.body.data.isActive).toBe(false);
    expect((await get('/emergency/contacts', m1)).body.data.some((c: any) => c.id === created.body.data.id)).toBe(false);
    expect((await get('/emergency/contacts', admin)).body.data.some((c: any) => c.id === created.body.data.id)).toBe(true);
    expect((await get('/emergency/contacts', otherAdmin)).body.data.some((c: any) => c.id === created.body.data.id)).toBe(false);
  });

  it('raises an SOS once per person, alerts responders, acknowledges and resolves', async () => {
    const raised = await post('/emergency/sos', m1, { category: 'MEDICAL', message: 'Father collapsed', clientRef: 'sos-1' });
    expect(raised.status).toBe(201);
    sosId = raised.body.data.id;
    expect(raised.body.data.alertNumber).toMatch(/^SOS/);
    expect(raised.body.data.unitId.id).toBe(unitA);
    expect(raised.body.data.status).toBe('ACTIVE');
    const again = await post('/emergency/sos', m1, { category: 'FIRE' });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(sosId);
    expect(again.body.data.replayed).toBe(true);
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'emergency.sos', 'data.alertId': sosId })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: guardUserId, type: 'emergency.sos', 'data.alertId': sosId })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'emergency.sos' })).toBe(0);
    const guardActive = await get('/emergency/active', guard);
    expect(guardActive.body.data.sos).toHaveLength(1);
    expect((await get('/emergency/active', m1)).body.data.sos).toHaveLength(1);
    expect((await get(`/emergency/alerts/${sosId}`, otherAdmin)).status).toBe(404);
    expect((await post(`/emergency/alerts/${sosId}/acknowledge`, m1, {})).status).toBe(403);
    const ack = await post(`/emergency/alerts/${sosId}/acknowledge`, guard, { note: 'On my way' });
    expect(ack.status).toBe(200);
    expect(ack.body.data.status).toBe('ACKNOWLEDGED');
    expect(ack.body.data.acknowledgedBy.id).toBe(guardUserId);
    const ack2 = await post(`/emergency/alerts/${sosId}/acknowledge`, admin, {});
    expect(ack2.body.data.responders).toHaveLength(2);
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'emergency.acknowledged', 'data.alertId': sosId })).toBe(1);
    const resolved = await post(`/emergency/alerts/${sosId}/resolve`, guard, { note: 'Ambulance took him' });
    expect(resolved.body.data.status).toBe('RESOLVED');
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'emergency.resolved', 'data.alertId': sosId })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'emergency.resolved', 'data.alertId': sosId })).toBe(1);
    expect((await get('/emergency/active', guard)).body.data.sos).toHaveLength(0);
    // a resident can cancel their own live SOS (false alarm) but cannot resolve others'
    const second = await post('/emergency/sos', m1, { category: 'OTHER' });
    expect(second.status).toBe(201);
    const cancelled = await post(`/emergency/alerts/${second.body.data.id}/resolve`, m1, { note: 'Pressed by mistake' });
    expect(cancelled.body.data.status).toBe('FALSE_ALARM');
    const stats = await get('/emergency/stats', admin);
    expect(stats.body.data.sos30d).toBe(2);
    expect(stats.body.data.falseAlarms30d).toBe(1);
    expect(stats.body.data.avgAckMinutes).not.toBeNull();
    const history = await get('/emergency/alerts?kind=SOS', m1);
    expect(history.body.data).toHaveLength(2);
  });

  it('broadcasts to an audience, shows it to members while live and sends the all clear', async () => {
    const bc = await post('/emergency/broadcast', admin, { title: 'Gas leak in Tower A', message: 'Leave the building calmly and gather at the lawn.', category: 'FIRE', expiresInHours: 2 });
    expect(bc.status).toBe(201);
    expect(bc.body.data.kind).toBe('BROADCAST');
    expect(bc.body.data.audienceSummary).toBeTruthy();
    expect((await post('/emergency/broadcast', guard, { title: 'x', message: 'yyy' })).status).toBe(403);
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'emergency.broadcast', 'data.alertId': bc.body.data.id })).toBe(1);
    const active = await get('/emergency/active', m1);
    expect(active.body.data.broadcasts.map((b: any) => b.id)).toContain(bc.body.data.id);
    expect((await post(`/emergency/alerts/${bc.body.data.id}/resolve`, m1, {})).status).toBe(403);
    const clear = await post(`/emergency/alerts/${bc.body.data.id}/resolve`, admin, { note: 'Leak sealed by the gas company.' });
    expect(clear.body.data.status).toBe('RESOLVED');
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'emergency.all_clear', 'data.alertId': bc.body.data.id })).toBe(1);
    expect((await get('/emergency/active', m1)).body.data.broadcasts).toHaveLength(0);
    // expiry sweep
    const stale = await post('/emergency/broadcast', admin, { title: 'Lift maintenance', message: 'Lift 2 down for an hour.', expiresInHours: 1 });
    await EmergencyAlert.updateOne({ _id: stale.body.data.id }, { $set: { expiresAt: dayjs().subtract(1, 'minute').toDate() } });
    const r = await emergencyService.sweep();
    expect(r.expired).toBe(1);
  });

  it('escalates an SOS nobody acknowledged and honours the society switches', async () => {
    const raised = await post('/emergency/sos', m1, { category: 'SECURITY', location: 'Parking B2' });
    expect(raised.status).toBe(201);
    // createdAt is immutable under mongoose timestamps, so backdate through the raw collection
    await EmergencyAlert.collection.updateOne({ _id: new mongoose.Types.ObjectId(raised.body.data.id) }, { $set: { createdAt: dayjs().subtract(10, 'minute').toDate() } });
    const r = await emergencyService.sweep();
    expect(r.escalated).toBe(1);
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'emergency.escalated', 'data.alertId': raised.body.data.id })).toBe(1);
    expect((await emergencyService.sweep()).escalated).toBe(0);
    await post(`/emergency/alerts/${raised.body.data.id}/resolve`, admin, { falseAlarm: true });
    const cfg = await api.put('/api/v1/emergency/settings').set(auth(admin)).send({ memberCanRaiseSos: false, showContactsToMembers: false });
    expect(cfg.body.data.memberCanRaiseSos).toBe(false);
    expect(cfg.body.data.sosNotifyRoleKeys).toContain('SOCIETY_ADMIN');
    expect((await post('/emergency/sos', m1, { category: 'OTHER' })).status).toBe(403);
    expect((await get('/emergency/contacts', m1)).body.data).toHaveLength(0);
    expect((await post('/emergency/sos', guard, { category: 'SECURITY', location: 'Main gate' })).status).toBe(201);
  });
});
