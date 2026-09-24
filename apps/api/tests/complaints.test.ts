import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { complaintService } from '../src/modules/complaints/complaints.service';
import { Complaint } from '../src/models/complaint.model';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin: string;
let adminUserId = '';
let otherAdmin: string;
let member: string;
let memberUserId = '';
let staff: string;
let staffUserId = '';
let unitId = '';
let ticket: any;

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  const a = await login(api, s.adminEmail, s.adminPassword);
  admin = a.accessToken;
  adminUserId = a.context.user.id;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await api.post('/api/v1/buildings').set(auth(admin)).send({ name: 'Tower A', code: 'A', floors: 1 })).body.data;
  unitId = (await api.post('/api/v1/units').set(auth(admin)).send({ buildingId: b.id, floor: 1, number: '101' })).body.data.id;
  const roles = (await api.get('/api/v1/society/roles').set(auth(admin))).body.data;
  const resident = (await api.post('/api/v1/residents').set(auth(admin)).send({ unitId, name: 'Resident One', email: `res-${Date.now()}@test.local`, phone: '9000000111', type: 'OWNER' })).body.data;
  const invite = await api.post(`/api/v1/residents/${resident.id}/invite`).set(auth(admin)).send({ roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
  const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
  member = accepted.body.data.accessToken;
  memberUserId = accepted.body.data.context.user.id;
  const staffEmail = `staff-${Date.now()}@test.local`;
  const created = await api.post('/api/v1/society/users').set(auth(admin)).send({ name: 'Helpdesk Staff', email: staffEmail, password: 'Staff@12345', roleIds: [roles.find((r: any) => r.key === 'STAFF').id] });
  staffUserId = created.body.data.user?.id ?? created.body.data.id;
  staff = (await login(api, staffEmail, 'Staff@12345')).accessToken;
});
afterAll(teardownTestApp);

describe('helpdesk tickets', () => {
  it('member raises a complaint on their unit with SLA targets from settings; staff are notified', async () => {
    const res = await api.post('/api/v1/complaints').set(auth(member)).send({ title: 'Water leakage in bathroom', description: 'Dripping from the ceiling since morning', categoryKey: 'plumbing', priority: 'HIGH' });
    expect(res.status).toBe(201);
    ticket = res.body.data;
    expect(ticket.ticketNumber).toMatch(/^TKT\//);
    expect(ticket.unitId).toBe(unitId);
    expect(ticket.categoryKey).toBe('PLUMBING');
    expect(ticket.status).toBe('OPEN');
    expect(ticket.sla.responseMinutes).toBe(60);
    expect(ticket.sla.resolutionMinutes).toBe(1440);
    expect(dayjs(ticket.sla.resolutionDueAt).diff(dayjs(ticket.sla.responseDueAt), 'minute')).toBe(1380);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'complaint.created' })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: memberUserId, type: 'complaint.created' })).toBe(1);
  });

  it('members only see their own / unit / public tickets; internal notes stay hidden', async () => {
    const other1 = await api.post('/api/v1/complaints').set(auth(admin)).send({ title: 'Lift making noise', categoryKey: 'lift' });
    expect(other1.status).toBe(201);
    expect(other1.body.data.onBehalf).toBe(false);
    const mine = await api.get('/api/v1/complaints').set(auth(member));
    expect(mine.body.data.map((c: any) => c.id)).toEqual([ticket.id]);
    expect((await api.get(`/api/v1/complaints/${other1.body.data.id}`).set(auth(member))).status).toBe(404);
    // staff adds an internal note and a public reply
    await api.post(`/api/v1/complaints/${ticket.id}/comments`).set(auth(admin)).send({ body: 'Plumber quoted ₹800', internal: true }).expect(201);
    const reply = await api.post(`/api/v1/complaints/${ticket.id}/comments`).set(auth(admin)).send({ body: 'Plumber will visit tomorrow 10am' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.comments).toHaveLength(2);
    const memberView = await api.get(`/api/v1/complaints/${ticket.id}`).set(auth(member));
    expect(memberView.body.data.comments).toHaveLength(1);
    expect(memberView.body.data.comments[0].body).toContain('Plumber will visit');
    expect(memberView.body.data.sla.firstResponseAt).toBeTruthy(); // public staff reply counts as first response
    // public tickets are visible to every member
    await api.patch(`/api/v1/complaints/${other1.body.data.id}`).set(auth(admin)).send({ isPublic: true }).expect(200);
    expect((await api.get('/api/v1/complaints').set(auth(member))).body.data).toHaveLength(2);
  });

  it('assigns, resolves, lets the resident reopen/close and rate; invalid transitions are rejected', async () => {
    const assigned = await api.post(`/api/v1/complaints/${ticket.id}/assign`).set(auth(admin)).send({ assignedTo: staffUserId, note: 'Please handle today' });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.status).toBe('IN_PROGRESS');
    expect(assigned.body.data.assignedTo).toBe(staffUserId);
    await flush(200);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: staffUserId, type: 'complaint.assigned' })).toBe(1);
    // staff (assignee) sees it in "mine"
    const mineStaff = await api.get('/api/v1/complaints?assignedTo=me').set(auth(staff));
    expect(mineStaff.body.data.map((c: any) => c.id)).toContain(ticket.id);
    // member cannot resolve
    expect((await api.post(`/api/v1/complaints/${ticket.id}/status`).set(auth(member)).send({ status: 'RESOLVED' })).status).toBe(403);
    // closed straight from in-progress is allowed for staff; but CLOSED → IN_PROGRESS is not
    const resolved = await api.post(`/api/v1/complaints/${ticket.id}/status`).set(auth(admin)).send({ status: 'RESOLVED', note: 'Leak fixed, joint replaced' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.resolvedAt).toBeTruthy();
    expect(resolved.body.data.sla.resolutionBreached).toBe(false);
    expect((await api.post(`/api/v1/complaints/${ticket.id}/status`).set(auth(admin)).send({ status: 'IN_PROGRESS' })).status).toBe(409);
    // resident reopens
    const reopened = await api.post(`/api/v1/complaints/${ticket.id}/status`).set(auth(member)).send({ status: 'REOPENED', note: 'Still dripping' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.reopenedCount).toBe(1);
    await api.post(`/api/v1/complaints/${ticket.id}/status`).set(auth(staff)).send({ status: 'RESOLVED', note: 'Sealed properly' }).expect(200);
    const closed = await api.post(`/api/v1/complaints/${ticket.id}/status`).set(auth(member)).send({ status: 'CLOSED' });
    expect(closed.body.data.status).toBe('CLOSED');
    const rated = await api.post(`/api/v1/complaints/${ticket.id}/rate`).set(auth(member)).send({ score: 4, comment: 'Took a while but fixed' });
    expect(rated.body.data.rating.score).toBe(4);
    expect((await api.post(`/api/v1/complaints/${ticket.id}/rate`).set(auth(admin)).send({ score: 5 })).status).toBe(404); // only the raiser
  });

  it('SLA sweep flags breaches and escalates through configured levels once per level', async () => {
    const crit = (await api.post('/api/v1/complaints').set(auth(member)).send({ title: 'No water supply', categoryKey: 'water_supply', priority: 'CRITICAL' })).body.data;
    // CRITICAL: resolution 240 minutes; level 1 at 0 minutes past due, level 2 at 1440
    const r1 = await complaintService.escalateOverdue(dayjs(crit.createdAt).add(5, 'hour').toDate());
    expect(r1.breached).toBe(1);
    expect(r1.escalated).toBe(1);
    let doc = await Complaint.findById(crit.id).lean();
    expect(doc!.escalationLevel).toBe(1);
    expect(doc!.sla!.resolutionBreached).toBe(true);
    expect(doc!.sla!.responseBreached).toBe(true);
    // idempotent for the same level
    const r2 = await complaintService.escalateOverdue(dayjs(crit.createdAt).add(6, 'hour').toDate());
    expect(r2.escalated).toBe(0);
    const r3 = await complaintService.escalateOverdue(dayjs(crit.createdAt).add(2, 'day').toDate());
    expect(r3.escalated).toBeGreaterThanOrEqual(1); // the public lift ticket (NORMAL, 2-day SLA) escalates too
    doc = await Complaint.findById(crit.id).lean();
    expect(doc!.escalationLevel).toBe(2);
    expect(doc!.escalations).toHaveLength(2);
    // level 2 notifies the society admin role (level 1 targets the committee, which this society has no members of)
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'complaint.escalated' })).toBe(1);
    const list = await api.get('/api/v1/complaints?breachedOnly=true').set(auth(admin));
    expect(list.body.data.map((c: any) => c.id)).toContain(crit.id);
    const stats = await api.get('/api/v1/complaints/stats').set(auth(admin));
    expect(stats.body.data.breached).toBeGreaterThanOrEqual(1);
    expect(stats.body.data.open).toBe(2);
  });

  it('auto-closes resolved tickets after the configured days and settings are editable', async () => {
    const t = (await api.post('/api/v1/complaints').set(auth(admin)).send({ title: 'Garden light broken', categoryKey: 'electrical', unitId })).body.data;
    expect(t.onBehalf).toBe(true);
    await api.post(`/api/v1/complaints/${t.id}/status`).set(auth(admin)).send({ status: 'RESOLVED' }).expect(200);
    expect(await complaintService.autoClose(dayjs().add(3, 'day').toDate())).toBe(0);
    expect(await complaintService.autoClose(dayjs().add(8, 'day').toDate())).toBe(1);
    expect((await Complaint.findById(t.id).lean())!.status).toBe('CLOSED');
    const upd = await api.put('/api/v1/complaints/settings').set(auth(admin)).send({ config: { autoCloseAfterResolvedDays: 3 }, sla: { LOW: { responseMinutes: 1440, resolutionMinutes: 10080 }, NORMAL: { responseMinutes: 120, resolutionMinutes: 1440 }, HIGH: { responseMinutes: 30, resolutionMinutes: 480 }, CRITICAL: { responseMinutes: 10, resolutionMinutes: 120 } } });
    expect(upd.status).toBe(200);
    expect(upd.body.data.config.autoCloseAfterResolvedDays).toBe(3);
    const n = (await api.post('/api/v1/complaints').set(auth(member)).send({ title: 'Normal issue', categoryKey: 'other' })).body.data;
    expect(n.sla.responseMinutes).toBe(120);
    expect((await api.put('/api/v1/complaints/settings').set(auth(member)).send({ config: { autoCloseAfterResolvedDays: 1 } })).status).toBe(403);
    const csv = await api.get('/api/v1/complaints/export').set(auth(admin));
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('is isolated per society', async () => {
    expect((await api.get('/api/v1/complaints').set(auth(otherAdmin))).body.data).toHaveLength(0);
    expect((await api.get(`/api/v1/complaints/${ticket.id}`).set(auth(otherAdmin))).status).toBe(404);
    expect((await api.post(`/api/v1/complaints/${ticket.id}/assign`).set(auth(otherAdmin)).send({ assignedTo: staffUserId })).status).toBe(404);
    expect((await api.get('/api/v1/complaints/stats').set(auth(otherAdmin))).body.data.open).toBe(0);
  });
});
