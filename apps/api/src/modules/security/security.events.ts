import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { audienceService, type Audience } from '../../core/audience/audience.service';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { incidentService } from './incidents.service';
import { emergencyService } from './emergency.service';

// ------------------------------------------------------------------ realtime fan-out
domainEvents.on('security.changed', ({ payload, societyId }) => {
  if (!societyId) return;
  realtime.toSociety(societyId, 'security.changed', payload);
  realtime.toGate(societyId, 'security.changed', payload);
});

domainEvents.on('emergency.changed', ({ payload, societyId }) => {
  if (!societyId) return;
  realtime.toSociety(societyId, 'emergency.changed', payload);
  realtime.toGate(societyId, 'emergency.changed', payload);
});

// ------------------------------------------------------------------ incidents
domainEvents.on('incident.reported', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const cfg = await incidentService.getConfig(societyId);
  const critical = payload.severity === 'CRITICAL' || payload.severity === 'HIGH';
  const vars = { incidentNumber: payload.incidentNumber, title: payload.title, severity: String(payload.severity).toLowerCase(), typeKey: String(payload.typeKey).replace(/_/g, ' ').toLowerCase(), location: payload.location ?? payload.unitCode ?? 'the premises' };
  await notificationService.notify({ societyId, recipients: { permission: 'security:update', roleKeys: critical ? cfg.notifyRoleKeysOnCritical : [], excludeUserIds: actorId ? [actorId] : [] }, type: 'incident.reported', vars, data: { incidentId: payload.incidentId, severity: payload.severity }, link: `/app/security?incident=${payload.incidentId}`, priority: critical ? 'HIGH' : 'NORMAL', socketEvent: 'security.changed' });
  if (payload.unitId && cfg.notifyUnitOnIncident) {
    await notificationService.notify({ societyId, recipients: { unitIds: [payload.unitId], excludeUserIds: actorId ? [actorId] : [] }, type: 'incident.unit_notice', vars, data: { incidentId: payload.incidentId }, priority: critical ? 'HIGH' : 'NORMAL' });
  }
});

domainEvents.on('incident.assigned', async ({ payload, societyId, actorId }) => {
  if (!societyId || !payload.assignedTo || payload.assignedTo === actorId) return;
  await notificationService.notify({ societyId, recipients: [payload.assignedTo], type: 'incident.assigned', vars: { incidentNumber: payload.incidentNumber, title: payload.title }, data: { incidentId: payload.incidentId }, link: `/app/security?incident=${payload.incidentId}` });
});

domainEvents.on('incident.updated', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const recipients = [payload.reportedBy, payload.assignedTo].filter((u): u is string => Boolean(u) && u !== actorId);
  if (!recipients.length) return;
  await notificationService.notify({ societyId, recipients: [...new Set(recipients)], type: 'incident.updated', vars: { incidentNumber: payload.incidentNumber, title: payload.title, status: String(payload.status).replace(/_/g, ' ').toLowerCase(), change: payload.change }, data: { incidentId: payload.incidentId, change: payload.change }, link: `/guard/incidents?incident=${payload.incidentId}` });
});

// ------------------------------------------------------------------ emergency
domainEvents.on('emergency.sos', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const cfg = await emergencyService.getConfig(societyId);
  const alert = { id: payload.alertId, alertNumber: payload.alertNumber, category: payload.category, raisedBy: payload.raisedByName, unitCode: payload.unitCode, location: payload.location, message: payload.message, at: new Date().toISOString() };
  realtime.toSociety(societyId, 'emergency.sos', alert);
  realtime.toGate(societyId, 'emergency.sos', alert);
  const count = await notificationService.notify({ societyId, recipients: { roleKeys: cfg.sosNotifyRoleKeys, permission: 'emergency:respond', excludeUserIds: actorId ? [actorId] : [] }, type: 'emergency.sos', vars: { raisedBy: payload.raisedByName, unitCode: payload.unitCode ?? '-', location: payload.location, category: String(payload.category).toLowerCase(), phone: payload.raisedByPhone ?? '' }, data: { alertId: payload.alertId, category: payload.category }, link: `/app/emergency?alert=${payload.alertId}`, priority: 'CRITICAL', socketEvent: 'emergency.changed' });
  logger.warn({ societyId, alert: payload.alertNumber, notified: count }, 'SOS raised');
});

domainEvents.on('emergency.acknowledged', async ({ payload, societyId }) => {
  if (!societyId || !payload.first) return;
  await notificationService.notify({ societyId, recipients: [payload.raisedBy], type: 'emergency.acknowledged', vars: { responder: payload.responderName, alertNumber: payload.alertNumber }, data: { alertId: payload.alertId }, link: '/app/my/emergency', priority: 'HIGH', socketEvent: 'emergency.changed' });
  realtime.toGate(societyId, 'emergency.changed', { alertId: payload.alertId, status: 'ACKNOWLEDGED' });
});

domainEvents.on('emergency.resolved', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const recipients = [...new Set<string>([payload.raisedBy, ...(payload.responders ?? [])])].filter((u) => u !== actorId);
  if (recipients.length) await notificationService.notify({ societyId, recipients, type: 'emergency.resolved', vars: { alertNumber: payload.alertNumber, outcome: payload.outcome === 'FALSE_ALARM' ? 'marked a false alarm' : 'resolved', by: payload.resolvedByName }, data: { alertId: payload.alertId, outcome: payload.outcome }, socketEvent: 'emergency.changed' });
  realtime.toGate(societyId, 'emergency.changed', { alertId: payload.alertId, status: payload.outcome });
});

domainEvents.on('emergency.broadcast', async ({ payload, societyId }) => {
  if (!societyId) return;
  const userIds = await audienceService.resolveUserIds(societyId, payload.audience as Audience);
  realtime.toSociety(societyId, 'emergency.broadcast', { id: payload.alertId, title: payload.title, message: payload.message, category: payload.category, expiresAt: payload.expiresAt });
  realtime.toGate(societyId, 'emergency.broadcast', { id: payload.alertId, title: payload.title, message: payload.message });
  if (userIds.length) await notificationService.notify({ societyId, recipients: userIds, type: 'emergency.broadcast', vars: { title: payload.title, message: payload.message }, data: { alertId: payload.alertId }, link: '/app/my/emergency', priority: 'CRITICAL', socketEvent: 'emergency.changed' });
});

domainEvents.on('emergency.all_clear', async ({ payload, societyId }) => {
  if (!societyId) return;
  const userIds = await audienceService.resolveUserIds(societyId, payload.audience as Audience);
  realtime.toSociety(societyId, 'emergency.changed', { alertId: payload.alertId, status: 'RESOLVED' });
  if (userIds.length) await notificationService.notify({ societyId, recipients: userIds, type: 'emergency.all_clear', vars: { title: payload.title, note: payload.note ?? 'The situation is under control.' }, data: { alertId: payload.alertId }, priority: 'HIGH', socketEvent: 'emergency.changed' });
});

domainEvents.on('emergency.escalated', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { roleKeys: payload.roleKeys ?? [] }, type: 'emergency.escalated', vars: { alertNumber: payload.alertNumber, raisedBy: payload.raisedByName, unitCode: payload.unitCode ?? '-', minutes: payload.minutes, location: payload.location ?? payload.unitCode ?? 'the society' }, data: { alertId: payload.alertId }, link: `/app/emergency?alert=${payload.alertId}`, priority: 'CRITICAL', socketEvent: 'emergency.changed' });
});

registerJobHandlers(() => {
  jobQueue.register(JobNames.EMERGENCY_SWEEP, async () => {
    const r = await emergencyService.sweep();
    if (r.escalated || r.expired) logger.info(r, 'Emergency sweep');
  });
  jobQueue.register(JobNames.SECURITY_SWEEP, async () => {
    const r = await incidentService.sweep();
    if (r.closed) logger.info(r, 'Incident sweep');
  });
});
