import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Invoice } from '../../models/invoice.model';
import { Payment } from '../../models/payment.model';
import { Expense } from '../../models/expense.model';
import { Unit } from '../../models/unit.model';
import { Building } from '../../models/building.model';
import { Complaint } from '../../models/complaint.model';
import { Visitor } from '../../models/visitor.model';
import { AmenityBooking } from '../../models/amenity-booking.model';
import { Attendance, Staff } from '../../models/staff.model';
import { Incident } from '../../models/incident.model';
import { Contract } from '../../models/contract.model';
import { Asset } from '../../models/asset.model';
import { StockTransaction, InventoryItem } from '../../models/inventory.model';
import { DomesticHelpLog } from '../../models/domestic-help.model';
import { accountingService } from '../accounting/accounting.service';

export type ReportParamKind = 'period' | 'month' | 'asOf' | 'months';
export interface ReportParams { from: Date; to: Date; month: string; asOf: Date; months: number }
export interface ReportColumn { key: string; label: string; type?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'hours' }
export interface ReportResult { rows: Record<string, unknown>[]; summary?: Record<string, unknown>; totals?: Record<string, unknown> }
export interface ReportDefinition {
  key: string;
  name: string;
  description: string;
  group: 'FINANCE' | 'OPERATIONS' | 'SECURITY' | 'COMMUNITY';
  /** module that must be accessible for the society (and hence in the plan) */
  module: string;
  /** extra permission on top of reports:view, when the data is sensitive */
  permission?: string;
  params: ReportParamKind[];
  columns: ReportColumn[];
  chart?: { type: 'bar' | 'line' | 'hbar'; xKey: string; series: { key: string; label: string }[]; stacked?: boolean; currency?: boolean };
  run: (societyId: string, params: ReportParams) => Promise<ReportResult>;
}

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const round2 = (n: number) => Math.round((n ?? 0) * 100) / 100;
const hours = (ms: number) => round2(ms / 3_600_000);
const monthKeys = (from: Date, to: Date) => { const out: string[] = []; let m = dayjs(from).startOf('month'); while (m.isBefore(to) || m.isSame(to, 'month')) { out.push(m.format('YYYY-MM')); m = m.add(1, 'month'); } return out; };
const LIVE_INVOICE = { $nin: ['DRAFT', 'CANCELLED', 'VOID'] };

export const REPORTS: ReportDefinition[] = [
  // ------------------------------------------------------------------ finance
  {
    key: 'collections-monthly', name: 'Billing vs collections', description: 'Amount invoiced and amount collected each month.', group: 'FINANCE', module: 'billing', permission: 'billing:view', params: ['period'],
    columns: [{ key: 'month', label: 'Month' }, { key: 'invoiced', label: 'Invoiced', type: 'currency' }, { key: 'collected', label: 'Collected', type: 'currency' }, { key: 'invoices', label: 'Invoices', type: 'number' }, { key: 'payments', label: 'Payments', type: 'number' }, { key: 'collectionRate', label: 'Collection %', type: 'percent' }],
    chart: { type: 'bar', xKey: 'month', series: [{ key: 'invoiced', label: 'Invoiced' }, { key: 'collected', label: 'Collected' }], currency: true },
    async run(societyId, { from, to }) {
      const sid = oid(societyId);
      const [inv, pay] = await Promise.all([
        Invoice.aggregate([{ $match: { societyId: sid, status: LIVE_INVOICE, issueDate: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$issueDate' } }, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
        Payment.aggregate([{ $match: { societyId: sid, status: 'SUCCESS', receivedAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$receivedAt' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      ]);
      const rows = monthKeys(from, to).map((month) => { const i = inv.find((x) => x._id === month); const p = pay.find((x) => x._id === month); const invoiced = round2(i?.total ?? 0); const collected = round2(p?.total ?? 0); return { month, invoiced, collected, invoices: i?.count ?? 0, payments: p?.count ?? 0, collectionRate: invoiced ? round2((collected / invoiced) * 100) : null }; });
      const invoiced = round2(rows.reduce((s, r) => s + r.invoiced, 0));
      const collected = round2(rows.reduce((s, r) => s + r.collected, 0));
      return { rows, totals: { invoiced, collected, invoices: rows.reduce((s, r) => s + r.invoices, 0), payments: rows.reduce((s, r) => s + r.payments, 0), collectionRate: invoiced ? round2((collected / invoiced) * 100) : null }, summary: { invoiced, collected, outstanding: round2(invoiced - collected) } };
    },
  },
  {
    key: 'dues-by-building', name: 'Outstanding dues by building', description: 'Unpaid invoice balances grouped by tower / wing, with the overdue share.', group: 'FINANCE', module: 'billing', permission: 'billing:view', params: ['asOf'],
    columns: [{ key: 'building', label: 'Building' }, { key: 'units', label: 'Units with dues', type: 'number' }, { key: 'outstanding', label: 'Outstanding', type: 'currency' }, { key: 'overdue', label: 'Overdue', type: 'currency' }, { key: 'overdueShare', label: 'Overdue %', type: 'percent' }],
    chart: { type: 'hbar', xKey: 'building', series: [{ key: 'outstanding', label: 'Outstanding' }], currency: true },
    async run(societyId, { asOf }) {
      const sid = oid(societyId);
      const agg = await Invoice.aggregate([
        { $match: { societyId: sid, status: LIVE_INVOICE, balanceDue: { $gt: 0 }, issueDate: { $lte: asOf } } },
        { $lookup: { from: 'units', localField: 'unitId', foreignField: '_id', as: 'unit' } }, { $unwind: '$unit' },
        { $group: { _id: '$unit.buildingId', outstanding: { $sum: '$balanceDue' }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', asOf] }, '$balanceDue', 0] } }, units: { $addToSet: '$unitId' } } },
      ]);
      const buildings = await Building.find({ societyId }).select('name').lean();
      const rows = agg.map((r) => ({ buildingId: r._id ? String(r._id) : null, building: buildings.find((b) => String(b._id) === String(r._id))?.name ?? 'Unassigned', units: r.units.length, outstanding: round2(r.outstanding), overdue: round2(r.overdue), overdueShare: r.outstanding ? round2((r.overdue / r.outstanding) * 100) : 0 })).sort((a, b) => b.outstanding - a.outstanding);
      const outstanding = round2(rows.reduce((s, r) => s + r.outstanding, 0));
      const overdue = round2(rows.reduce((s, r) => s + r.overdue, 0));
      return { rows, totals: { units: rows.reduce((s, r) => s + r.units, 0), outstanding, overdue, overdueShare: outstanding ? round2((overdue / outstanding) * 100) : 0 }, summary: { outstanding, overdue } };
    },
  },
  {
    key: 'expense-by-category', name: 'Expenses by category', description: 'Approved expenses in the period, grouped by category.', group: 'FINANCE', module: 'expenses', permission: 'expenses:view', params: ['period'],
    columns: [{ key: 'category', label: 'Category' }, { key: 'count', label: 'Bills', type: 'number' }, { key: 'total', label: 'Amount', type: 'currency' }, { key: 'paid', label: 'Paid', type: 'currency' }, { key: 'share', label: 'Share %', type: 'percent' }],
    chart: { type: 'hbar', xKey: 'category', series: [{ key: 'total', label: 'Amount' }], currency: true },
    async run(societyId, { from, to }) {
      const agg = await Expense.aggregate([{ $match: { societyId: oid(societyId), deletedAt: null, approvalStatus: 'APPROVED', billDate: { $gte: from, $lte: to } } }, { $group: { _id: { $ifNull: ['$categoryKey', 'UNCATEGORISED'] }, count: { $sum: 1 }, total: { $sum: '$total' }, paid: { $sum: '$paidAmount' } } }, { $sort: { total: -1 } }]);
      const grand = round2(agg.reduce((s, r) => s + r.total, 0));
      const rows = agg.map((r) => ({ category: r._id, count: r.count, total: round2(r.total), paid: round2(r.paid), share: grand ? round2((r.total / grand) * 100) : 0 }));
      return { rows, totals: { count: rows.reduce((s, r) => s + r.count, 0), total: grand, paid: round2(rows.reduce((s, r) => s + r.paid, 0)), share: 100 }, summary: { total: grand } };
    },
  },
  {
    key: 'vendor-spend', name: 'Vendor spend', description: 'Approved bills per vendor with the unpaid balance.', group: 'FINANCE', module: 'expenses', permission: 'expenses:view', params: ['period'],
    columns: [{ key: 'vendor', label: 'Vendor' }, { key: 'count', label: 'Bills', type: 'number' }, { key: 'total', label: 'Billed', type: 'currency' }, { key: 'paid', label: 'Paid', type: 'currency' }, { key: 'unpaid', label: 'Unpaid', type: 'currency' }],
    chart: { type: 'hbar', xKey: 'vendor', series: [{ key: 'total', label: 'Billed' }], currency: true },
    async run(societyId, { from, to }) {
      const agg = await Expense.aggregate([{ $match: { societyId: oid(societyId), deletedAt: null, approvalStatus: 'APPROVED', billDate: { $gte: from, $lte: to } } }, { $group: { _id: { $ifNull: ['$vendorName', 'No vendor'] }, count: { $sum: 1 }, total: { $sum: '$total' }, paid: { $sum: '$paidAmount' } } }, { $sort: { total: -1 } }, { $limit: 50 }]);
      const rows = agg.map((r) => ({ vendor: r._id, count: r.count, total: round2(r.total), paid: round2(r.paid), unpaid: round2(r.total - r.paid) }));
      return { rows, totals: { count: rows.reduce((s, r) => s + r.count, 0), total: round2(rows.reduce((s, r) => s + r.total, 0)), paid: round2(rows.reduce((s, r) => s + r.paid, 0)), unpaid: round2(rows.reduce((s, r) => s + r.unpaid, 0)) } };
    },
  },
  {
    key: 'income-expense-trend', name: 'Income vs expense trend', description: 'Posted income and expense per month from the ledger.', group: 'FINANCE', module: 'accounting', permission: 'accounting:view', params: ['months'],
    columns: [{ key: 'month', label: 'Month' }, { key: 'income', label: 'Income', type: 'currency' }, { key: 'expense', label: 'Expense', type: 'currency' }, { key: 'surplus', label: 'Surplus', type: 'currency' }],
    chart: { type: 'bar', xKey: 'month', series: [{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' }], currency: true },
    async run(societyId, { months }) {
      const trend: any[] = await accountingService.trend(societyId, months);
      const rows = trend.map((t) => ({ ...t, surplus: round2(t.income - t.expense) }));
      return { rows, totals: { income: round2(rows.reduce((s, r) => s + r.income, 0)), expense: round2(rows.reduce((s, r) => s + r.expense, 0)), surplus: round2(rows.reduce((s, r) => s + r.surplus, 0)) } };
    },
  },
  {
    key: 'amenity-utilisation', name: 'Amenity utilisation', description: 'Bookings, booked hours and revenue per amenity.', group: 'COMMUNITY', module: 'amenities', permission: 'amenities:view_bookings', params: ['period'],
    columns: [{ key: 'amenity', label: 'Amenity' }, { key: 'bookings', label: 'Bookings', type: 'number' }, { key: 'hours', label: 'Hours', type: 'hours' }, { key: 'revenue', label: 'Revenue', type: 'currency' }, { key: 'cancelled', label: 'Cancelled', type: 'number' }],
    chart: { type: 'hbar', xKey: 'amenity', series: [{ key: 'bookings', label: 'Bookings' }] },
    async run(societyId, { from, to }) {
      const agg = await AmenityBooking.aggregate([
        { $match: { societyId: oid(societyId), startAt: { $gte: from, $lte: to } } },
        { $lookup: { from: 'amenities', localField: 'amenityId', foreignField: '_id', as: 'amenity' } }, { $unwind: { path: '$amenity', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$amenityId', amenity: { $first: '$amenity.name' }, bookings: { $sum: { $cond: [{ $in: ['$status', ['CONFIRMED', 'COMPLETED']] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $in: ['$status', ['CANCELLED', 'REJECTED', 'EXPIRED']] }, 1, 0] } }, ms: { $sum: { $cond: [{ $in: ['$status', ['CONFIRMED', 'COMPLETED']] }, { $subtract: ['$endAt', '$startAt'] }, 0] } }, revenue: { $sum: { $cond: [{ $and: [{ $in: ['$status', ['CONFIRMED', 'COMPLETED']] }, { $eq: ['$paymentStatus', 'PAID'] }] }, '$amount', 0] } } } },
        { $sort: { bookings: -1 } },
      ]);
      const rows = agg.map((r) => ({ amenity: r.amenity ?? 'Unknown', bookings: r.bookings, hours: hours(r.ms), revenue: round2(r.revenue), cancelled: r.cancelled }));
      return { rows, totals: { bookings: rows.reduce((s, r) => s + r.bookings, 0), hours: round2(rows.reduce((s, r) => s + r.hours, 0)), revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)), cancelled: rows.reduce((s, r) => s + r.cancelled, 0) } };
    },
  },
  // ------------------------------------------------------------------ operations
  {
    key: 'complaints-sla', name: 'Complaints & SLA', description: 'Tickets raised per category with resolution time, SLA breaches and ratings.', group: 'OPERATIONS', module: 'complaints', permission: 'complaints:view', params: ['period'],
    columns: [{ key: 'category', label: 'Category' }, { key: 'raised', label: 'Raised', type: 'number' }, { key: 'resolved', label: 'Resolved', type: 'number' }, { key: 'open', label: 'Still open', type: 'number' }, { key: 'avgResolutionHours', label: 'Avg. resolution', type: 'hours' }, { key: 'breached', label: 'SLA breached', type: 'number' }, { key: 'avgRating', label: 'Rating', type: 'number' }],
    chart: { type: 'hbar', xKey: 'category', series: [{ key: 'raised', label: 'Raised' }] },
    async run(societyId, { from, to }) {
      const agg = await Complaint.aggregate([
        { $match: { societyId: oid(societyId), createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$categoryKey', raised: { $sum: 1 }, resolved: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$resolvedAt', null] }, null] }, 1, 0] } }, resMs: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$resolvedAt', null] }, null] }, { $subtract: ['$resolvedAt', '$createdAt'] }, 0] } }, breached: { $sum: { $cond: [{ $or: [{ $eq: ['$sla.responseBreached', true] }, { $and: [{ $ne: [{ $ifNull: ['$resolvedAt', null] }, null] }, { $ne: [{ $ifNull: ['$sla.resolutionDueAt', null] }, null] }, { $gt: ['$resolvedAt', '$sla.resolutionDueAt'] }] }, { $and: [{ $eq: [{ $ifNull: ['$resolvedAt', null] }, null] }, { $ne: [{ $ifNull: ['$sla.resolutionDueAt', null] }, null] }, { $lt: ['$sla.resolutionDueAt', new Date()] }] }] }, 1, 0] } }, ratingSum: { $sum: { $ifNull: ['$rating.score', 0] } }, ratingCount: { $sum: { $cond: [{ $gt: ['$rating.score', 0] }, 1, 0] } } } },
        { $sort: { raised: -1 } },
      ]);
      const rows = agg.map((r) => ({ category: r._id, raised: r.raised, resolved: r.resolved, open: r.raised - r.resolved, avgResolutionHours: r.resolved ? hours(r.resMs / r.resolved) : null, breached: r.breached, avgRating: r.ratingCount ? round2(r.ratingSum / r.ratingCount) : null }));
      const resolved = rows.reduce((s, r) => s + r.resolved, 0);
      return { rows, totals: { raised: rows.reduce((s, r) => s + r.raised, 0), resolved, open: rows.reduce((s, r) => s + r.open, 0), breached: rows.reduce((s, r) => s + r.breached, 0), avgResolutionHours: resolved ? round2(rows.reduce((s, r) => s + (r.avgResolutionHours ?? 0) * r.resolved, 0) / resolved) : null } };
    },
  },
  {
    key: 'visitors-daily', name: 'Visitor traffic', description: 'Visitors checked in per day, split by pre-approved and walk-in.', group: 'SECURITY', module: 'visitors', permission: 'visitors:view', params: ['period'],
    columns: [{ key: 'day', label: 'Day', type: 'date' }, { key: 'visitors', label: 'Visitors', type: 'number' }, { key: 'preApproved', label: 'Pre-approved', type: 'number' }, { key: 'walkIn', label: 'Walk-in', type: 'number' }, { key: 'guests', label: 'People', type: 'number' }],
    chart: { type: 'line', xKey: 'day', series: [{ key: 'preApproved', label: 'Pre-approved' }, { key: 'walkIn', label: 'Walk-in' }] },
    async run(societyId, { from, to }) {
      const agg = await Visitor.aggregate([{ $match: { societyId: oid(societyId), checkInAt: { $gte: from, $lte: to } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInAt' } }, visitors: { $sum: 1 }, walkIn: { $sum: { $cond: [{ $eq: ['$entryType', 'WALK_IN'] }, 1, 0] } }, guests: { $sum: { $ifNull: ['$guestCount', 1] } } } }, { $sort: { _id: 1 } }]);
      const rows = agg.map((r) => ({ day: r._id, visitors: r.visitors, preApproved: r.visitors - r.walkIn, walkIn: r.walkIn, guests: r.guests }));
      return { rows, totals: { visitors: rows.reduce((s, r) => s + r.visitors, 0), preApproved: rows.reduce((s, r) => s + r.preApproved, 0), walkIn: rows.reduce((s, r) => s + r.walkIn, 0), guests: rows.reduce((s, r) => s + r.guests, 0) } };
    },
  },
  {
    key: 'visitors-by-category', name: 'Visitors by category', description: 'Who comes in: guests, deliveries, service providers… with average time inside.', group: 'SECURITY', module: 'visitors', permission: 'visitors:view', params: ['period'],
    columns: [{ key: 'category', label: 'Category' }, { key: 'visitors', label: 'Visitors', type: 'number' }, { key: 'avgMinutes', label: 'Avg. minutes inside', type: 'number' }, { key: 'denied', label: 'Denied', type: 'number' }],
    chart: { type: 'hbar', xKey: 'category', series: [{ key: 'visitors', label: 'Visitors' }] },
    async run(societyId, { from, to }) {
      const agg = await Visitor.aggregate([{ $match: { societyId: oid(societyId), createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$categoryKey', visitors: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$checkInAt', null] }, null] }, 1, 0] } }, denied: { $sum: { $cond: [{ $eq: ['$status', 'DENIED'] }, 1, 0] } }, ms: { $sum: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$checkInAt', null] }, null] }, { $ne: [{ $ifNull: ['$checkOutAt', null] }, null] }] }, { $subtract: ['$checkOutAt', '$checkInAt'] }, 0] } }, withOut: { $sum: { $cond: [{ $and: [{ $ne: [{ $ifNull: ['$checkInAt', null] }, null] }, { $ne: [{ $ifNull: ['$checkOutAt', null] }, null] }] }, 1, 0] } } } }, { $sort: { visitors: -1 } }]);
      const rows = agg.map((r) => ({ category: r._id, visitors: r.visitors, avgMinutes: r.withOut ? Math.round(r.ms / r.withOut / 60_000) : null, denied: r.denied }));
      return { rows, totals: { visitors: rows.reduce((s, r) => s + r.visitors, 0), denied: rows.reduce((s, r) => s + r.denied, 0) } };
    },
  },
  {
    key: 'staff-attendance', name: 'Staff attendance', description: 'Days present, absent and on leave per staff member for a month, with late marks and overtime.', group: 'OPERATIONS', module: 'staff', permission: 'staff:view', params: ['month'],
    columns: [{ key: 'staff', label: 'Staff' }, { key: 'category', label: 'Category' }, { key: 'present', label: 'Present', type: 'number' }, { key: 'halfDay', label: 'Half days', type: 'number' }, { key: 'absent', label: 'Absent', type: 'number' }, { key: 'leave', label: 'Leave', type: 'number' }, { key: 'late', label: 'Late', type: 'number' }, { key: 'overtimeHours', label: 'Overtime', type: 'hours' }],
    chart: { type: 'hbar', xKey: 'staff', series: [{ key: 'present', label: 'Present' }] },
    async run(societyId, { month }) {
      const staff = await Staff.find({ societyId, deletedAt: null }).select('name categoryKey').sort({ name: 1 }).lean();
      const agg = await Attendance.aggregate([{ $match: { societyId: oid(societyId), date: { $regex: `^${month}` } } }, { $group: { _id: '$staffId', present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } }, halfDay: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } }, leave: { $sum: { $cond: [{ $eq: ['$status', 'LEAVE'] }, 1, 0] } }, late: { $sum: { $cond: ['$late', 1, 0] } }, overtime: { $sum: { $ifNull: ['$overtimeMinutes', 0] } } } }]);
      const rows = staff.map((s) => { const a = agg.find((x) => String(x._id) === String(s._id)); return { staff: s.name, category: s.categoryKey, present: a?.present ?? 0, halfDay: a?.halfDay ?? 0, absent: a?.absent ?? 0, leave: a?.leave ?? 0, late: a?.late ?? 0, overtimeHours: round2((a?.overtime ?? 0) / 60) }; });
      return { rows, totals: { present: rows.reduce((s, r) => s + r.present, 0), halfDay: rows.reduce((s, r) => s + r.halfDay, 0), absent: rows.reduce((s, r) => s + r.absent, 0), leave: rows.reduce((s, r) => s + r.leave, 0), late: rows.reduce((s, r) => s + r.late, 0), overtimeHours: round2(rows.reduce((s, r) => s + r.overtimeHours, 0)) } };
    },
  },
  {
    key: 'occupancy', name: 'Occupancy', description: 'Units per building by occupancy status.', group: 'COMMUNITY', module: 'units', permission: 'units:view', params: [],
    columns: [{ key: 'building', label: 'Building' }, { key: 'units', label: 'Units', type: 'number' }, { key: 'ownerOccupied', label: 'Owner occupied', type: 'number' }, { key: 'tenantOccupied', label: 'Tenant occupied', type: 'number' }, { key: 'vacant', label: 'Vacant', type: 'number' }, { key: 'locked', label: 'Locked', type: 'number' }, { key: 'occupiedPercent', label: 'Occupied %', type: 'percent' }],
    chart: { type: 'bar', xKey: 'building', series: [{ key: 'ownerOccupied', label: 'Owner occupied' }, { key: 'tenantOccupied', label: 'Tenant occupied' }, { key: 'vacant', label: 'Vacant' }], stacked: true },
    async run(societyId) {
      const agg = await Unit.aggregate([{ $match: { societyId: oid(societyId), deletedAt: null, status: 'ACTIVE' } }, { $group: { _id: '$buildingId', units: { $sum: 1 }, ownerOccupied: { $sum: { $cond: [{ $eq: ['$occupancyStatus', 'OWNER_OCCUPIED'] }, 1, 0] } }, tenantOccupied: { $sum: { $cond: [{ $eq: ['$occupancyStatus', 'TENANT_OCCUPIED'] }, 1, 0] } }, vacant: { $sum: { $cond: [{ $eq: ['$occupancyStatus', 'VACANT'] }, 1, 0] } }, locked: { $sum: { $cond: [{ $eq: ['$occupancyStatus', 'LOCKED'] }, 1, 0] } } } }]);
      const buildings = await Building.find({ societyId }).select('name').lean();
      const rows = agg.map((r) => ({ building: buildings.find((b) => String(b._id) === String(r._id))?.name ?? 'Unassigned', units: r.units, ownerOccupied: r.ownerOccupied, tenantOccupied: r.tenantOccupied, vacant: r.vacant, locked: r.locked, occupiedPercent: r.units ? round2(((r.ownerOccupied + r.tenantOccupied) / r.units) * 100) : 0 })).sort((a, b) => a.building.localeCompare(b.building));
      const units = rows.reduce((s, r) => s + r.units, 0);
      const occupied = rows.reduce((s, r) => s + r.ownerOccupied + r.tenantOccupied, 0);
      return { rows, totals: { units, ownerOccupied: rows.reduce((s, r) => s + r.ownerOccupied, 0), tenantOccupied: rows.reduce((s, r) => s + r.tenantOccupied, 0), vacant: rows.reduce((s, r) => s + r.vacant, 0), locked: rows.reduce((s, r) => s + r.locked, 0), occupiedPercent: units ? round2((occupied / units) * 100) : 0 } };
    },
  },
  {
    key: 'incidents-summary', name: 'Security incidents', description: 'Incidents by type with severity split and resolution time.', group: 'SECURITY', module: 'security', permission: 'security:view', params: ['period'],
    columns: [{ key: 'type', label: 'Type' }, { key: 'count', label: 'Incidents', type: 'number' }, { key: 'critical', label: 'High / critical', type: 'number' }, { key: 'resolved', label: 'Resolved', type: 'number' }, { key: 'avgResolutionHours', label: 'Avg. resolution', type: 'hours' }, { key: 'police', label: 'Police cases', type: 'number' }],
    chart: { type: 'hbar', xKey: 'type', series: [{ key: 'count', label: 'Incidents' }] },
    async run(societyId, { from, to }) {
      const agg = await Incident.aggregate([{ $match: { societyId: oid(societyId), deletedAt: null, occurredAt: { $gte: from, $lte: to } } }, { $group: { _id: '$typeKey', count: { $sum: 1 }, critical: { $sum: { $cond: [{ $in: ['$severity', ['HIGH', 'CRITICAL']] }, 1, 0] } }, resolved: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$resolution.resolvedAt', null] }, null] }, 1, 0] } }, resMs: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$resolution.resolvedAt', null] }, null] }, { $subtract: ['$resolution.resolvedAt', '$createdAt'] }, 0] } }, police: { $sum: { $cond: ['$police.reported', 1, 0] } } } }, { $sort: { count: -1 } }]);
      const rows = agg.map((r) => ({ type: r._id, count: r.count, critical: r.critical, resolved: r.resolved, avgResolutionHours: r.resolved ? hours(r.resMs / r.resolved) : null, police: r.police }));
      return { rows, totals: { count: rows.reduce((s, r) => s + r.count, 0), critical: rows.reduce((s, r) => s + r.critical, 0), resolved: rows.reduce((s, r) => s + r.resolved, 0), police: rows.reduce((s, r) => s + r.police, 0) } };
    },
  },
  {
    key: 'contracts-expiry', name: 'Contract expiry calendar', description: 'Active contracts ending in the coming months.', group: 'OPERATIONS', module: 'contracts', permission: 'contracts:view', params: ['months'],
    columns: [{ key: 'contract', label: 'Contract' }, { key: 'vendor', label: 'Vendor' }, { key: 'type', label: 'Type' }, { key: 'endDate', label: 'Ends', type: 'date' }, { key: 'daysRemaining', label: 'Days left', type: 'number' }, { key: 'value', label: 'Value', type: 'currency' }, { key: 'autoRenew', label: 'Auto-renew' }],
    async run(societyId, { months }) {
      const now = new Date();
      const rows = (await Contract.find({ societyId, deletedAt: null, status: 'ACTIVE', endDate: { $lte: dayjs(now).add(months, 'month').toDate() } }).sort({ endDate: 1 }).select('contractNumber title vendorName type endDate value autoRenew').lean()).map((c) => ({ contractId: String(c._id), contract: `${c.title} (${c.contractNumber})`, vendor: c.vendorName ?? '', type: c.type, endDate: dayjs(c.endDate).format('YYYY-MM-DD'), daysRemaining: Math.ceil((c.endDate.getTime() - now.getTime()) / 86_400_000), value: round2(c.value ?? 0), autoRenew: c.autoRenew ? 'yes' : 'no' }));
      return { rows, totals: { value: round2(rows.reduce((s, r) => s + r.value, 0)) }, summary: { contracts: rows.length } };
    },
  },
  {
    key: 'asset-maintenance', name: 'Asset maintenance', description: 'Maintenance events, cost and downtime per asset in the period.', group: 'OPERATIONS', module: 'assets', permission: 'assets:view', params: ['period'],
    columns: [{ key: 'asset', label: 'Asset' }, { key: 'category', label: 'Category' }, { key: 'events', label: 'Events', type: 'number' }, { key: 'breakdowns', label: 'Breakdowns', type: 'number' }, { key: 'cost', label: 'Cost', type: 'currency' }, { key: 'downtimeHours', label: 'Downtime', type: 'hours' }],
    chart: { type: 'hbar', xKey: 'asset', series: [{ key: 'cost', label: 'Cost' }], currency: true },
    async run(societyId, { from, to }) {
      const agg = await Asset.aggregate([{ $match: { societyId: oid(societyId), deletedAt: null } }, { $unwind: '$maintenanceLog' }, { $match: { 'maintenanceLog.at': { $gte: from, $lte: to } } }, { $group: { _id: '$_id', asset: { $first: '$name' }, code: { $first: '$assetCode' }, category: { $first: '$categoryKey' }, events: { $sum: 1 }, breakdowns: { $sum: { $cond: [{ $eq: ['$maintenanceLog.type', 'BREAKDOWN'] }, 1, 0] } }, cost: { $sum: { $ifNull: ['$maintenanceLog.cost', 0] } }, downtime: { $sum: { $ifNull: ['$maintenanceLog.downtimeHours', 0] } } } }, { $sort: { cost: -1 } }]);
      const rows = agg.map((r) => ({ assetId: String(r._id), asset: `${r.asset} (${r.code})`, category: r.category, events: r.events, breakdowns: r.breakdowns, cost: round2(r.cost), downtimeHours: round2(r.downtime) }));
      return { rows, totals: { events: rows.reduce((s, r) => s + r.events, 0), breakdowns: rows.reduce((s, r) => s + r.breakdowns, 0), cost: round2(rows.reduce((s, r) => s + r.cost, 0)), downtimeHours: round2(rows.reduce((s, r) => s + r.downtimeHours, 0)) } };
    },
  },
  {
    key: 'inventory-consumption', name: 'Inventory consumption', description: 'Stock issued and received per item, with the value consumed.', group: 'OPERATIONS', module: 'inventory', permission: 'inventory:view', params: ['period'],
    columns: [{ key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'issued', label: 'Issued', type: 'number' }, { key: 'received', label: 'Received', type: 'number' }, { key: 'issuedValue', label: 'Value consumed', type: 'currency' }, { key: 'currentStock', label: 'In stock now', type: 'number' }],
    chart: { type: 'hbar', xKey: 'item', series: [{ key: 'issuedValue', label: 'Value consumed' }], currency: true },
    async run(societyId, { from, to }) {
      const agg = await StockTransaction.aggregate([{ $match: { societyId: oid(societyId), at: { $gte: from, $lte: to } } }, { $group: { _id: '$itemId', issued: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, { $abs: '$quantity' }, 0] } }, received: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } }, issuedValue: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, { $multiply: [{ $abs: '$quantity' }, '$unitCost'] }, 0] } } } }]);
      const items = await InventoryItem.find({ _id: { $in: agg.map((a) => a._id) } }).select('name sku unit currentStock').lean();
      const rows = agg.map((r) => { const it = items.find((i) => String(i._id) === String(r._id)); return { itemId: String(r._id), item: it ? `${it.name} (${it.sku})` : 'Deleted item', unit: it?.unit ?? '', issued: round2(r.issued), received: round2(r.received), issuedValue: round2(r.issuedValue), currentStock: it?.currentStock ?? 0 }; }).sort((a, b) => b.issuedValue - a.issuedValue);
      return { rows, totals: { issued: round2(rows.reduce((s, r) => s + r.issued, 0)), received: round2(rows.reduce((s, r) => s + r.received, 0)), issuedValue: round2(rows.reduce((s, r) => s + r.issuedValue, 0)) } };
    },
  },
  {
    key: 'domestic-help-entries', name: 'Domestic help entries', description: 'Gate entries per helper type and the number of helpers active in the period.', group: 'SECURITY', module: 'domestic_help', permission: 'domestic_help:view', params: ['period'],
    columns: [{ key: 'type', label: 'Type' }, { key: 'entries', label: 'Entries', type: 'number' }, { key: 'helpers', label: 'Helpers', type: 'number' }, { key: 'avgPerDay', label: 'Avg. per day', type: 'number' }],
    chart: { type: 'hbar', xKey: 'type', series: [{ key: 'entries', label: 'Entries' }] },
    async run(societyId, { from, to }) {
      const days = Math.max(1, dayjs(to).diff(dayjs(from), 'day') + 1);
      const agg = await DomesticHelpLog.aggregate([{ $match: { societyId: oid(societyId), type: 'IN', at: { $gte: from, $lte: to } } }, { $lookup: { from: 'domestichelps', localField: 'helpId', foreignField: '_id', as: 'help' } }, { $unwind: '$help' }, { $group: { _id: '$help.typeKey', entries: { $sum: 1 }, helpers: { $addToSet: '$helpId' } } }, { $sort: { entries: -1 } }]);
      const rows = agg.map((r) => ({ type: r._id, entries: r.entries, helpers: r.helpers.length, avgPerDay: round2(r.entries / days) }));
      return { rows, totals: { entries: rows.reduce((s, r) => s + r.entries, 0), helpers: rows.reduce((s, r) => s + r.helpers, 0) } };
    },
  },
];

export const REPORTS_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

/** Strips the runner so the catalogue can be sent to the client. */
export function describeReport(r: ReportDefinition) {
  return { key: r.key, name: r.name, description: r.description, group: r.group, module: r.module, permission: r.permission ?? null, params: r.params, columns: r.columns, chart: r.chart ?? null };
}

/** Applies defaults per parameter kind so every report can run with no query string at all. */
export function resolveParams(def: ReportDefinition, query: Record<string, any>): ReportParams {
  const now = new Date();
  const to = query.to ? dayjs(query.to).endOf('day').toDate() : dayjs(now).endOf('day').toDate();
  const from = query.from ? dayjs(query.from).startOf('day').toDate() : dayjs(to).subtract(def.params.includes('period') && def.chart?.type === 'bar' ? 6 : 1, 'month').add(1, 'day').startOf('day').toDate();
  return { from, to, month: query.month ?? dayjs(now).format('YYYY-MM'), asOf: query.asOf ? dayjs(query.asOf).endOf('day').toDate() : now, months: Math.min(24, Math.max(1, Number(query.months) || 6)) };
}
