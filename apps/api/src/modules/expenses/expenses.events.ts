import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { expenseService } from './expenses.service';
import { purchaseOrderService } from './purchase-orders.service';
import { vendorService } from './vendors.service';

const fmtMoney = (n?: number) => (n == null ? '' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n));

/** Workflow engine → business entities. Each handler is idempotent (entities check their own state). */
domainEvents.on('workflow.completed', async ({ payload, societyId, actorId }) => {
  if (!societyId) return;
  const status = payload.status as 'APPROVED' | 'REJECTED';
  if (payload.entityType === 'Expense') await expenseService.applyWorkflowOutcome(societyId, payload.entityId, status, actorId ?? null, payload.note);
  else if (payload.entityType === 'PurchaseOrder') await purchaseOrderService.applyWorkflowOutcome(societyId, payload.entityId, status, actorId ?? null, payload.note);
  else if (payload.entityType === 'Vendor') await vendorService.applyApproval(societyId, payload.entityId, status);
});

/** Approvers are told when a step is waiting on them. */
domainEvents.on('workflow.step_pending', async ({ payload, societyId, actorId }) => {
  if (!societyId || ['AmenityBooking', 'Document'].includes(payload.entityType)) return;
  const ctx = payload.context ?? {};
  const label = payload.entityType === 'Expense' ? `Expense ${ctx.expenseNumber ?? ''}: ${ctx.title ?? ''} (₹${fmtMoney(ctx.amount)})` : payload.entityType === 'PurchaseOrder' ? `Purchase order ${ctx.poNumber ?? ''}: ${ctx.title ?? ''} (₹${fmtMoney(ctx.amount)})` : `${payload.entityType} ${ctx.name ?? ''}`;
  const recipients = payload.approverType === 'PERMISSION' ? { permission: payload.approverRef, excludeUserIds: actorId ? [actorId] : [] } : { userIds: (payload.userIds as string[]).filter((u) => u !== actorId) };
  const link = payload.entityType === 'Expense' ? `/app/expenses/${payload.entityId}` : payload.entityType === 'PurchaseOrder' ? `/app/expenses/purchase-orders/${payload.entityId}` : '/app/approvals';
  await notificationService.notify({
    societyId,
    recipients,
    type: payload.entityType === 'Expense' ? 'expense.approval_requested' : 'approval.requested',
    title: `Approval needed: ${payload.stepName}`,
    body: `${label} is waiting for your decision.`,
    vars: { expenseNumber: ctx.expenseNumber ?? ctx.poNumber ?? '', amount: fmtMoney(ctx.amount), vendorName: ctx.vendorName ?? ctx.title ?? '' },
    data: { instanceId: payload.instanceId, entityType: payload.entityType, entityId: payload.entityId },
    link,
    priority: 'HIGH',
    socketEvent: 'approval.pending',
  });
  realtime.toSociety(societyId, 'approvals.changed', { instanceId: payload.instanceId });
});

domainEvents.on('expense.decided', async ({ payload, societyId }) => {
  if (!societyId || !payload.createdBy) return;
  await notificationService.notify({ societyId, recipients: [payload.createdBy], type: 'expense.decided', vars: { expenseNumber: payload.expenseNumber, decision: payload.decision }, data: { expenseId: payload.expenseId }, link: `/app/expenses/${payload.expenseId}` });
  realtime.toSociety(societyId, 'approvals.changed', { entityId: payload.expenseId });
});

domainEvents.on('purchase_order.decided', async ({ payload, societyId }) => {
  if (!societyId || !payload.requestedBy) return;
  await notificationService.notify({ societyId, recipients: [payload.requestedBy], type: 'purchase_order.decided', title: `Purchase order ${payload.poNumber} ${payload.decision}`, body: payload.note ?? '', data: { poId: payload.poId }, link: `/app/expenses/purchase-orders/${payload.poId}` });
  realtime.toSociety(societyId, 'approvals.changed', { entityId: payload.poId });
});
