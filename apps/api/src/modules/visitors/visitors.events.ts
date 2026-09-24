import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { storageService } from '../../core/storage/storage.service';
import { formatStatusLabel } from './visitors.util';

/** Walk-in at the gate → hosts get a high-priority approval request (in-app + push, realtime for instant decision). */
domainEvents.on('visitor.pending', async ({ payload, societyId }) => {
  if (!societyId) return;
  const photoUrl = payload.photoKey ? await storageService.signedUrl(payload.photoKey, { expiresInSeconds: 30 * 60 }) : null;
  const data = { visitorId: payload.visitorId, visitorName: payload.visitorName, categoryKey: payload.categoryKey, unitId: payload.unitId, unitCode: payload.unitCode, gateName: payload.gateName, guestCount: payload.guestCount, purpose: payload.purpose, photoUrl, timeoutMinutes: payload.timeoutMinutes, kind: 'visitor.approval' };
  if (payload.hostUserIds?.length) {
    await notificationService.notify({ societyId, recipients: payload.hostUserIds, type: 'visitor.pending', vars: { visitorName: payload.visitorName, category: formatStatusLabel(payload.categoryKey), gate: payload.gateName ?? 'the gate' }, data, link: `/app/my/visitors?approve=${payload.visitorId}`, priority: 'HIGH', socketEvent: 'visitor.approval_requested' });
  } else {
    // no resident login on the unit: let staff with approve rights decide
    await notificationService.notify({ societyId, recipients: { permission: 'visitors:approve' }, type: 'visitor.pending', vars: { visitorName: payload.visitorName, category: formatStatusLabel(payload.categoryKey), gate: payload.gateName ?? 'the gate' }, data, link: `/app/visitors/${payload.visitorId}`, priority: 'HIGH', socketEvent: 'visitor.approval_requested', channels: ['IN_APP', 'PUSH'] });
  }
  realtime.toGate(societyId, 'gate.changed', { visitorId: payload.visitorId, status: 'PENDING' });
});

for (const [event, type] of [['visitor.approved', 'visitor.approved'], ['visitor.denied', 'visitor.denied']] as const) {
  domainEvents.on(event, async ({ payload, societyId, actorId }) => {
    if (!societyId) return;
    // the guard who registered the walk-in hears the decision immediately
    realtime.toGate(societyId, 'gate.decision', { visitorId: payload.visitorId, visitorName: payload.visitorName, unitCode: payload.unitCode, status: type === 'visitor.approved' ? 'APPROVED' : 'DENIED', reason: payload.reason });
    if (payload.createdBy && payload.createdBy !== actorId) await notificationService.notify({ societyId, recipients: [payload.createdBy], type, vars: { visitorName: payload.visitorName }, data: { visitorId: payload.visitorId, status: type === 'visitor.approved' ? 'APPROVED' : 'DENIED' }, link: '/guard', channels: ['IN_APP', 'PUSH'], socketEvent: 'gate.changed' });
    realtime.toUnit(societyId, payload.unitId, 'visitors.changed', { visitorId: payload.visitorId });
  });
}

domainEvents.on('visitor.pass_created', async ({ payload, societyId }) => {
  if (!societyId) return;
  if (payload.email || payload.phone) {
    // the visitor (not a user) gets the pass details by email / WhatsApp
    await notificationService.sendTransactionalEmail?.({ to: payload.email, societyId, templateKey: 'visitor.pass_created', vars: { visitorName: payload.visitorName, passcode: payload.passcode, validUntil: new Date(payload.validUntil).toLocaleString('en-IN'), societyName: undefined }, fallbackSubject: 'Your visitor pass', fallbackBody: '<p>Hello {{visitorName}}, your gate passcode is <strong>{{passcode}}</strong> (valid until {{validUntil}}).</p>' }).catch(() => undefined);
  }
  realtime.toGate(societyId, 'gate.changed', { visitorId: payload.visitorId, status: 'APPROVED' });
  realtime.toUnit(societyId, payload.unitId ?? '', 'visitors.changed', { visitorId: payload.visitorId });
});

domainEvents.on('visitor.checked_in', async ({ payload, societyId }) => {
  if (!societyId) return;
  if (payload.hostUserIds?.length) await notificationService.notify({ societyId, recipients: payload.hostUserIds, type: 'visitor.checked_in', vars: { visitorName: payload.visitorName, time: payload.time }, data: { visitorId: payload.visitorId, gateName: payload.gateName }, link: '/app/my/visitors', socketEvent: 'visitors.changed' });
  realtime.toGate(societyId, 'gate.changed', { visitorId: payload.visitorId, status: 'CHECKED_IN' });
  realtime.toSociety(societyId, 'visitors.changed', { visitorId: payload.visitorId });
});

domainEvents.on('visitor.checked_out', async ({ payload, societyId }) => {
  if (!societyId) return;
  if (payload.hostUserIds?.length) await notificationService.notify({ societyId, recipients: payload.hostUserIds, type: 'visitor.checked_out', vars: { visitorName: payload.visitorName, time: payload.time }, data: { visitorId: payload.visitorId }, link: '/app/my/visitors', channels: ['IN_APP'] });
  realtime.toGate(societyId, 'gate.changed', { visitorId: payload.visitorId, status: 'CHECKED_OUT' });
});

domainEvents.on('visitor.timed_out', async ({ payload, societyId }) => {
  if (!societyId) return;
  realtime.toGate(societyId, 'gate.decision', { visitorId: payload.visitorId, visitorName: payload.visitorName, status: 'EXPIRED', reason: 'No response from the resident' });
  if (payload.createdBy) await notificationService.notify({ societyId, recipients: [payload.createdBy], type: 'visitor.denied', title: `No response for ${payload.visitorName}`, body: 'The resident did not respond in time. Ask them to approve again or contact the office.', data: { visitorId: payload.visitorId }, link: '/guard', channels: ['IN_APP'] });
});

domainEvents.on('visitor.cancelled', async ({ payload, societyId }) => {
  if (!societyId) return;
  realtime.toGate(societyId, 'gate.changed', { visitorId: payload.visitorId, status: 'CANCELLED' });
});

// ---- deliveries
domainEvents.on('delivery.arrived', async ({ payload, societyId }) => {
  if (!societyId) return;
  if (payload.hostUserIds?.length) await notificationService.notify({ societyId, recipients: payload.hostUserIds, type: 'delivery.arrived', vars: { provider: payload.provider, unitCode: payload.unitCode }, title: payload.leaveAtGate ? `${payload.provider} delivery kept at the gate` : undefined, body: payload.leaveAtGate ? `Your ${String(payload.kind).toLowerCase()} from ${payload.provider} is with the security desk. Collect it at your convenience.` : undefined, data: { deliveryId: payload.deliveryId, leaveAtGate: payload.leaveAtGate }, link: '/app/my/deliveries', priority: 'HIGH', socketEvent: 'deliveries.changed' });
  realtime.toGate(societyId, 'gate.changed', { deliveryId: payload.deliveryId });
});

domainEvents.on('delivery.updated', async ({ payload, societyId }) => {
  if (!societyId) return;
  realtime.toGate(societyId, 'gate.changed', { deliveryId: payload.deliveryId, status: payload.status });
  realtime.toUnit(societyId, payload.unitId, 'deliveries.changed', { deliveryId: payload.deliveryId, status: payload.status });
});
