import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { meetingService } from './meetings.service';
import { votingService } from './voting.service';

const fmt = (d?: Date | string | null) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '');
const others = (ids: string[] | undefined, actorId?: string | null) => (ids ?? []).filter((u) => u !== actorId);

domainEvents.on('meeting.scheduled', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: others(payload.userIds, actorId), type: 'meeting.scheduled', vars: { title: payload.title, scheduledAt: fmt(payload.scheduledAt), venue: payload.venue || 'venue to be announced' }, data: { meetingId: payload.meetingId }, link: `/app/my/meetings/${payload.meetingId}`, socketEvent: 'meeting.scheduled' });
  realtime.toSociety(societyId, 'governance.changed', { meetingId: payload.meetingId });
});

domainEvents.on('meeting.reminder', async ({ payload, societyId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: payload.userIds, type: 'meeting.reminder', vars: { title: payload.title, scheduledAt: fmt(payload.scheduledAt), venue: payload.venue || '' }, data: { meetingId: payload.meetingId }, link: `/app/my/meetings/${payload.meetingId}`, priority: 'HIGH' });
});

domainEvents.on('meeting.cancelled', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  if (payload.userIds?.length) await notificationService.notify({ societyId, recipients: others(payload.userIds, actorId), type: 'meeting.cancelled', vars: { title: payload.title, scheduledAt: fmt(payload.scheduledAt), reason: payload.reason ?? '' }, data: { meetingId: payload.meetingId }, link: `/app/my/meetings/${payload.meetingId}`, priority: 'HIGH' });
  realtime.toSociety(societyId, 'governance.changed', { meetingId: payload.meetingId });
});

domainEvents.on('meeting.minutes_published', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  if (payload.userIds?.length) await notificationService.notify({ societyId, recipients: others(payload.userIds, actorId), type: 'meeting.minutes_published', vars: { title: payload.title }, data: { meetingId: payload.meetingId }, link: `/app/my/meetings/${payload.meetingId}` });
  realtime.toSociety(societyId, 'governance.changed', { meetingId: payload.meetingId });
});

domainEvents.on('voting.opened', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: others(payload.userIds, actorId), type: 'voting.opened', vars: { title: payload.title, endAt: payload.endAt ? fmt(payload.endAt) : 'it closes' }, data: { votingId: payload.votingId }, link: `/app/my/voting?vote=${payload.votingId}`, priority: 'HIGH', socketEvent: 'voting.opened' });
  realtime.toSociety(societyId, 'governance.changed', { votingId: payload.votingId });
});

domainEvents.on('voting.closed', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  if (payload.meetingId && payload.resolutionKey) await meetingService.applyVotingOutcome(societyId, payload.meetingId, payload.resolutionKey, payload.counts ?? {}, payload.outcome);
  if (payload.userIds?.length) await notificationService.notify({ societyId, recipients: others(payload.userIds, actorId), type: 'voting.closed', vars: { title: payload.title, outcome: String(payload.outcome ?? '').toLowerCase().replace('_', ' ') }, data: { votingId: payload.votingId }, link: `/app/my/voting?vote=${payload.votingId}` });
  realtime.toSociety(societyId, 'governance.changed', { votingId: payload.votingId });
});

domainEvents.on('committee.handover', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'governance:manage', roleKeys: ['COMMITTEE'], excludeUserIds: actorId ? [actorId] : [] }, type: 'committee.handover', vars: { status: payload.status, note: payload.note ?? '' }, data: { status: payload.status }, link: '/app/committee', priority: 'HIGH' });
  realtime.toSociety(societyId, 'governance.changed', { handover: payload.status });
});

domainEvents.on('governance.changed', ({ payload, societyId }) => {
  if (societyId) realtime.toSociety(societyId, 'governance.changed', payload);
});

registerJobHandlers(() => {
  jobQueue.register(JobNames.GOVERNANCE_SWEEP, async () => {
    const [votes, reminders] = await Promise.all([votingService.closeEnded(), meetingService.sendReminders()]);
    if (votes || reminders) logger.info({ votes, reminders }, 'Governance sweep');
  });
});
