import { ErrorCodes } from '@society-erp/shared';
import { PurchaseOrder, type PurchaseOrderDoc } from '../../models/purchase-order.model';
import { Vendor } from '../../models/vendor.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { domainEvents } from '../../core/events/event-bus';
import { workflowService } from '../../core/workflows/workflow.service';
import { round2 } from '../billing/charge-calculator';
import { expenseService } from './expenses.service';

function computeItems(items: any[]) {
  const lines = items.map((i) => {
    const amount = round2(i.quantity * i.rate);
    return { ...i, amount, taxRate: i.taxRate ?? 0 };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + (l.amount * (l.taxRate ?? 0)) / 100, 0));
  return { lines, subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

/** Purchase requisition → approval → order → goods receipt → expense. */
class PurchaseOrderService {
  async list(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.status) filter.status = query.status;
    if (query.vendorId) filter.vendorId = query.vendorId;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ poNumber: rx }, { title: rx }, { vendorName: rx }];
    return paginate(PurchaseOrder as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'total', 'status', 'expectedDate'], populate: [{ path: 'requestedBy', select: 'name' }] });
  }

  async get(societyId: string, id: string) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId }).populate('vendorId', 'name phone email').populate('requestedBy', 'name').populate('approvedBy', 'name').lean();
    if (!po) throw Errors.notFound('Purchase order');
    return { ...po, id: String(po._id), workflow: await workflowService.instanceFor(societyId, 'PurchaseOrder', po._id) };
  }

  private async vendorName(societyId: string, vendorId?: string | null, fallback?: string) {
    if (!vendorId) return fallback;
    const v = await Vendor.findOne({ _id: vendorId, societyId, deletedAt: null }).select('name').lean();
    if (!v) throw Errors.validation({ vendorId: ['Unknown vendor'] });
    return v.name;
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const { lines, subtotal, taxTotal, total } = computeItems(input.items);
    const general = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    const po = await PurchaseOrder.create({ ...input, items: lines, subtotal, taxTotal, total, societyId, poNumber: await sequenceService.next(societyId, 'purchase_order', { prefix: 'PO', padding: 5, resetPolicy: 'FISCAL_YEAR', fiscalYearStartMonth: general.financialYearStartMonth }), vendorName: await this.vendorName(societyId, input.vendorId, input.vendorName), categoryKey: input.categoryKey ? String(input.categoryKey).toUpperCase() : undefined, status: 'DRAFT', requestedBy: byUserId });
    auditService.record({ action: 'purchase_order.created', resource: 'PurchaseOrder', resourceId: po._id, societyId, newValue: { poNumber: po.poNumber, title: po.title, total: po.total }, req });
    if (input.submit) await this.submit(societyId, String(po._id), byUserId, req);
    return (await PurchaseOrder.findById(po._id))!.toJSON();
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (!['DRAFT', 'REJECTED'].includes(po.status)) throw Errors.conflict('Only draft or rejected purchase orders can be edited');
    if (patch.items) {
      const c = computeItems(patch.items);
      patch.items = c.lines;
      patch.subtotal = c.subtotal;
      patch.taxTotal = c.taxTotal;
      patch.total = c.total;
    }
    if (patch.vendorId !== undefined || patch.vendorName !== undefined) patch.vendorName = await this.vendorName(societyId, patch.vendorId ?? (po.vendorId ? String(po.vendorId) : null), patch.vendorName ?? po.vendorName ?? undefined);
    po.set({ ...patch, status: 'DRAFT', rejectionReason: undefined });
    await po.save();
    auditService.record({ action: 'purchase_order.updated', resource: 'PurchaseOrder', resourceId: po._id, societyId, newValue: { total: po.total }, req });
    return po.toJSON();
  }

  async submit(societyId: string, id: string, byUserId: string, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (!['DRAFT', 'REJECTED'].includes(po.status)) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `Purchase order is ${po.status.toLowerCase()}`);
    if (!po.items.length || po.total <= 0) throw Errors.validation({ items: ['Add at least one item with an amount'] });
    const wf = await workflowService.start({ societyId, key: 'purchase_approval', entityType: 'PurchaseOrder', entityId: po._id, context: { amount: po.total, categoryKey: po.categoryKey, vendorId: po.vendorId ? String(po.vendorId) : null, title: po.title, poNumber: po.poNumber }, startedBy: byUserId });
    if (wf.autoApproved) await this.markApproved(po, byUserId, 'Auto-approved by workflow rules', req);
    else {
      po.status = 'PENDING_APPROVAL';
      po.workflowInstanceId = wf.instance!._id;
      await po.save();
      auditService.record({ action: 'purchase_order.submitted', resource: 'PurchaseOrder', resourceId: po._id, societyId, newValue: { poNumber: po.poNumber, total: po.total }, req });
    }
    return (await PurchaseOrder.findById(po._id))!.toJSON();
  }

  private async markApproved(po: PurchaseOrderDoc, byUserId: string | null, note: string, req?: any) {
    po.status = 'APPROVED';
    po.approvedAt = new Date();
    po.approvedBy = byUserId as any;
    po.rejectionReason = undefined;
    await po.save();
    auditService.record({ action: 'purchase_order.approved', resource: 'PurchaseOrder', resourceId: po._id, societyId: String(po.societyId), newValue: { poNumber: po.poNumber, note }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    domainEvents.emit('purchase_order.decided', { poId: String(po._id), poNumber: po.poNumber, decision: 'approved', note, requestedBy: po.requestedBy ? String(po.requestedBy) : null, amount: po.total }, { societyId: String(po.societyId), actorId: byUserId });
  }

  private async markRejected(po: PurchaseOrderDoc, byUserId: string | null, reason: string, req?: any) {
    po.status = 'REJECTED';
    po.rejectionReason = reason;
    await po.save();
    auditService.record({ action: 'purchase_order.rejected', resource: 'PurchaseOrder', resourceId: po._id, societyId: String(po.societyId), newValue: { poNumber: po.poNumber, reason }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    domainEvents.emit('purchase_order.decided', { poId: String(po._id), poNumber: po.poNumber, decision: 'rejected', note: reason, requestedBy: po.requestedBy ? String(po.requestedBy) : null, amount: po.total }, { societyId: String(po.societyId), actorId: byUserId });
  }

  async decide(societyId: string, id: string, user: { userId: string; roleKeys: string[]; permissions: Set<string> }, decision: 'APPROVED' | 'REJECTED', note?: string, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (po.status !== 'PENDING_APPROVAL') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `Purchase order is ${po.status.toLowerCase()}`);
    if (po.workflowInstanceId) {
      const instance = await workflowService.decide(societyId, String(po.workflowInstanceId), user, decision, note, req);
      if (instance.status !== 'PENDING') await this.applyWorkflowOutcome(societyId, po._id, instance.status as 'APPROVED' | 'REJECTED', user.userId, note);
    } else if (decision === 'APPROVED') await this.markApproved(po, user.userId, note ?? 'Approved', req);
    else await this.markRejected(po, user.userId, note ?? 'Rejected', req);
    return (await PurchaseOrder.findById(po._id))!.toJSON();
  }

  async applyWorkflowOutcome(societyId: string, poId: any, status: 'APPROVED' | 'REJECTED', byUserId: string | null, note?: string): Promise<void> {
    const po = await PurchaseOrder.findOne({ _id: poId, societyId });
    if (!po || po.status !== 'PENDING_APPROVAL') return;
    if (status === 'APPROVED') await this.markApproved(po, byUserId, note ?? 'Approved via workflow');
    else await this.markRejected(po, byUserId, note ?? 'Rejected via workflow');
  }

  async markOrdered(societyId: string, id: string, byUserId: string, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (po.status !== 'APPROVED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, 'Only approved purchase orders can be sent to the vendor');
    po.status = 'ORDERED';
    po.orderedAt = new Date();
    await po.save();
    auditService.record({ action: 'purchase_order.ordered', resource: 'PurchaseOrder', resourceId: po._id, societyId, actor: { id: byUserId }, req });
    return po.toJSON();
  }

  async receive(societyId: string, id: string, input: { items: { itemId: string; receivedQuantity: number }[]; note?: string }, byUserId: string, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (!['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `Purchase order is ${po.status.toLowerCase()}`);
    for (const r of input.items) {
      const item = po.items.find((i) => String(i._id) === r.itemId);
      if (!item) throw Errors.validation({ items: ['Unknown item'] });
      item.receivedQuantity = Math.min(item.quantity, round2((item.receivedQuantity ?? 0) + r.receivedQuantity));
    }
    const complete = po.items.every((i) => (i.receivedQuantity ?? 0) >= i.quantity);
    po.status = complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    if (complete) po.receivedAt = new Date();
    if (input.note) po.notes = `${po.notes ? `${po.notes}\n` : ''}${input.note}`;
    await po.save();
    auditService.record({ action: 'purchase_order.received', resource: 'PurchaseOrder', resourceId: po._id, societyId, newValue: { status: po.status, items: input.items }, actor: { id: byUserId }, req });
    domainEvents.emit('purchase_order.received', { poId: String(po._id), poNumber: po.poNumber, complete, received: input.items, items: po.items.map((i) => ({ itemId: String(i._id), inventoryItemId: i.inventoryItemId ? String(i.inventoryItemId) : null, description: i.description, receivedQuantity: i.receivedQuantity, rate: i.rate })) }, { societyId, actorId: byUserId });
    return po.toJSON();
  }

  /** Creates the payable expense from the PO (approved automatically: the PO already went through approval). */
  async convertToExpense(societyId: string, id: string, input: { billNumber?: string; billDate?: Date; dueDate?: Date; amount?: number; accountCode?: string }, byUserId: string, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (!['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status)) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, 'Purchase order must be approved first');
    if (po.expenseId) throw Errors.conflict('An expense already exists for this purchase order');
    const amount = input.amount ?? po.subtotal;
    const taxRate = po.subtotal > 0 ? round2((po.taxTotal / po.subtotal) * 100) : 0;
    const expense = await expenseService.create(societyId, { title: po.title, description: `From purchase order ${po.poNumber}`, vendorId: po.vendorId ? String(po.vendorId) : null, vendorName: po.vendorName, categoryKey: po.categoryKey, accountCode: input.accountCode, billNumber: input.billNumber, billDate: input.billDate ?? new Date(), dueDate: input.dueDate, amount, taxRate, tdsAmount: 0, attachments: [], purchaseOrderId: po._id, submit: false }, byUserId, req);
    // PO approval already covered this spend: approve the expense directly
    const expenseId = String((expense as any).id ?? (expense as any)._id);
    const approved = await expenseService.decide(societyId, expenseId, { userId: byUserId, roleKeys: [], permissions: new Set(['expenses:approve']) }, 'APPROVED', `Approved with purchase order ${po.poNumber}`, req);
    po.expenseId = expenseId as any;
    po.status = po.status === 'RECEIVED' ? 'CLOSED' : po.status;
    await po.save();
    auditService.record({ action: 'purchase_order.converted', resource: 'PurchaseOrder', resourceId: po._id, societyId, newValue: { expense: approved.expenseNumber }, req });
    return { purchaseOrder: po.toJSON(), expense: approved };
  }

  async cancel(societyId: string, id: string, reason: string, byUserId: string, req?: any) {
    const po = await PurchaseOrder.findOne({ _id: id, societyId });
    if (!po) throw Errors.notFound('Purchase order');
    if (['CLOSED', 'CANCELLED'].includes(po.status) || po.expenseId) throw Errors.conflict('This purchase order can no longer be cancelled');
    await workflowService.cancel(societyId, 'PurchaseOrder', po._id, byUserId);
    po.status = 'CANCELLED';
    po.notes = `${po.notes ? `${po.notes}\n` : ''}Cancelled: ${reason}`;
    await po.save();
    auditService.record({ action: 'purchase_order.cancelled', resource: 'PurchaseOrder', resourceId: po._id, societyId, newValue: { reason }, req });
    return po.toJSON();
  }
}

export const purchaseOrderService = new PurchaseOrderService();
