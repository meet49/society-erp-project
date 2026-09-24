import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Expense, type ExpenseDoc } from '../../models/expense.model';
import { Vendor } from '../../models/vendor.model';
import { Category } from '../../models/category.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { domainEvents } from '../../core/events/event-bus';
import { runFinanceHook } from '../../core/hooks/finance-hooks';
import { workflowService } from '../../core/workflows/workflow.service';
import { round2 } from '../billing/charge-calculator';
import { EXPENSE_CATEGORY_ACCOUNTS } from '../accounting/chart-of-accounts';

function totals(input: { amount: number; taxRate?: number; tdsAmount?: number }) {
  const taxAmount = round2((input.amount * (input.taxRate ?? 0)) / 100);
  const total = round2(input.amount + taxAmount - (input.tdsAmount ?? 0));
  return { taxAmount, total };
}

class ExpenseService {
  private async accountCodeFor(societyId: string, categoryKey?: string, explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (categoryKey) {
      const cat = await Category.findOne({ societyId, type: 'EXPENSE_CATEGORY', key: categoryKey }).lean();
      const meta = (cat?.metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.accountCode === 'string' && meta.accountCode) return meta.accountCode;
      if (EXPENSE_CATEGORY_ACCOUNTS[categoryKey]) return EXPENSE_CATEGORY_ACCOUNTS[categoryKey];
    }
    return '5100';
  }

  private async vendorSnapshot(societyId: string, vendorId?: string | null, vendorName?: string) {
    if (!vendorId) return { vendorId: null, vendorName: vendorName ?? undefined, paymentTermsDays: 30 };
    const v = await Vendor.findOne({ _id: vendorId, societyId, deletedAt: null }).lean();
    if (!v) throw Errors.validation({ vendorId: ['Unknown vendor'] });
    if (v.status === 'BLACKLISTED') throw Errors.validation({ vendorId: ['This vendor is blacklisted'] });
    return { vendorId: v._id, vendorName: v.name, paymentTermsDays: v.paymentTermsDays ?? 30 };
  }

  async list(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId };
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.from || query.to) filter.billDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    if (query.overdueOnly) Object.assign(filter, { paymentStatus: { $ne: 'PAID' }, approvalStatus: 'APPROVED', dueDate: { $lt: new Date() } });
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ expenseNumber: rx }, { title: rx }, { vendorName: rx }, { billNumber: rx }];
    return paginate(Expense as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'billDate', 'dueDate', 'total', 'approvalStatus', 'paymentStatus'], populate: [{ path: 'createdBy', select: 'name' }] });
  }

  async get(societyId: string, id: string) {
    const expense = await Expense.findOne({ _id: id, societyId }).populate('vendorId', 'name phone email paymentTermsDays').populate('createdBy', 'name').populate('approvedBy', 'name').populate('payments.recordedBy', 'name').populate('payments.bankAccountId', 'name kind').lean();
    if (!expense) throw Errors.notFound('Expense');
    return { ...expense, id: String(expense._id), workflow: await workflowService.instanceFor(societyId, 'Expense', expense._id) };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const vendor = await this.vendorSnapshot(societyId, input.vendorId, input.vendorName);
    const t = totals(input as { amount: number; taxRate?: number; tdsAmount?: number });
    const general = await configurationService.getSocietySetting<{ financialYearStartMonth: number }>(societyId, 'society.general');
    const expense = await Expense.create({
      ...input,
      societyId,
      expenseNumber: await sequenceService.next(societyId, 'expense', { prefix: 'EXP', padding: 5, resetPolicy: 'FISCAL_YEAR', fiscalYearStartMonth: general.financialYearStartMonth }),
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      categoryKey: input.categoryKey ? String(input.categoryKey).toUpperCase() : undefined,
      accountCode: await this.accountCodeFor(societyId, input.categoryKey ? String(input.categoryKey).toUpperCase() : undefined, input.accountCode),
      fundKey: input.fundKey ? String(input.fundKey).toUpperCase() : null,
      dueDate: input.dueDate ?? (input.billDate ? dayjs(input.billDate).add(vendor.paymentTermsDays, 'day').toDate() : undefined),
      taxAmount: t.taxAmount,
      total: t.total,
      approvalStatus: 'DRAFT',
      paymentStatus: 'UNPAID',
      createdBy: byUserId,
    });
    auditService.record({ action: 'expense.created', resource: 'Expense', resourceId: expense._id, societyId, newValue: { expenseNumber: expense.expenseNumber, title: expense.title, total: expense.total, vendor: expense.vendorName }, req });
    if (input.submit) await this.submit(societyId, String(expense._id), byUserId, req);
    return (await Expense.findById(expense._id))!.toJSON();
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const expense = await Expense.findOne({ _id: id, societyId });
    if (!expense) throw Errors.notFound('Expense');
    if (expense.approvalStatus === 'APPROVED' || expense.approvalStatus === 'PENDING') throw Errors.conflict('Approved or pending expenses cannot be edited. Reject/withdraw first.');
    if (patch.vendorId !== undefined || patch.vendorName !== undefined) {
      const v = await this.vendorSnapshot(societyId, patch.vendorId ?? (expense.vendorId ? String(expense.vendorId) : null), patch.vendorName ?? expense.vendorName ?? undefined);
      patch.vendorId = v.vendorId;
      patch.vendorName = v.vendorName;
    }
    if (patch.categoryKey) patch.categoryKey = String(patch.categoryKey).toUpperCase();
    if (patch.categoryKey || patch.accountCode) patch.accountCode = await this.accountCodeFor(societyId, patch.categoryKey ?? expense.categoryKey, patch.accountCode);
    expense.set(patch);
    const t = totals({ amount: expense.amount, taxRate: expense.taxRate, tdsAmount: expense.tdsAmount });
    expense.taxAmount = t.taxAmount;
    expense.total = t.total;
    if (expense.approvalStatus === 'REJECTED') {
      expense.approvalStatus = 'DRAFT';
      expense.rejectionReason = undefined;
    }
    await expense.save();
    auditService.record({ action: 'expense.updated', resource: 'Expense', resourceId: expense._id, societyId, newValue: patch, req });
    return expense.toJSON();
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const expense = await Expense.findOne({ _id: id, societyId });
    if (!expense) throw Errors.notFound('Expense');
    if (expense.approvalStatus === 'APPROVED' || expense.paidAmount > 0) throw Errors.conflict('Approved or paid expenses cannot be deleted');
    await workflowService.cancel(societyId, 'Expense', expense._id);
    await expense.deleteOne();
    auditService.record({ action: 'expense.deleted', resource: 'Expense', resourceId: id, societyId, newValue: { expenseNumber: expense.expenseNumber }, req });
  }

  /** Submits for approval through the configurable workflow. Auto-approves when no workflow step applies. */
  async submit(societyId: string, id: string, byUserId: string, req?: any) {
    const expense = await Expense.findOne({ _id: id, societyId });
    if (!expense) throw Errors.notFound('Expense');
    if (expense.approvalStatus === 'PENDING' || expense.approvalStatus === 'APPROVED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `Expense is already ${expense.approvalStatus.toLowerCase()}`);
    if (expense.total <= 0) throw Errors.validation({ amount: ['Expense amount must be positive'] });
    expense.submittedAt = new Date();
    const wf = await workflowService.start({ societyId, key: 'expense_approval', entityType: 'Expense', entityId: expense._id, context: { amount: expense.total, categoryKey: expense.categoryKey, vendorId: expense.vendorId ? String(expense.vendorId) : null, fundKey: expense.fundKey, title: expense.title, expenseNumber: expense.expenseNumber }, startedBy: byUserId });
    if (wf.autoApproved) {
      await this.markApproved(expense, byUserId, 'Auto-approved by workflow rules', req);
    } else {
      expense.approvalStatus = 'PENDING';
      expense.workflowInstanceId = wf.instance!._id;
      await expense.save();
      auditService.record({ action: 'expense.submitted', resource: 'Expense', resourceId: expense._id, societyId, newValue: { expenseNumber: expense.expenseNumber, total: expense.total }, req });
      domainEvents.emit('expense.submitted', { expenseId: String(expense._id), expenseNumber: expense.expenseNumber, title: expense.title, amount: expense.total, vendorName: expense.vendorName }, { societyId, actorId: byUserId });
    }
    return (await Expense.findById(expense._id))!.toJSON();
  }

  private async markApproved(expense: ExpenseDoc, byUserId: string | null, note: string, req?: any): Promise<void> {
    expense.approvalStatus = 'APPROVED';
    expense.approvedAt = new Date();
    expense.approvedBy = byUserId as any;
    expense.rejectionReason = undefined;
    await expense.save();
    const societyId = String(expense.societyId);
    auditService.record({ action: 'expense.approved', resource: 'Expense', resourceId: expense._id, societyId, newValue: { expenseNumber: expense.expenseNumber, total: expense.total, note }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    await runFinanceHook('onExpenseApproved', expense.toObject(), { societyId, byUserId: byUserId ?? undefined });
    domainEvents.emit('expense.decided', { expenseId: String(expense._id), expenseNumber: expense.expenseNumber, decision: 'approved', note, createdBy: expense.createdBy ? String(expense.createdBy) : null, amount: expense.total }, { societyId, actorId: byUserId });
  }

  private async markRejected(expense: ExpenseDoc, byUserId: string | null, reason: string, req?: any): Promise<void> {
    expense.approvalStatus = 'REJECTED';
    expense.rejectedAt = new Date();
    expense.rejectionReason = reason;
    await expense.save();
    const societyId = String(expense.societyId);
    auditService.record({ action: 'expense.rejected', resource: 'Expense', resourceId: expense._id, societyId, newValue: { expenseNumber: expense.expenseNumber, reason }, actor: byUserId ? undefined : { type: 'SYSTEM' }, req });
    domainEvents.emit('expense.decided', { expenseId: String(expense._id), expenseNumber: expense.expenseNumber, decision: 'rejected', note: reason, createdBy: expense.createdBy ? String(expense.createdBy) : null, amount: expense.total }, { societyId, actorId: byUserId });
  }

  /** Direct decision by someone with `expenses:approve` (records a workflow decision when a workflow is pending). */
  async decide(societyId: string, id: string, user: { userId: string; roleKeys: string[]; permissions: Set<string> }, decision: 'APPROVED' | 'REJECTED', note?: string, req?: any) {
    const expense = await Expense.findOne({ _id: id, societyId });
    if (!expense) throw Errors.notFound('Expense');
    if (expense.approvalStatus !== 'PENDING' && !(expense.approvalStatus === 'DRAFT' && decision === 'APPROVED')) throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, `Expense is ${expense.approvalStatus.toLowerCase()}`);
    if (expense.workflowInstanceId && expense.approvalStatus === 'PENDING') {
      const instance = await workflowService.decide(societyId, String(expense.workflowInstanceId), user, decision, note, req);
      // the workflow.completed event handler finalises the expense; return the fresh state
      if (instance.status === 'PENDING') return (await Expense.findById(expense._id))!.toJSON();
      await this.applyWorkflowOutcome(societyId, expense._id, instance.status as 'APPROVED' | 'REJECTED', user.userId, note);
      return (await Expense.findById(expense._id))!.toJSON();
    }
    if (decision === 'APPROVED') await this.markApproved(expense, user.userId, note ?? 'Approved directly', req);
    else await this.markRejected(expense, user.userId, note ?? 'Rejected', req);
    return expense.toJSON();
  }

  /** Idempotent finaliser used by both the direct path and the workflow event handler. */
  async applyWorkflowOutcome(societyId: string, expenseId: any, status: 'APPROVED' | 'REJECTED', byUserId: string | null, note?: string): Promise<void> {
    const expense = await Expense.findOne({ _id: expenseId, societyId });
    if (!expense || expense.approvalStatus !== 'PENDING') return;
    if (status === 'APPROVED') await this.markApproved(expense, byUserId, note ?? 'Approved via workflow');
    else await this.markRejected(expense, byUserId, note ?? 'Rejected via workflow');
  }

  async withdraw(societyId: string, id: string, byUserId: string, req?: any) {
    const expense = await Expense.findOne({ _id: id, societyId });
    if (!expense) throw Errors.notFound('Expense');
    if (expense.approvalStatus !== 'PENDING') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, 'Only pending expenses can be withdrawn');
    await workflowService.cancel(societyId, 'Expense', expense._id, byUserId);
    expense.approvalStatus = 'DRAFT';
    expense.workflowInstanceId = null as any;
    await expense.save();
    auditService.record({ action: 'expense.withdrawn', resource: 'Expense', resourceId: expense._id, societyId, req });
    return expense.toJSON();
  }

  async recordPayment(societyId: string, id: string, input: { amount: number; date: Date; method: string; reference?: string; bankAccountId?: string | null; notes?: string }, byUserId: string, req?: any) {
    const expense = await Expense.findOne({ _id: id, societyId });
    if (!expense) throw Errors.notFound('Expense');
    if (expense.approvalStatus !== 'APPROVED') throw Errors.conflict('Only approved expenses can be paid');
    const remaining = round2(expense.total - expense.paidAmount);
    if (input.amount > remaining + 0.001) throw Errors.validation({ amount: [`Amount exceeds the outstanding ₹${remaining}`] });
    expense.payments.push({ ...input, bankAccountId: input.bankAccountId ?? null, recordedBy: byUserId } as any);
    expense.paidAmount = round2(expense.paidAmount + input.amount);
    expense.paymentStatus = expense.paidAmount >= expense.total ? 'PAID' : 'PARTIAL';
    await expense.save();
    const payment = expense.payments[expense.payments.length - 1];
    auditService.record({ action: 'expense.paid', resource: 'Expense', resourceId: expense._id, societyId, newValue: { expenseNumber: expense.expenseNumber, amount: input.amount, method: input.method, reference: input.reference }, req });
    await runFinanceHook('onExpensePaid', expense.toObject(), { societyId, byUserId, payment: payment.toObject() } as any);
    return (await this.get(societyId, id));
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const monthStart = dayjs().startOf('month').toDate();
    const [pending, payable, month, byCategory, overdue] = await Promise.all([
      Expense.aggregate([{ $match: { societyId: sid, approvalStatus: 'PENDING' } }, { $group: { _id: null, amount: { $sum: '$total' }, count: { $sum: 1 } } }]),
      Expense.aggregate([{ $match: { societyId: sid, approvalStatus: 'APPROVED', paymentStatus: { $ne: 'PAID' } } }, { $group: { _id: null, amount: { $sum: { $subtract: ['$total', '$paidAmount'] } }, count: { $sum: 1 } } }]),
      Expense.aggregate([{ $match: { societyId: sid, approvalStatus: 'APPROVED', $or: [{ billDate: { $gte: monthStart } }, { billDate: null, approvedAt: { $gte: monthStart } }] } }, { $group: { _id: null, amount: { $sum: '$total' }, count: { $sum: 1 } } }]),
      Expense.aggregate([{ $match: { societyId: sid, approvalStatus: 'APPROVED', approvedAt: { $gte: dayjs().subtract(90, 'day').toDate() } } }, { $group: { _id: '$categoryKey', amount: { $sum: '$total' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }, { $limit: 8 }]),
      Expense.countDocuments({ societyId, approvalStatus: 'APPROVED', paymentStatus: { $ne: 'PAID' }, dueDate: { $lt: new Date() } }),
    ]);
    return { pendingApproval: { amount: round2(pending[0]?.amount ?? 0), count: pending[0]?.count ?? 0 }, payable: { amount: round2(payable[0]?.amount ?? 0), count: payable[0]?.count ?? 0 }, thisMonth: { amount: round2(month[0]?.amount ?? 0), count: month[0]?.count ?? 0 }, overdueBills: overdue, byCategory: byCategory.map((c) => ({ category: c._id ?? 'UNCATEGORISED', amount: round2(c.amount), count: c.count })) };
  }

  async exportRows(societyId: string, query: Record<string, any>) {
    const rows: any[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 });
      rows.push(...res.items.map((e: any) => ({ expenseNumber: e.expenseNumber, title: e.title, vendor: e.vendorName ?? '', category: e.categoryKey ?? '', account: e.accountCode, billNumber: e.billNumber ?? '', billDate: e.billDate ? dayjs(e.billDate).format('YYYY-MM-DD') : '', dueDate: e.dueDate ? dayjs(e.dueDate).format('YYYY-MM-DD') : '', amount: e.amount, tax: e.taxAmount, tds: e.tdsAmount, total: e.total, paid: e.paidAmount, approval: e.approvalStatus, payment: e.paymentStatus })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }
}

export const expenseService = new ExpenseService();
