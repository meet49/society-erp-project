import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { noticeService } from '../src/modules/community/notices.service';
import { eventService } from '../src/modules/community/events.service';
import { pollService } from '../src/modules/community/polls.service';
import { Notification } from '../src/models/notification.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let adminUserId = '';
let otherAdmin = '';
let m1 = '';
let m1UserId = '';
let m2 = '';
let m2UserId = '';
let towerA = '';
let towerB = '';
const post = (path: string, token: string, body: Record<string, unknown>) => api.post(`/api/v1${path}`).set(auth(token)).send(body);
const get = (path: string, token: string) => api.get(`/api/v1${path}`).set(auth(token));

async function memberLogin(unitId: string, name: string, roles: any[]) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}@test.local`;
  const resident = (await post('/residents', admin, { unitId, name, email, phone: `90000${Math.floor(Math.random() * 90000) + 10000}`, type: 'OWNER' })).body.data;
  const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [roles.find((r: any) => r.key === 'MEMBER').id] });
  const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
  return { token: accepted.body.data.accessToken as string, userId: accepted.body.data.context.user.id as string };
}

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  const a = await login(api, s.adminEmail, s.adminPassword);
  admin = a.accessToken;
  adminUserId = a.context.user.id;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  towerA = (await post('/buildings', admin, { name: 'Tower A', code: 'A', floors: 1 })).body.data.id;
  towerB = (await post('/buildings', admin, { name: 'Tower B', code: 'B', floors: 1 })).body.data.id;
  const unitA = (await post('/units', admin, { buildingId: towerA, floor: 1, number: '101' })).body.data.id;
  const unitB = (await post('/units', admin, { buildingId: towerB, floor: 2, number: '201' })).body.data.id;
  const roles = (await get('/society/roles', admin)).body.data;
  ({ token: m1, userId: m1UserId } = await memberLogin(unitA, 'Asha Member', roles));
  ({ token: m2, userId: m2UserId } = await memberLogin(unitB, 'Bharat Member', roles));
});
afterAll(teardownTestApp);

describe('notices', () => {
  let towerNotice: any;
  it('targets audiences: only Tower A residents see a Tower A notice, and reads / acknowledgements are tracked', async () => {
    const draft = await post('/notices', admin, { title: 'Tower A lift maintenance', body: 'Lift 2 is under maintenance on Tuesday morning.', categoryKey: 'maintenance', audience: { type: 'BUILDING', buildingIds: [towerA] } });
    expect(draft.status).toBe(201);
    towerNotice = draft.body.data;
    expect(towerNotice.status).toBe('DRAFT');
    expect(towerNotice.noticeNumber).toMatch(/^NTC\//);
    expect(towerNotice.audienceLabel).toBe('Tower A');
    expect((await get('/notices', m1)).body.data).toHaveLength(0); // drafts are invisible to residents
    const preview = await post('/notices/audience/preview', admin, { audience: { type: 'BUILDING', buildingIds: [towerA] } });
    expect(preview.body.data.count).toBe(1);
    const published = await post(`/notices/${towerNotice.id}/publish`, admin, {});
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe('PUBLISHED');
    expect(published.body.data.recipientCount).toBe(1);
    expect(published.body.data.expiresAt).toBeTruthy();
    await flush(300);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'notice.published' })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m2UserId, type: 'notice.published' })).toBe(0);
    const mine = await get('/notices', m1);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].read).toBe(false);
    expect((await get('/notices', m2)).body.data).toHaveLength(0);
    expect((await get(`/notices/${towerNotice.id}`, m2)).status).toBe(404);
    const opened = await get(`/notices/${towerNotice.id}`, m1);
    expect(opened.status).toBe(200);
    expect(opened.body.data.read).toBe(true);
    expect((await get('/notices?unreadOnly=true', m1)).body.data).toHaveLength(0);
    const readers = await get(`/notices/${towerNotice.id}/readers`, admin);
    expect(readers.body.data.readCount).toBe(1);
    expect(readers.body.data.readers[0].user.name).toBe('Asha Member');
    expect((await get(`/notices/${towerNotice.id}/readers`, m1)).status).toBe(403);
  });

  it('acknowledgements, scheduling, archiving and per-society isolation', async () => {
    const agm = (await post('/notices', admin, { title: 'AGM on the 28th', body: 'Please attend.', categoryKey: 'MEETING', requiresAcknowledgement: true, publishNow: true, channels: ['IN_APP'] })).body.data;
    expect(agm.status).toBe('PUBLISHED');
    expect(agm.recipientCount).toBe(3); // admin + two members
    expect((await post(`/notices/${towerNotice.id}/acknowledge`, m1, {})).status).toBe(409); // does not ask for it
    const ack = await post(`/notices/${agm.id}/acknowledge`, m2, {});
    expect(ack.status).toBe(200);
    expect(ack.body.data.acknowledged).toBe(true);
    expect(ack.body.data.ackCount).toBe(1);
    expect((await post(`/notices/${agm.id}/acknowledge`, m2, {})).body.data.ackCount).toBe(1); // idempotent
    const scheduled = (await post('/notices', admin, { title: 'Diwali volunteers', body: 'Sign up!', publishAt: dayjs().add(1, 'hour').toISOString() })).body.data;
    expect(scheduled.status).toBe('SCHEDULED');
    expect((await get('/notices', m2)).body.data.map((n: any) => n.id)).not.toContain(scheduled.id);
    expect(await noticeService.publishScheduled(dayjs().add(30, 'minute').toDate())).toBe(0);
    expect(await noticeService.publishScheduled(dayjs().add(2, 'hour').toDate())).toBe(1);
    expect((await get(`/notices/${scheduled.id}`, admin)).body.data.status).toBe('PUBLISHED');
    expect((await post(`/notices/${agm.id}/archive`, admin, {})).body.data.status).toBe('ARCHIVED');
    expect((await get('/notices', m2)).body.data.map((n: any) => n.id)).not.toContain(agm.id);
    expect((await api.delete(`/api/v1/notices/${scheduled.id}`).set(auth(admin))).status).toBe(409); // published ones are archived, not deleted
    const stats = await get('/notices/stats', admin);
    expect(stats.body.data.published).toBe(2);
    expect((await get('/notices', otherAdmin)).body.data).toHaveLength(0);
    expect((await get(`/notices/${agm.id}`, otherAdmin)).status).toBe(404);
    expect((await post('/notices', m1, { title: 'Members cannot post notices', body: 'x' })).status).toBe(403);
  });
});

describe('community feed', () => {
  let postId = '';
  it('residents post and comment, the committee announces to an audience, reports reach moderators', async () => {
    const created = await post('/community/posts', m1, { body: 'Anyone know a good plumber?' });
    expect(created.status).toBe(201);
    postId = created.body.data.id;
    expect(created.body.data.kind).toBe('POST');
    expect(created.body.data.mine).toBe(true);
    expect((await post('/community/posts', m1, { kind: 'ANNOUNCEMENT', body: 'Members cannot announce' })).status).toBe(403);
    const comment = await post(`/community/posts/${postId}/comments`, m2, { body: 'Ravi from Block B is good.' });
    expect(comment.status).toBe(201);
    expect(comment.body.data.commentCount).toBe(1);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'community.commented' })).toBe(1);
    const liked = await post(`/community/posts/${postId}/like`, m2, {});
    expect(liked.body.data).toEqual({ liked: true, likeCount: 1 });
    expect((await post(`/community/posts/${postId}/like`, m2, {})).body.data.liked).toBe(false);
    const ann = await post('/community/posts', admin, { kind: 'ANNOUNCEMENT', title: 'Water tank cleaning', body: 'Store water on Saturday.', audience: { type: 'BUILDING', buildingIds: [towerB] }, isPinned: true });
    expect(ann.status).toBe(201);
    expect(ann.body.data.audienceLabel).toBe('Tower B');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m2UserId, type: 'community.announcement' })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'community.announcement' })).toBe(0);
    expect((await get('/community/posts', m1)).body.data.map((p: any) => p.id)).not.toContain(ann.body.data.id);
    const feedB = (await get('/community/posts', m2)).body.data;
    expect(feedB[0].id).toBe(ann.body.data.id); // pinned announcement first
    expect(feedB[0].reports).toBeUndefined();
    const reported = await post(`/community/posts/${postId}/report`, m2, { reason: 'Spam' });
    expect(reported.body.data.reportCount).toBe(1);
    expect((await post(`/community/posts/${postId}/report`, m2, { reason: 'Again' })).status).toBe(409);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: adminUserId, type: 'community.reported' })).toBe(1);
    expect((await get('/community/posts?reportedOnly=true', admin)).body.data.map((p: any) => p.id)).toEqual([postId]);
  });

  it('moderation hides posts and settings can switch member posting off', async () => {
    expect((await post(`/community/posts/${postId}/moderate`, m2, { action: 'HIDE' })).status).toBe(403);
    const hidden = await post(`/community/posts/${postId}/moderate`, admin, { action: 'HIDE', note: 'Duplicate' });
    expect(hidden.body.data.status).toBe('HIDDEN');
    expect((await get(`/community/posts/${postId}`, m2)).status).toBe(404);
    expect((await get('/community/posts?status=HIDDEN', admin)).body.data).toHaveLength(1);
    expect((await post(`/community/posts/${postId}/moderate`, admin, { action: 'UNHIDE' })).body.data.status).toBe('ACTIVE');
    expect((await api.delete(`/api/v1/community/posts/${postId}`).set(auth(m2))).status).toBe(403); // not the author
    expect((await api.delete(`/api/v1/community/posts/${postId}`).set(auth(m1))).status).toBe(204);
    expect((await api.put('/api/v1/community/settings').set(auth(admin)).send({ memberPostsEnabled: false })).status).toBe(200);
    expect((await post('/community/posts', m1, { body: 'Blocked?' })).status).toBe(409);
    await api.put('/api/v1/community/settings').set(auth(admin)).send({ memberPostsEnabled: true, moderateMemberPosts: true }).expect(200);
    const pending = await post('/community/posts', m1, { body: 'Needs approval' });
    expect(pending.body.data.status).toBe('PENDING');
    expect((await get('/community/posts', m2)).body.data.map((p: any) => p.id)).not.toContain(pending.body.data.id);
    expect((await get('/community/posts', m1)).body.data.map((p: any) => p.id)).toContain(pending.body.data.id); // authors see their own pending post
    expect((await post(`/community/posts/${pending.body.data.id}/moderate`, admin, { action: 'APPROVE' })).body.data.status).toBe('ACTIVE');
    const stats = await get('/community/stats', admin);
    expect(stats.body.data.announcements).toBe(1);
  });
});

describe('events', () => {
  let eventId = '';
  it('publishes to an audience, enforces capacity on RSVPs and lists attendees', async () => {
    const created = await post('/events', admin, { title: 'Sunday yoga', description: 'Bring a mat', typeKey: 'community', startAt: dayjs().add(3, 'day').hour(7).toISOString(), endAt: dayjs().add(3, 'day').hour(8).toISOString(), venue: 'Lawn', capacity: 3, maxGuestsPerRsvp: 2, publishNow: true });
    expect(created.status).toBe(201);
    eventId = created.body.data.id;
    expect(created.body.data.status).toBe('PUBLISHED');
    expect(created.body.data.spotsLeft).toBe(3);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'event.created' })).toBe(1);
    expect((await post(`/events/${eventId}/rsvp`, m1, { status: 'GOING', guests: 3 })).status).toBe(422);
    const going = await post(`/events/${eventId}/rsvp`, m1, { status: 'GOING', guests: 2 });
    expect(going.status).toBe(200);
    expect(going.body.data.goingCount).toBe(1);
    expect(going.body.data.guestsCount).toBe(2);
    expect(going.body.data.myRsvp.status).toBe('GOING');
    expect(going.body.data.spotsLeft).toBe(0);
    const full = await post(`/events/${eventId}/rsvp`, m2, { status: 'GOING' });
    expect(full.status).toBe(409);
    expect((await post(`/events/${eventId}/rsvp`, m2, { status: 'MAYBE' })).body.data.maybeCount).toBe(1);
    expect((await post(`/events/${eventId}/rsvp`, m1, { status: 'GOING', guests: 1 })).body.data.spotsLeft).toBe(1); // changing my own RSVP frees a spot
    expect((await post(`/events/${eventId}/rsvp`, m2, { status: 'GOING' })).status).toBe(200);
    const attendees = await get(`/events/${eventId}/attendees`, admin);
    expect(attendees.body.data.rsvps).toHaveLength(2);
    expect((await get(`/events/${eventId}/attendees`, m1)).status).toBe(403);
    const detail = await get(`/events/${eventId}`, m2);
    expect(detail.body.data.attendees).toHaveLength(2); // memberCanSeeAttendees defaults to true
    const upcoming = await get('/events?upcoming=true', m1);
    expect(upcoming.body.data.map((e: any) => e.id)).toContain(eventId);
    const csv = await get(`/events/${eventId}/attendees/export`, admin);
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('cancels with notifications to attendees, completes past events and keeps drafts private', async () => {
    const cancelled = await post(`/events/${eventId}/cancel`, admin, { reason: 'Rain' });
    expect(cancelled.body.data.status).toBe('CANCELLED');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'event.cancelled' })).toBe(1);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m2UserId, type: 'event.cancelled' })).toBe(1);
    expect((await post(`/events/${eventId}/rsvp`, m1, { status: 'GOING' })).status).toBe(404);
    const past = (await post('/events', admin, { title: 'Last week meetup', startAt: dayjs().subtract(7, 'day').toISOString(), endAt: dayjs().subtract(7, 'day').add(2, 'hour').toISOString(), publishNow: true })).body.data;
    expect(await eventService.complete()).toBe(1);
    expect((await get(`/events/${past.id}`, admin)).body.data.status).toBe('COMPLETED');
    const draft = (await post('/events', admin, { title: 'Draft party', startAt: dayjs().add(10, 'day').toISOString(), endAt: dayjs().add(10, 'day').add(3, 'hour').toISOString() })).body.data;
    expect((await get(`/events/${draft.id}`, m1)).status).toBe(404);
    expect((await get('/events', otherAdmin)).body.data).toHaveLength(0);
    expect((await post('/events', m1, { title: 'x', startAt: new Date().toISOString(), endAt: dayjs().add(1, 'hour').toISOString() })).status).toBe(403);
  });
});

describe('polls', () => {
  let pollId = '';
  it('one vote per unit, changeable until close, anonymous results', async () => {
    const created = await post('/polls', admin, { question: 'Open house day?', options: ['Saturday', 'Sunday'], oneVotePerUnit: true, anonymous: true, openNow: true, endAt: dayjs().add(3, 'day').toISOString() });
    expect(created.status).toBe(201);
    pollId = created.body.data.id;
    expect(created.body.data.status).toBe('OPEN');
    expect(created.body.data.eligibleCount).toBe(3);
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: m1UserId, type: 'poll.created' })).toBe(1);
    expect((await post(`/polls/${pollId}/vote`, m1, { optionKeys: ['o1', 'o2'] })).status).toBe(422); // single choice
    expect((await post(`/polls/${pollId}/vote`, m1, { optionKeys: ['nope'] })).status).toBe(422);
    const v1 = await post(`/polls/${pollId}/vote`, m1, { optionKeys: ['o1'] });
    expect(v1.status).toBe(200);
    expect(v1.body.data.myVote).toEqual(['o1']);
    expect(v1.body.data.options.find((o: any) => o.key === 'o1').votes).toBe(1);
    const changed = await post(`/polls/${pollId}/vote`, m1, { optionKeys: ['o2'] });
    expect(changed.body.data.options.map((o: any) => o.votes)).toEqual([0, 1]);
    expect(changed.body.data.voteCount).toBe(1);
    await post(`/polls/${pollId}/vote`, m2, { optionKeys: ['o2'] }).expect(200);
    const results = await get(`/polls/${pollId}/results`, admin);
    expect(results.body.data.total).toBe(2);
    expect(results.body.data.turnout).toBe(67);
    expect(results.body.data.options[1].percent).toBe(100);
    expect(results.body.data.voters).toBeUndefined(); // anonymous
    expect((await get(`/polls/${pollId}/results`, m1)).status).toBe(200); // live results are on
    expect((await post(`/polls/${pollId}/close`, admin, {})).body.data.status).toBe('CLOSED');
    expect((await post(`/polls/${pollId}/vote`, m2, { optionKeys: ['o1'] })).status).toBe(409);
    expect((await post('/polls', m1, { question: 'x', options: ['a', 'b'] })).status).toBe(403);
  });

  it('named polls expose voters to result viewers, hidden live results and auto-close', async () => {
    const named = (await post('/polls', admin, { question: 'Repaint the lobby?', options: ['Yes', 'No'], anonymous: false, showLiveResults: false, openNow: true })).body.data;
    await post(`/polls/${named.id}/vote`, m1, { optionKeys: ['o1'] }).expect(200);
    const asMember = await get(`/polls/${named.id}`, m2);
    expect(asMember.body.data.options[0].votes).toBeNull();
    expect((await get(`/polls/${named.id}/results`, m2)).status).toBe(403);
    const results = await get(`/polls/${named.id}/results`, admin);
    expect(results.body.data.voters).toHaveLength(1);
    expect(results.body.data.voters[0].name).toBe('Asha Member');
    const timed = (await post('/polls', admin, { question: 'Timed?', options: ['a', 'b'], openNow: true, endAt: dayjs().add(1, 'hour').toISOString() })).body.data;
    expect(await pollService.closeEnded(dayjs().add(2, 'hour').toDate())).toBe(1);
    expect((await get(`/polls/${timed.id}`, admin)).body.data.status).toBe('CLOSED');
    expect((await get('/polls', otherAdmin)).body.data).toHaveLength(0);
  });
});

describe('surveys', () => {
  it('validates answers, aggregates results, exports and respects anonymity', async () => {
    const created = await post('/surveys', admin, { title: 'Housekeeping', questions: [{ type: 'RATING', label: 'Cleanliness', max: 5 }, { type: 'SINGLE', label: 'Frequency', options: ['Daily', 'Weekly'] }, { type: 'MULTIPLE', label: 'Areas', options: ['Lobby', 'Lift', 'Garden'], required: false }, { type: 'TEXT', label: 'Comments', required: false }], anonymous: false, openNow: true });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.questions.map((q: any) => q.key)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(created.body.data.eligibleCount).toBe(3);
    const bad = await post(`/surveys/${id}/respond`, m1, { answers: [{ questionKey: 'q1', value: 9 }] });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.fields)).toEqual(['q1', 'q2']);
    const ok1 = await post(`/surveys/${id}/respond`, m1, { answers: [{ questionKey: 'q1', value: 4 }, { questionKey: 'q2', value: 'Daily' }, { questionKey: 'q3', value: ['Lobby', 'Lift'] }, { questionKey: 'q4', value: 'More bins please' }] });
    expect(ok1.status).toBe(200);
    expect(ok1.body.data.responseCount).toBe(1);
    expect(ok1.body.data.myResponse.answers).toHaveLength(4);
    await post(`/surveys/${id}/respond`, m1, { answers: [{ questionKey: 'q1', value: 5 }, { questionKey: 'q2', value: 'Daily' }] }).expect(200); // edit until close
    await post(`/surveys/${id}/respond`, m2, { answers: [{ questionKey: 'q1', value: 2 }, { questionKey: 'q2', value: 'Weekly' }, { questionKey: 'q4', value: 'Lift smells' }] }).expect(200);
    expect((await get(`/surveys/${id}/results`, m1)).status).toBe(403);
    const results = await get(`/surveys/${id}/results`, admin);
    expect(results.body.data.responseCount).toBe(2);
    expect(results.body.data.turnout).toBe(67);
    expect(results.body.data.questions[0].average).toBe(3.5);
    expect(results.body.data.questions[1].options).toEqual([{ option: 'Daily', count: 1, percent: 50 }, { option: 'Weekly', count: 1, percent: 50 }]);
    expect(results.body.data.questions[3].answers[0].who.name).toBe('Bharat Member');
    const csv = await get(`/surveys/${id}/export`, admin);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Bharat Member');
    const anon = (await post('/surveys', admin, { title: 'Anonymous', questions: [{ type: 'YES_NO', label: 'Happy?' }], anonymous: true, openNow: true })).body.data;
    await post(`/surveys/${anon.id}/respond`, m2, { answers: [{ questionKey: 'q1', value: 'Yes' }] }).expect(200);
    const anonResults = await get(`/surveys/${anon.id}/results`, admin);
    expect(anonResults.body.data.questions[0].options[0]).toEqual({ option: 'Yes', count: 1, percent: 100 });
    expect((await get(`/surveys/${anon.id}/export`, admin)).text).not.toContain('Bharat');
    expect((await post(`/surveys/${id}/close`, admin, {})).body.data.status).toBe('CLOSED');
    expect((await post(`/surveys/${id}/respond`, m2, { answers: [] })).status).toBe(409);
    expect((await get('/surveys', otherAdmin)).body.data).toHaveLength(0);
    expect((await post('/surveys', m1, { title: 'x', questions: [{ type: 'TEXT', label: 'y' }] })).status).toBe(403);
  });
});
