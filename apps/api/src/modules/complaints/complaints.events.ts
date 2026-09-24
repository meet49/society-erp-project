import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';

const link = (id: string) => `/app/complaints/${id}`;
const myLink = (id: string) => `/app/my/complaints/${id}`;

/** New ticket → helpdesk staff (anyone who can assign) + confirmation to the resident. */
domainEvents.on('complaint.created', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const vars = { ticketNumber: payload.ticketNumber, title: payload.title, unitCode: payload.unitCode ?? '—', priority: payload.priority };
  await notificationService.notify({ societyId, recipients: { permission: 'complaints:assign', excludeUserIds: actorId ? [actorId] : [] }, type: 'complaint.created', vars, data: { complaintId: payload.complaintId }, link: link(payload.complaintId), priority: payload.priority === 'CRITICAL' ? 'CRITICAL' : payload.priority === 'HIGH' ? 'HIGH' : 'NORMAL', socketEvent: 'complaint.created' });
  if (payload.raisedBy) await notificationService.notify({ societyId, recipients: [payload.raisedBy], type: 'complaint.created', title: `Complaint ${payload.ticketNumber} registered`, body: `“${payload.title}” has been logged. You'll be notified on every update.`, vars, data: { complaintId: payload.complaintId }, link: myLink(payload.complaintId), channels: ['IN_APP'] });
  realtime.toSociety(societyId, 'complaints.changed', { complaintId: payload.complaintId });
});

domainEvents.on('complaint.assigned', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const vars = { ticketNumber: payload.ticketNumber, title: payload.title, assigneeName: payload.assigneeName ?? '' };
  if (payload.assignedTo && payload.assignedTo !== actorId) await notificationService.notify({ societyId, recipients: [payload.assignedTo], type: 'complaint.assigned', vars, data: { complaintId: payload.complaintId }, link: link(payload.complaintId), priority: 'HIGH', socketEvent: 'complaint.assigned' });
  if (payload.raisedBy && payload.raisedBy !== actorId) await notificationService.notify({ societyId, recipients: [payload.raisedBy], type: 'complaint.assigned', title: `${payload.ticketNumber} assigned`, body: `${payload.assigneeName ?? 'A team member'} is now handling “${payload.title}”.`, vars, data: { complaintId: payload.complaintId }, link: myLink(payload.complaintId), channels: ['IN_APP', 'PUSH'] });
  realtime.toSociety(societyId, 'complaints.changed', { complaintId: payload.complaintId });
});

domainEvents.on('complaint.updated', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const vars = { ticketNumber: payload.ticketNumber, title: payload.title, status: payload.status.replace('_', ' ').toLowerCase() };
  const targets = [payload.raisedBy, payload.assignedTo].filter((u): u is string => Boolean(u) && u !== actorId);
  if (targets.length) await notificationService.notify({ societyId, recipients: [...new Set(targets)], type: 'complaint.updated', vars: { ...vars, note: payload.note ?? '' }, data: { complaintId: payload.complaintId, status: payload.status }, link: payload.raisedBy && targets.includes(payload.raisedBy) ? myLink(payload.complaintId) : link(payload.complaintId), socketEvent: 'complaint.updated' });
  realtime.toSociety(societyId, 'complaints.changed', { complaintId: payload.complaintId, status: payload.status });
});

domainEvents.on('complaint.commented', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const targets = [payload.raisedBy, payload.assignedTo].filter((u): u is string => Boolean(u) && u !== actorId);
  if (!targets.length) return;
  await notificationService.notify({ societyId, recipients: [...new Set(targets)], type: 'complaint.commented', title: `New reply on ${payload.ticketNumber}`, body: payload.excerpt, data: { complaintId: payload.complaintId }, link: payload.staffReply ? myLink(payload.complaintId) : link(payload.complaintId), channels: ['IN_APP', 'PUSH'], socketEvent: 'complaint.updated' });
  realtime.toSociety(societyId, 'complaints.changed', { complaintId: payload.complaintId });
});

domainEvents.on('complaint.escalated', async ({ payload, societyId }) => {
  if (!societyId || !payload.userIds?.length) return;
  await notificationService.notify({ societyId, recipients: payload.userIds, type: 'complaint.escalated', vars: { ticketNumber: payload.ticketNumber, title: payload.title, level: payload.level }, data: { complaintId: payload.complaintId, level: payload.level }, link: link(payload.complaintId), priority: 'HIGH', socketEvent: 'complaint.escalated' });
  realtime.toSociety(societyId, 'complaints.changed', { complaintId: payload.complaintId, escalated: payload.level });
});
