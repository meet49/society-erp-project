import mongoose from 'mongoose';
import { Vendor } from '../../models/vendor.model';
import { Expense } from '../../models/expense.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { maskString } from '../../lib/crypto';
import { auditService } from '../../core/audit/audit.service';
import { workflowService } from '../../core/workflows/workflow.service';
import { round2 } from '../billing/charge-calculator';

function normalise(input: Record<string, any>) {
  const out: Record<string, any> = { ...input };
  if (input.email === '') out.email = undefined;
  if (input.phone === '') out.phone = undefined;
  if (input.altPhone === '') out.altPhone = undefined;
  if (input.code) out.code = String(input.code).toUpperCase();
  if (input.categoryKey) out.categoryKey = String(input.categoryKey).toUpperCase();
  if (input.bank) {
    const { accountNumber, ...rest } = input.bank;
    out.bank = { ...rest, ...(accountNumber ? { accountNumberMasked: `XXXX${String(accountNumber).slice(-4)}` } : {}) };
  }
  return out;
}

class VendorService {
  async list(societyId: string, query: Record<string, any>) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.status) filter.status = query.status;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { code: rx }, { contactName: rx }, { phone: rx }, { tags: rx }];
    return paginate(Vendor as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'name', allowedSorts: ['name', 'createdAt', 'status', 'rating'] });
  }

  async options(societyId: string) {
    return (await Vendor.find({ societyId, deletedAt: null, status: { $in: ['ACTIVE'] } }).select('name code categoryKey paymentTermsDays').sort({ name: 1 }).lean()).map((v) => ({ id: String(v._id), name: v.name, code: v.code, categoryKey: v.categoryKey, paymentTermsDays: v.paymentTermsDays }));
  }

  async get(societyId: string, id: string) {
    const vendor = await Vendor.findOne({ _id: id, societyId, deletedAt: null }).lean();
    if (!vendor) throw Errors.notFound('Vendor');
    const sid = new mongoose.Types.ObjectId(societyId);
    const [totals, recent] = await Promise.all([
      Expense.aggregate([{ $match: { societyId: sid, vendorId: vendor._id, approvalStatus: 'APPROVED' } }, { $group: { _id: null, billed: { $sum: '$total' }, paid: { $sum: '$paidAmount' }, count: { $sum: 1 } } }]),
      Expense.find({ societyId, vendorId: vendor._id }).sort({ createdAt: -1 }).limit(10).select('expenseNumber title total paidAmount approvalStatus paymentStatus billDate dueDate').lean(),
    ]);
    const t = totals[0] ?? { billed: 0, paid: 0, count: 0 };
    return { ...vendor, id: String(vendor._id), workflow: vendor.workflowInstanceId ? await workflowService.instanceFor(societyId, 'Vendor', vendor._id) : null, stats: { billed: round2(t.billed), paid: round2(t.paid), outstanding: round2(t.billed - t.paid), expenses: t.count }, recentExpenses: recent.map((e) => ({ ...e, id: String(e._id) })) };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const data = normalise(input);
    if (data.code && (await Vendor.exists({ societyId, code: data.code, deletedAt: null }))) throw Errors.conflict('Vendor code already exists');
    const vendor = await Vendor.create({ ...data, societyId, createdBy: byUserId, status: 'ACTIVE' });
    const wf = await workflowService.start({ societyId, key: 'vendor_approval', entityType: 'Vendor', entityId: vendor._id, context: { categoryKey: vendor.categoryKey, name: vendor.name }, startedBy: byUserId });
    if (wf.instance) {
      vendor.status = 'PENDING_APPROVAL';
      vendor.workflowInstanceId = wf.instance._id;
      await vendor.save();
    }
    auditService.record({ action: 'vendor.created', resource: 'Vendor', resourceId: vendor._id, societyId, newValue: { name: vendor.name, category: vendor.categoryKey, status: vendor.status }, req });
    return vendor.toJSON();
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const vendor = await Vendor.findOne({ _id: id, societyId, deletedAt: null });
    if (!vendor) throw Errors.notFound('Vendor');
    const data = normalise(patch);
    if (data.code && data.code !== vendor.code && (await Vendor.exists({ societyId, code: data.code, deletedAt: null }))) throw Errors.conflict('Vendor code already exists');
    vendor.set(data);
    await vendor.save();
    auditService.record({ action: 'vendor.updated', resource: 'Vendor', resourceId: vendor._id, societyId, newValue: { ...patch, bank: patch.bank ? { ...patch.bank, accountNumber: maskString(patch.bank.accountNumber, 4) } : undefined }, req });
    return vendor.toJSON();
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any): Promise<void> {
    const vendor = await Vendor.findOne({ _id: id, societyId, deletedAt: null });
    if (!vendor) throw Errors.notFound('Vendor');
    const open = await Expense.countDocuments({ societyId, vendorId: vendor._id, paymentStatus: { $ne: 'PAID' }, approvalStatus: { $ne: 'REJECTED' } });
    if (open) throw Errors.conflict(`${open} unpaid expense(s) reference this vendor. Mark it inactive instead.`);
    vendor.deletedAt = new Date() as any;
    vendor.deletedBy = byUserId as any;
    vendor.status = 'INACTIVE';
    await vendor.save();
    auditService.record({ action: 'vendor.deleted', resource: 'Vendor', resourceId: vendor._id, societyId, req });
  }

  /** Called by the workflow event handler when a vendor approval completes. */
  async applyApproval(societyId: string, vendorId: any, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    await Vendor.updateOne({ _id: vendorId, societyId }, { $set: { status: status === 'APPROVED' ? 'ACTIVE' : 'INACTIVE' } });
  }

  async exportRows(societyId: string) {
    const vendors = await Vendor.find({ societyId, deletedAt: null }).sort({ name: 1 }).lean();
    return vendors.map((v) => ({ name: v.name, code: v.code ?? '', category: v.categoryKey ?? '', contact: v.contactName ?? '', phone: v.phone ?? '', email: v.email ?? '', gstin: v.gstin ?? '', pan: v.pan ?? '', paymentTermsDays: v.paymentTermsDays, status: v.status, rating: v.rating ?? '' }));
  }
}

export const vendorService = new VendorService();
