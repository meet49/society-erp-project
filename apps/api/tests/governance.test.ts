import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { meetingService } from '../src/modules/governance/meetings.service';
import { votingService } from '../src/modules/governance/voting.service';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let adminUserId = '';
let otherAdmin = '';
let committee = '';
let committeeUserId = '';
let m1 = '';
let m1UserId = '';
let m2 = '';
let m2UserId = '';
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
  const unitB = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '102' })).body.data.id;
  await post('/units', admin, { buildingId: b.id, floor: 1, number: '103' }); // a vacant unit counts for AGM quorum
  const roles = (await get('/society/roles', admin)).body.data;
  const memberRole = roles.find((r: any) => r.key === 'MEMBER').id;
  for (const [unitId, name] of [[unitA, 'Asha'], [unitB, 'Bharat']] as const) {
    const resident = (await post('/residents', admin, { unitId, name: `${name} Member`, email: `${name.toLowerCase()}-${Date.now()}@test.local`, phone: `9100${Math.floor(Math.random() * 900000) + 100000}`, type: 'OWNER' })).body.data;
    const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [memberRole] });
    const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
    if (name === 'Asha') { m1 = accepted.body.data.accessToken; m1UserId = accepted.body.data.context.user.id; } else { m2 = accepted.body.data.accessToken; m2UserId = accepted.body.data.context.user.id; }
  }
  const email = `sec-${Date.now()}@test.local`;
  const created = await post('/society/users', admin, { name: 'Secretary', email, password: 'Secret@12345', roleIds: [roles.find((r: any) => r.key === 'COMMITTEE').id] });
  committeeUserId = created.body.data.user?.id ?? created.body.data.id;
  committee = (await login(api, email, 'Secret@12345')).accessToken;
});
afterAll(teardownTestApp);

describe('meetings', () => {
  let agmId = '';
  it('schedules an AGM for every unit, tracks RSVPs, attendance and quorum, records and publishes minutes', async () => {
    const created = await post('/meetings', admin, { title: 'Annual General Meeting', type: 'AGM', scheduledAt: dayjs().add(5, 'day').hour(18).toISOString(), venue: 'Hall', agenda: [{ title: 'Accounts' }, { title: 'Budget' }] });
    expect(created.status).toBe(201);
    agmId = created.body.data.id;
    expect(created.body.data.meetingNumber).toMatch(/^MTG\//);
    expect(created.body.data.audienceLabel).toBe('Everyone');
    expect(created.body.data.quorum).toMatchObject({ percent: 33, eligible: 3, present: 0, met: false });
    expect(created.body.data.agenda.map((a: any) => a.key)).toEqual(['a1', 'a2']);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'meeting.scheduled' })).toBe(1);
    // committee-only meeting is invisible to residents
    const cm = (await post('/meetings', admin, { title: 'Committee sync', scheduledAt: dayjs().add(2, 'day').toISOString(), notify: false })).body.data;
    expect(cm.audienceLabel).toContain('Committee');
    expect((await get(`/meetings/${cm.id}`, m1)).status).toBe(404);
    expect((await get(`/meetings/${cm.id}`, committee)).status).toBe(200);
    const mine = await get('/meetings?upcoming=true', m1);
    expect(mine.body.data.map((m: any) => m.id)).toEqual([agmId]);
    expect(mine.body.data[0].attendees).toBeUndefined();
    const rsvp = await post(`/meetings/${agmId}/rsvp`, m1, { rsvp: 'YES' });
    expect(rsvp.body.data.myRsvp).toBe('YES');
    expect(rsvp.body.data.rsvpCounts.yes).toBe(1);
    expect((await post(`/meetings/${agmId}/attendance`, m1, { attendees: [] })).status).toBe(403);
    await post(`/meetings/${agmId}/start`, committee, {}).expect(200);
    const marked = await post(`/meetings/${agmId}/attendance`, committee, { attendees: [{ userId: m1UserId, present: true }, { unitId: unitA, present: true }] });
    expect(marked.body.data.quorum.present).toBe(1); // same unit counted once
    expect(marked.body.data.quorum.met).toBe(true); // 1 of 3 units = 33%
    const ics = await get(`/meetings/${agmId}/ics`, m1);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('SUMMARY:Annual General Meeting');
    const minutes = await post(`/meetings/${agmId}/minutes`, committee, { body: 'Accounts adopted. Budget approved.', agendaOutcomes: [{ key: 'a1', outcome: 'Adopted' }], resolutions: [{ title: 'Adopt accounts', votesFor: 30, votesAgainst: 1, outcome: 'PASSED' }, { title: 'Repaint towers', description: 'Needs a formal vote' }], complete: true });
    expect(minutes.status).toBe(200);
    expect(minutes.body.data.status).toBe('COMPLETED');
    expect(minutes.body.data.resolutions.map((r: any) => r.key)).toEqual(['r1', 'r2']);
    expect((await get(`/meetings/${agmId}`, m1)).body.data.resolutions).toEqual([]); // hidden until published
    await post(`/meetings/${agmId}/minutes/publish`, committee, {}).expect(200);
    const published = await get(`/meetings/${agmId}`, m1);
    expect(published.body.data.minutes.body).toContain('Accounts adopted');
    expect(published.body.data.resolutions).toHaveLength(2);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m2UserId, type: 'meeting.minutes_published' })).toBe(1);
    const stats = await get('/meetings/stats', admin);
    expect(stats.body.data.upcoming).toBe(1);
  });

  it('opens a formal e-vote on a resolution whose outcome flows back into the minutes, cancels and reminds', async () => {
    const opened = await post(`/meetings/${agmId}/resolutions/vote`, committee, { resolutionKey: 'r2', endAt: dayjs().add(3, 'day').toISOString() });
    expect(opened.status).toBe(201);
    expect(opened.body.data.type).toBe('RESOLUTION');
    expect(opened.body.data.status).toBe('OPEN');
    expect(opened.body.data.meetingId?.id ?? opened.body.data.meetingId).toBeTruthy();
    expect((await post(`/meetings/${agmId}/resolutions/vote`, committee, { resolutionKey: 'r2', endAt: dayjs().add(3, 'day').toISOString() })).status).toBe(409);
    await post(`/voting/${opened.body.data.id}/vote`, m1, { choices: ['FOR'] }).expect(200);
    await post(`/voting/${opened.body.data.id}/vote`, m2, { choices: ['AGAINST'] }).expect(200);
    await post(`/voting/${opened.body.data.id}/vote`, admin, { choices: ['FOR'] }).expect(409); // admin's login has no unit
    await post(`/voting/${opened.body.data.id}/close`, committee, {}).expect(200);
    await flush(250);
    const meeting = await get(`/meetings/${agmId}`, admin);
    const r2 = meeting.body.data.resolutions.find((r: any) => r.key === 'r2');
    expect(r2.votesFor).toBe(1);
    expect(r2.votesAgainst).toBe(1);
    expect(r2.outcome).toBe('FAILED'); // 50% is not more than the 50% threshold
    const soon = (await post('/meetings', admin, { title: 'Urgent committee call', scheduledAt: dayjs().add(3, 'hour').toISOString(), notify: false })).body.data;
    expect(await meetingService.sendReminders()).toBe(1);
    expect(await meetingService.sendReminders()).toBe(0); // once only
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: committeeUserId, type: 'meeting.reminder' })).toBe(1);
    const cancelled = await post(`/meetings/${soon.id}/cancel`, admin, { reason: 'Resolved over email' });
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect((await api.delete(`/api/v1/meetings/${agmId}`).set(auth(admin))).status).toBe(409);
    expect((await get('/meetings', otherAdmin)).body.data).toHaveLength(0);
    expect((await post('/meetings', m1, { title: 'x', scheduledAt: new Date().toISOString() })).status).toBe(403);
  });
});

describe('voting & elections', () => {
  it('runs an election with one ballot per unit, seats and frozen results; anonymity hides ballots', async () => {
    const created = await post('/voting', admin, { title: 'Elect two committee members', type: 'ELECTION', seats: 2, candidates: [{ label: 'Asha (A-101)', unitCode: 'A-101' }, { label: 'Bharat (A-102)', unitCode: 'A-102' }, { label: 'Chitra (A-103)' }], anonymous: false, endAt: dayjs().add(2, 'day').toISOString(), openNow: true });
    expect(created.status).toBe(201);
    const v = created.body.data;
    expect(v.status).toBe('OPEN');
    expect(v.oneVotePerUnit).toBe(true);
    expect(v.eligibleCount).toBe(2); // two occupied units among three
    expect(v.options.map((o: any) => o.key)).toEqual(['c1', 'c2', 'c3']);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'voting.opened', 'data.votingId': v.id })).toBe(1);
    expect((await post(`/voting/${v.id}/vote`, m1, { choices: ['c1', 'c2', 'c3'] })).status).toBe(422); // more than the seats
    await post(`/voting/${v.id}/vote`, m1, { choices: ['c1', 'c3'] }).expect(200);
    await post(`/voting/${v.id}/vote`, m2, { choices: ['c1'] }).expect(200);
    const asMember = await get(`/voting/${v.id}`, m1);
    expect(asMember.body.data.options[0].votes).toBeNull(); // counts hidden while open
    expect(asMember.body.data.myBallot).toEqual(['c1', 'c3']);
    expect((await get(`/voting/${v.id}/results`, m1)).status).toBe(403);
    const live = await get(`/voting/${v.id}/results`, committee);
    expect(live.body.data.total).toBe(2);
    expect(live.body.data.ballots).toHaveLength(2); // named election, results viewer
    const closed = await post(`/voting/${v.id}/close`, committee, {});
    expect(closed.body.data.results.outcome).toBe('ELECTED');
    expect(closed.body.data.results.winners).toEqual(['c1', 'c3']);
    expect(closed.body.data.results.turnoutPercent).toBe(100);
    expect((await get(`/voting/${v.id}/results`, m1)).body.data.options[0].votes).toBe(2); // visible once closed
    expect((await post(`/voting/${v.id}/vote`, m2, { choices: ['c2'] })).status).toBe(409);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m2UserId, type: 'voting.closed', 'data.votingId': v.id })).toBe(1);
  });

  it('applies quorum and thresholds to resolutions and auto-closes timed votes', async () => {
    const r = (await post('/voting', admin, { title: 'Special resolution: amend bye-laws', passThresholdPercent: 75, quorumPercent: 60, openNow: true, endAt: dayjs().add(1, 'hour').toISOString() })).body.data;
    await post(`/voting/${r.id}/vote`, m1, { choices: ['FOR'] }).expect(200);
    expect(await votingService.closeEnded(dayjs().add(2, 'hour').toDate())).toBe(1);
    const results = await get(`/voting/${r.id}/results`, admin);
    expect(results.body.data.status).toBe('CLOSED');
    expect(results.body.data.quorumMet).toBe(false); // 1 of 2 units = 50% < 60%
    expect(results.body.data.outcome).toBe('NO_QUORUM');
    const r2 = (await post('/voting', admin, { title: 'Ordinary resolution', openNow: true })).body.data;
    await post(`/voting/${r2.id}/vote`, m1, { choices: ['FOR'] }).expect(200);
    await post(`/voting/${r2.id}/vote`, m2, { choices: ['ABSTAIN'] }).expect(200);
    const closed = await post(`/voting/${r2.id}/close`, admin, {});
    expect(closed.body.data.results.outcome).toBe('PASSED'); // abstentions do not count against
    expect((await get('/voting', otherAdmin)).body.data).toHaveLength(0);
    expect((await post('/voting', m1, { title: 'x' })).status).toBe(403);
  });
});

describe('committee & handover', () => {
  it('lists the committee with contact privacy and runs a checklist-driven handover', async () => {
    const chair = await post('/committee', admin, { userId: adminUserId, name: 'Society Admin', positionKey: 'chairperson', phone: '9876543210', showContactToMembers: false });
    expect(chair.status).toBe(201);
    expect(chair.body.data.positionName).toBe('Chairperson / President');
    expect((await post('/committee', admin, { name: 'Nobody', positionKey: 'KING' })).status).toBe(422);
    await post('/committee', admin, { userId: committeeUserId, name: 'Secretary', positionKey: 'SECRETARY', phone: '9876500000', showContactToMembers: true }).expect(201);
    const asMember = await get('/committee', m1);
    expect(asMember.status).toBe(200);
    expect(asMember.body.data).toHaveLength(2);
    expect(asMember.body.data.find((m: any) => m.positionKey === 'CHAIRPERSON').phone).toBeUndefined();
    expect(asMember.body.data.find((m: any) => m.positionKey === 'SECRETARY').phone).toBe('9876500000');
    expect((await post('/committee', m1, { name: 'Me', positionKey: 'MEMBER' })).status).toBe(403);
    const overview = await get('/committee/overview', admin);
    expect(overview.body.data.vacantPositions.map((p: any) => p.key)).toContain('TREASURER');
    expect(overview.body.data.handover.active).toBe(false);
    // handover
    const started = await post('/committee/handover/start', admin, { note: 'Term ends this month' });
    expect(started.status).toBe(200);
    expect(started.body.data.handover.active).toBe(true);
    expect(started.body.data.handover.checklist.length).toBeGreaterThanOrEqual(5);
    expect((await post('/committee/handover/start', admin, {})).status).toBe(409);
    await post('/committee', admin, { userId: m1UserId, name: 'Asha Member', positionKey: 'CHAIRPERSON', status: 'INCOMING' }).expect(201);
    const blocked = await post('/committee/handover/complete', admin, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.details.pending.length).toBeGreaterThan(0);
    for (const item of started.body.data.handover.checklist) await post('/committee/handover/checklist', admin, { key: item.key, done: true }).expect(200);
    const done = await post('/committee/handover/complete', admin, { termEnd: dayjs().add(2, 'year').toISOString(), note: 'Handed over at the AGM' });
    expect(done.status).toBe(200);
    expect(done.body.data.handover.active).toBe(false);
    expect(done.body.data.members.map((m: any) => m.name)).toEqual(['Asha Member']);
    expect((await get('/committee?status=ENDED', admin)).body.data).toHaveLength(2);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: committeeUserId, type: 'committee.handover' })).toBe(2);
    expect((await get('/committee', otherAdmin)).body.data).toHaveLength(0);
  });
});
