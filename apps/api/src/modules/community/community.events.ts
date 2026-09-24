import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { Society } from '../../models/society.model';
import { User } from '../../models/user.model';

const fmt = (d?: Date | string | null) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '');
const societyName = async (societyId: string) => (await Society.findById(societyId).select('name').lean())?.name ?? 'Your society';
const userName = async (userId: string) => (await User.findById(userId).select('name').lean())?.name ?? 'A neighbour';

/** Notices fan out to the resolved audience on the channels chosen for the notice. */
domainEvents.on('notice.published', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({
    societyId,
    recipients: payload.userIds,
    type: 'notice.published',
    vars: { title: payload.title, societyName: await societyName(societyId), excerpt: payload.excerpt },
    data: { noticeId: payload.noticeId, priority: payload.priority, requiresAcknowledgement: payload.requiresAcknowledgement },
    link: `/app/my/notices/${payload.noticeId}`,
    priority: payload.priority === 'URGENT' ? 'CRITICAL' : payload.priority === 'IMPORTANT' ? 'HIGH' : 'NORMAL',
    channels: payload.channels,
    socketEvent: 'notice.published',
  });
  realtime.toSociety(societyId, 'community.changed', { noticeId: payload.noticeId, actorId });
});

domainEvents.on('community.announcement', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: (payload.userIds as string[]).filter((u) => u !== actorId), type: 'community.announcement', vars: { title: payload.title, excerpt: payload.excerpt, societyName: await societyName(societyId) }, data: { postId: payload.postId }, link: `/app/my/community?post=${payload.postId}`, priority: 'HIGH', socketEvent: 'community.announcement' });
  realtime.toSociety(societyId, 'community.changed', { postId: payload.postId });
});

domainEvents.on('community.commented', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.authorId) return;
  await notificationService.notify({ societyId, recipients: [payload.authorId], type: 'community.commented', vars: { name: await userName(payload.byUserId ?? actorId ?? ''), excerpt: payload.excerpt }, data: { postId: payload.postId }, link: `/app/my/community?post=${payload.postId}`, channels: ['IN_APP', 'PUSH'] });
});

domainEvents.on('community.reported', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'communication:moderate', excludeUserIds: actorId ? [actorId] : [] }, type: 'community.reported', vars: { name: await userName(payload.byUserId ?? actorId ?? ''), reason: payload.reason }, data: { postId: payload.postId }, link: `/app/community?reported=true`, priority: 'HIGH', channels: ['IN_APP', 'PUSH'] });
});

domainEvents.on('community.pending', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'communication:moderate', excludeUserIds: actorId ? [actorId] : [] }, type: 'community.pending', title: 'A post is waiting for moderation', body: payload.excerpt, data: { postId: payload.postId }, link: `/app/community?status=PENDING`, channels: ['IN_APP'] });
});

domainEvents.on('community.changed', ({ payload, societyId }) => {
  if (societyId) realtime.toSociety(societyId, 'community.changed', payload);
});

domainEvents.on('event.published', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: (payload.userIds as string[]).filter((u) => u !== actorId), type: 'event.created', vars: { name: payload.name, startAt: fmt(payload.startAt), venue: payload.venue }, data: { eventId: payload.eventId }, link: `/app/my/events/${payload.eventId}`, socketEvent: 'event.published' });
  realtime.toSociety(societyId, 'community.changed', { eventId: payload.eventId });
});

domainEvents.on('event.cancelled', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  if (payload.userIds?.length) await notificationService.notify({ societyId, recipients: (payload.userIds as string[]).filter((u) => u !== actorId), type: 'event.cancelled', vars: { name: payload.name, startAt: fmt(payload.startAt), reason: payload.reason ?? '' }, data: { eventId: payload.eventId }, link: `/app/my/events/${payload.eventId}`, priority: 'HIGH' });
  realtime.toSociety(societyId, 'community.changed', { eventId: payload.eventId });
});

domainEvents.on('event.rsvp', ({ payload, societyId }) => {
  if (societyId) realtime.toSociety(societyId, 'community.changed', { eventId: payload.eventId });
});

domainEvents.on('poll.opened', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: (payload.userIds as string[]).filter((u) => u !== actorId), type: 'poll.created', vars: { question: payload.question, endAt: fmt(payload.endAt) }, data: { pollId: payload.pollId }, link: `/app/my/polls?poll=${payload.pollId}`, socketEvent: 'poll.opened' });
  realtime.toSociety(societyId, 'community.changed', { pollId: payload.pollId });
});

domainEvents.on('survey.opened', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: (payload.userIds as string[]).filter((u) => u !== actorId), type: 'survey.opened', vars: { title: payload.title, endAt: payload.endAt ? fmt(payload.endAt) : 'it closes' }, data: { surveyId: payload.surveyId }, link: `/app/my/surveys/${payload.surveyId}`, socketEvent: 'survey.opened' });
  realtime.toSociety(societyId, 'community.changed', { surveyId: payload.surveyId });
});
