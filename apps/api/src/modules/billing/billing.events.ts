import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';

const fmtDate = (d?: Date | string | null) => (d ? dayjs(d).format('DD MMM YYYY') : '');
const fmtMoney = (n?: number) => (n == null ? '' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n));

// ---- invoices → residents of the unit
domainEvents.on('invoice.created', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({
    societyId,
    recipients: { unitIds: [payload.unitId] },
    type: 'invoice.created',
    vars: { invoiceNumber: payload.invoiceNumber, unitCode: payload.unitCode, amount: fmtMoney(payload.amount), dueDate: fmtDate(payload.dueDate) },
    data: { invoiceId: payload.invoiceId },
    link: `/app/my/bills/${payload.invoiceId}`,
    socketEvent: 'invoice.created',
  });
  realtime.toUnit(societyId, payload.unitId, 'billing.changed', { invoiceId: payload.invoiceId });
});

domainEvents.on('invoice.overdue', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({
    societyId,
    recipients: { unitIds: [payload.unitId] },
    type: 'invoice.overdue',
    vars: { invoiceNumber: payload.invoiceNumber, unitCode: payload.unitCode, balanceDue: fmtMoney(payload.balanceDue), dueDate: fmtDate(payload.dueDate) },
    data: { invoiceId: payload.invoiceId },
    link: `/app/my/bills/${payload.invoiceId}`,
    priority: 'HIGH',
  });
});

domainEvents.on('invoice.reminder', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({
    societyId,
    recipients: { unitIds: [payload.unitId] },
    type: 'invoice.reminder',
    title: `Payment reminder: ${payload.invoiceNumber}`,
    body: `₹${fmtMoney(payload.balanceDue)} is due for unit ${payload.unitCode} by ${fmtDate(payload.dueDate)}.`,
    vars: { invoiceNumber: payload.invoiceNumber, unitCode: payload.unitCode, balanceDue: fmtMoney(payload.balanceDue), dueDate: fmtDate(payload.dueDate) },
    data: { invoiceId: payload.invoiceId },
    link: `/app/my/bills/${payload.invoiceId}`,
  });
});

// ---- payments → payer's household + finance team
domainEvents.on('payment.received', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const vars = { receiptNumber: payload.receiptNumber, amount: fmtMoney(payload.amount), unitCode: payload.unitCode, method: payload.method };
  await notificationService.notify({ societyId, recipients: { unitIds: [payload.unitId] }, type: 'payment.received', vars, data: { paymentId: payload.paymentId }, link: `/app/my/payments/${payload.paymentId}`, socketEvent: 'payment.received' });
  await notificationService.notify({
    societyId,
    recipients: { permission: 'payments:view', excludeUserIds: actorId ? [actorId] : [] },
    type: 'payment.received',
    title: `Payment received from ${payload.unitCode}`,
    body: `₹${fmtMoney(payload.amount)} via ${payload.method} (receipt ${payload.receiptNumber}).`,
    vars,
    data: { paymentId: payload.paymentId },
    link: `/app/payments/${payload.paymentId}`,
    channels: ['IN_APP'],
  });
  realtime.toSociety(societyId, 'payment.received', { paymentId: payload.paymentId, unitId: payload.unitId, amount: payload.amount });
  realtime.toUnit(societyId, payload.unitId, 'billing.changed', { paymentId: payload.paymentId });
});

domainEvents.on('payment.refunded', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({
    societyId,
    recipients: { unitIds: [payload.unitId] },
    type: 'payment.refunded',
    title: `Refund of ₹${fmtMoney(payload.amount)} processed`,
    body: `A refund of ₹${fmtMoney(payload.amount)} against receipt ${payload.receiptNumber} has been processed. ${payload.reason ?? ''}`.trim(),
    data: { paymentId: payload.paymentId },
    link: `/app/my/payments/${payload.paymentId}`,
  });
  realtime.toUnit(societyId, payload.unitId, 'billing.changed', { paymentId: payload.paymentId });
});

// ---- subscription payments → platform console
domainEvents.on('platform.payment_received', async ({ payload }) => {
  await notificationService.notify({
    societyId: null,
    recipients: { platformAdmins: true },
    type: 'platform.payment_received',
    title: `Subscription payment: ${payload.societyName}`,
    body: `₹${fmtMoney(payload.amount)} received for the ${payload.planName} plan (${payload.billingCycle}).`,
    link: '/admin/payments',
    channels: ['IN_APP'],
  });
  realtime.toPlatform('platform.payment_received', payload);
});
