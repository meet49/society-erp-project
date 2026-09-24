import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { amenityService } from './amenities.service';

const fmt = (d?: Date | string | null) => (d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '');
const money = (n?: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n ?? 0)}`;
const staffLink = (id: string) => `/app/amenities/bookings/${id}`;
const myLink = (id: string) => `/app/my/amenities?booking=${id}`;

/** Workflow engine → booking. Idempotent: the service only acts on PENDING_APPROVAL bookings. */
domainEvents.on('workflow.completed', async ({ payload, societyId, actorId }) => {
  if (!societyId || payload.entityType !== 'AmenityBooking') return;
  await amenityService.applyWorkflowOutcome(societyId, payload.entityId, payload.status as 'APPROVED' | 'REJECTED', actorId ?? null, payload.note);
});

/** Approvers are told a booking waits on them. */
domainEvents.on('workflow.step_pending', async ({ payload, societyId, actorId }) => {
  if (!societyId || payload.entityType !== 'AmenityBooking') return;
  const ctx = payload.context ?? {};
  const recipients = payload.approverType === 'PERMISSION' ? { permission: payload.approverRef as string, excludeUserIds: actorId ? [actorId] : [] } : { userIds: ((payload.userIds as string[]) ?? []).filter((u) => u !== actorId) };
  await notificationService.notify({
    societyId,
    recipients,
    type: 'amenity.booking_pending',
    vars: { amenityName: ctx.amenityName ?? '', unitCode: ctx.unitCode ?? '', startAt: fmt(ctx.startAt as string) },
    data: { instanceId: payload.instanceId, bookingId: payload.entityId, entityType: 'AmenityBooking', entityId: payload.entityId },
    link: staffLink(payload.entityId),
    priority: 'HIGH',
    socketEvent: 'approval.pending',
  });
  realtime.toSociety(societyId, 'approvals.changed', { instanceId: payload.instanceId });
});

domainEvents.on('amenity.booking_created', ({ payload, societyId }) => {
  if (societyId) realtime.toSociety(societyId, 'amenities.changed', { bookingId: payload.bookingId, amenityId: payload.amenityId });
});

domainEvents.on('amenity.booking_confirmed', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: [payload.bookedBy], type: 'amenity.booking_confirmed', vars: { amenityName: payload.amenityName, startAt: fmt(payload.startAt) }, data: { bookingId: payload.bookingId }, link: myLink(payload.bookingId), socketEvent: 'amenity.booking_confirmed' });
  realtime.toSociety(societyId, 'amenities.changed', { bookingId: payload.bookingId });
});

domainEvents.on('amenity.payment_due', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: [payload.bookedBy], type: 'amenity.payment_due', vars: { amenityName: payload.amenityName, amount: money(payload.amount), deadline: fmt(payload.deadline), bookingNumber: payload.bookingNumber }, data: { bookingId: payload.bookingId, invoiceId: payload.invoiceId }, link: `/app/my/bills/${payload.invoiceId}`, priority: 'HIGH', socketEvent: 'amenity.payment_due' });
  realtime.toSociety(societyId, 'amenities.changed', { bookingId: payload.bookingId });
});

domainEvents.on('amenity.booking_rejected', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: [payload.bookedBy], type: 'amenity.booking_rejected', vars: { amenityName: payload.amenityName, startAt: fmt(payload.startAt), reason: payload.reason ?? '' }, data: { bookingId: payload.bookingId }, link: myLink(payload.bookingId), socketEvent: 'amenity.booking_rejected' });
  realtime.toSociety(societyId, 'amenities.changed', { bookingId: payload.bookingId });
});

domainEvents.on('amenity.booking_cancelled', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  if (payload.bookedBy && payload.bookedBy !== actorId) {
    await notificationService.notify({ societyId, recipients: [payload.bookedBy], type: 'amenity.booking_cancelled', vars: { amenityName: payload.amenityName, startAt: fmt(payload.startAt), bookingNumber: payload.bookingNumber, reason: payload.reason ?? '' }, data: { bookingId: payload.bookingId }, link: myLink(payload.bookingId), socketEvent: 'amenity.booking_cancelled' });
  }
  realtime.toSociety(societyId, 'amenities.changed', { bookingId: payload.bookingId });
});

/** Finance is told when a cancellation or a completed booking leaves money to return. */
domainEvents.on('amenity.refund_due', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'payments:refund', excludeUserIds: [] }, type: 'amenity.refund_due', vars: { bookingNumber: payload.bookingNumber, amount: money(payload.amount), unitCode: payload.unitCode ?? '', amenityName: payload.amenityName ?? '' }, data: { bookingId: payload.bookingId, amount: payload.amount, actorId }, link: staffLink(payload.bookingId), priority: 'HIGH', channels: ['IN_APP', 'PUSH'] });
});

/** A payment that settles a booking invoice confirms the booking. */
domainEvents.on('payment.received', async ({ payload, societyId }) => {
  if (!societyId || !Array.isArray(payload.invoiceIds) || !payload.invoiceIds.length) return;
  for (const invoiceId of payload.invoiceIds as string[]) await amenityService.markPaidByInvoice(societyId, invoiceId, payload.paymentId ?? null);
});
