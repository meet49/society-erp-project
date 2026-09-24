import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { staffService } from './staff.service';

domainEvents.on('operations.changed', ({ payload, societyId }) => {
  if (!societyId) return;
  realtime.toSociety(societyId, 'operations.changed', payload);
  if (payload.gate) realtime.toGate(societyId, 'operations.changed', payload);
});

domainEvents.on('domestic_help.registered', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'domestic_help:verify', excludeUserIds: actorId ? [actorId] : [] }, type: 'domestic_help.registered', vars: { name: payload.name, unitCode: payload.unitCode }, data: { helpId: payload.helpId }, link: `/app/domestic-help?help=${payload.helpId}`, channels: ['IN_APP'] });
});

domainEvents.on('domestic_help.verified', async ({ payload, societyId }) => {
  if (!societyId || !payload.unitIds?.length) return;
  await notificationService.notify({ societyId, recipients: { unitIds: payload.unitIds }, type: 'domestic_help.verified', vars: { name: payload.name, status: payload.status === 'VERIFIED' ? 'verified' : 'rejected' }, data: { helpId: payload.helpId }, link: '/app/my/domestic-help' });
});

domainEvents.on('domestic_help.entry', async ({ payload, societyId }) => {
  if (!societyId || !payload.unitIds?.length) return;
  await notificationService.notify({ societyId, recipients: { unitIds: payload.unitIds }, type: 'domestic_help.entry', vars: { name: payload.name, time: dayjs(payload.at).format('HH:mm'), direction: payload.type === 'IN' ? 'entered' : 'left' }, data: { helpId: payload.helpId, type: payload.type }, link: '/app/my/domestic-help', channels: ['IN_APP', 'PUSH'] });
});

domainEvents.on('staff.attendance_missing', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'staff:attendance' }, type: 'staff.attendance_missing', vars: { date: dayjs(payload.date).format('DD MMM'), count: payload.count }, data: { date: payload.date, count: payload.count }, link: '/app/staff?tab=attendance', channels: ['IN_APP', 'PUSH'] });
});

registerJobHandlers(() => {
  jobQueue.register(JobNames.ATTENDANCE_PROCESS, async () => {
    const r = await staffService.process();
    if (r.autoMarked || r.reminders) logger.info(r, 'Attendance processed');
  });
});
