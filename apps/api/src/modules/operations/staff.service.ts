import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Staff, Attendance } from '../../models/staff.model';
import { Notification } from '../../models/notification.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { maskString } from '../../lib/crypto';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { limitService } from '../../core/limits/limit.service';
import { domainEvents } from '../../core/events/event-bus';

export interface Shift { key: string; name: string; startTime: string; endTime: string }
export interface StaffConfig { shiftGraceMinutes: number; overtimeAfterMinutes: number; defaultShiftKey: string; shifts: Shift[]; attendanceReminderHour: number }
export interface Actor { userId: string; canViewSensitive: boolean }
const dateKey = (d: Date | dayjs.Dayjs = new Date()) => dayjs(d).format('YYYY-MM-DD');
const STATUS_LETTER: Record<string, string> = { PRESENT: 'P', ABSENT: 'A', HALF_DAY: 'H', LEAVE: 'L', WEEK_OFF: 'W' };

class StaffService {
  getConfig(societyId: string): Promise<StaffConfig> { return configurationService.getSocietySetting<StaffConfig>(societyId, 'staff.config'); }

  async updateConfig(societyId: string, patch: Partial<StaffConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'staff.config', patch, byUserId);
    auditService.record({ action: 'staff.config_updated', resource: 'SocietySetting', resourceId: 'staff.config', societyId, newValue: patch, req });
    return merged;
  }

  async categories(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['STAFF_CATEGORY']);
    return categoryService.list(societyId, 'STAFF_CATEGORY');
  }

  private present(doc: any, actor: Actor) {
    const out: any = { ...doc, id: String(doc._id) };
    if (!actor.canViewSensitive) {
      out.salary = undefined;
      if (out.idProof?.number) out.idProof = { ...out.idProof, number: maskString(out.idProof.number, 2) };
      out.address = undefined;
    }
    return out;
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (query.status) filter.status = query.status;
    else if (!query.includeInactive) filter.status = { $in: ['ACTIVE', 'ON_LEAVE'] };
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    if (query.employmentType) filter.employmentType = query.employmentType;
    if (query.vendorId) filter.vendorId = query.vendorId;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { phone: rx }, { staffNumber: rx }, { designation: rx }];
    const page = await paginate(Staff as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'name', allowedSorts: ['name', 'staffNumber', 'categoryKey', 'joinedAt', 'status', 'createdAt'], populate: [{ path: 'vendorId', select: 'name' }] });
    const today = dateKey();
    const rows = await Attendance.find({ societyId, date: today, staffId: { $in: page.items.map((s: any) => s._id) } }).select('staffId status checkInAt checkOutAt late').lean();
    const byStaff = new Map(rows.map((r) => [String(r.staffId), r]));
    page.items = page.items.map((s: any) => ({ ...this.present(s, actor), today: byStaff.get(String(s._id)) ?? null }));
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc: any = await Staff.findOne({ _id: id, societyId, deletedAt: null }).populate('vendorId', 'name').lean();
    if (!doc) throw Errors.notFound('Staff member');
    const recent = await Attendance.find({ staffId: doc._id }).sort({ date: -1 }).limit(14).lean();
    return { ...this.present(doc, actor), recentAttendance: recent.map((r) => ({ ...r, id: String(r._id) })), monthSummary: await this.summary(societyId, String(doc._id), dayjs().format('YYYY-MM')) };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    await limitService.assertWithinLimit(societyId, 'maxStaff');
    const cats = await this.categories(societyId);
    if (!cats.some((c: any) => c.key === String(input.categoryKey).toUpperCase())) throw Errors.validation({ categoryKey: ['Unknown staff category'] });
    const cfg = await this.getConfig(societyId);
    const doc = await Staff.create({ ...input, email: input.email || undefined, societyId, staffNumber: await sequenceService.next(societyId, 'staff', { prefix: 'STF', padding: 4 }), categoryKey: String(input.categoryKey).toUpperCase(), shiftKey: String(input.shiftKey ?? cfg.defaultShiftKey).toUpperCase(), createdBy: byUserId });
    auditService.record({ action: 'staff.created', resource: 'Staff', resourceId: doc._id, societyId, newValue: { staffNumber: doc.staffNumber, name: doc.name, category: doc.categoryKey }, req });
    return this.get(societyId, String(doc._id), { userId: byUserId, canViewSensitive: true });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Staff.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Staff member');
    if (patch.categoryKey) doc.categoryKey = String(patch.categoryKey).toUpperCase();
    if (patch.shiftKey) doc.shiftKey = String(patch.shiftKey).toUpperCase();
    if (patch.email !== undefined) doc.email = patch.email || undefined;
    for (const key of ['name', 'phone', 'designation', 'employmentType', 'vendorId', 'weeklyOff', 'joinedAt', 'leftAt', 'salary', 'idProof', 'photoKey', 'documents', 'policeVerifiedAt', 'emergencyContact', 'address', 'notes', 'status'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.status === 'RESIGNED' && !doc.leftAt) doc.leftAt = new Date();
    await doc.save();
    auditService.record({ action: 'staff.updated', resource: 'Staff', resourceId: doc._id, societyId, newValue: Object.keys(patch).filter((k) => k !== 'salary' && k !== 'idProof'), req });
    return this.get(societyId, id, { userId: byUserId, canViewSensitive: true });
  }

  async remove(societyId: string, id: string, byUserId: string, req?: any): Promise<void> {
    const doc = await Staff.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Staff member');
    doc.deletedAt = new Date();
    doc.deletedBy = byUserId as any;
    doc.status = 'INACTIVE';
    await doc.save();
    auditService.record({ action: 'staff.deleted', resource: 'Staff', resourceId: doc._id, societyId, req });
  }

  // ------------------------------------------------------------------ attendance
  private shiftFor(cfg: StaffConfig, key: string): Shift | undefined {
    return (cfg.shifts ?? []).find((s) => s.key === key) ?? (cfg.shifts ?? []).find((s) => s.key === cfg.defaultShiftKey);
  }

  private compute(cfg: StaffConfig, staff: any, row: { checkInAt?: Date | null; checkOutAt?: Date | null; date: string }) {
    const shift = this.shiftFor(cfg, staff.shiftKey);
    let late = false;
    if (row.checkInAt && shift) {
      const [h, m] = shift.startTime.split(':').map(Number);
      const start = dayjs(row.date).hour(h).minute(m).second(0);
      late = dayjs(row.checkInAt).isAfter(start.add(cfg.shiftGraceMinutes ?? 0, 'minute'));
    }
    const minutesWorked = row.checkInAt && row.checkOutAt ? Math.max(0, dayjs(row.checkOutAt).diff(dayjs(row.checkInAt), 'minute')) : 0;
    const overtimeMinutes = minutesWorked > (cfg.overtimeAfterMinutes ?? 540) ? minutesWorked - (cfg.overtimeAfterMinutes ?? 540) : 0;
    return { late, minutesWorked, overtimeMinutes };
  }

  async markAttendance(societyId: string, input: { date: string; entries: { staffId: string; status: string; checkInAt?: Date | null; checkOutAt?: Date | null; note?: string }[] }, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    const staff = await Staff.find({ _id: { $in: input.entries.map((e) => e.staffId) }, societyId, deletedAt: null }).select('shiftKey name').lean();
    const byId = new Map(staff.map((s) => [String(s._id), s]));
    let marked = 0;
    for (const e of input.entries) {
      const s = byId.get(e.staffId);
      if (!s) continue;
      const calc = this.compute(cfg, s, { ...e, date: input.date });
      await Attendance.updateOne({ staffId: s._id, date: input.date }, { $set: { societyId, status: e.status, checkInAt: e.checkInAt ?? null, checkOutAt: e.checkOutAt ?? null, note: e.note, source: 'MANUAL', markedBy: byUserId, ...calc }, $setOnInsert: { staffId: s._id, date: input.date } }, { upsert: true });
      marked += 1;
    }
    auditService.record({ action: 'staff.attendance_marked', resource: 'Attendance', resourceId: input.date, societyId, newValue: { date: input.date, marked }, req });
    domainEvents.emit('operations.changed', { attendance: input.date }, { societyId, actorId: byUserId });
    return { date: input.date, marked, rows: await Attendance.find({ societyId, date: input.date }).populate('staffId', 'name staffNumber categoryKey').lean() };
  }

  /** Gate punch: first punch of the day checks in (idempotent), the next checks out. */
  async punch(societyId: string, id: string, direction: 'IN' | 'OUT', input: { gateId?: string; clientRef?: string; at?: Date }, byUserId: string, req?: any) {
    const staff: any = await Staff.findOne({ _id: id, societyId, deletedAt: null }).lean();
    if (!staff) throw Errors.notFound('Staff member');
    const at = input.at ?? new Date();
    const date = dateKey(at);
    const cfg = await this.getConfig(societyId);
    const existing: any = await Attendance.findOne({ staffId: staff._id, date }).lean();
    if (direction === 'IN') {
      if (existing?.checkInAt) return { ...existing, id: String(existing._id), replayed: true };
      const calc = this.compute(cfg, staff, { checkInAt: at, checkOutAt: null, date });
      await Attendance.updateOne({ staffId: staff._id, date }, { $set: { societyId, status: 'PRESENT', checkInAt: at, source: 'GATE', markedBy: byUserId, ...calc }, $setOnInsert: { staffId: staff._id, date } }, { upsert: true });
    } else {
      if (!existing?.checkInAt) throw Errors.conflict(`${staff.name} has not checked in today`);
      if (existing.checkOutAt) return { ...existing, id: String(existing._id), replayed: true };
      const calc = this.compute(cfg, staff, { checkInAt: existing.checkInAt, checkOutAt: at, date });
      await Attendance.updateOne({ _id: existing._id }, { $set: { checkOutAt: at, status: calc.minutesWorked < 240 ? 'HALF_DAY' : 'PRESENT', ...calc } });
    }
    auditService.record({ action: direction === 'IN' ? 'staff.checked_in' : 'staff.checked_out', resource: 'Staff', resourceId: staff._id, societyId, metadata: { date, gateId: input.gateId }, req });
    domainEvents.emit('operations.changed', { attendance: date, staffId: String(staff._id) }, { societyId, actorId: byUserId });
    const row: any = await Attendance.findOne({ staffId: staff._id, date }).lean();
    return { ...row, id: String(row._id), staff: { id: String(staff._id), name: staff.name, staffNumber: staff.staffNumber } };
  }

  async summary(societyId: string, staffId: string, month: string) {
    const rows = await Attendance.find({ societyId, staffId, date: { $regex: `^${month}` } }).lean();
    const counts = { present: 0, absent: 0, halfDay: 0, leave: 0, weekOff: 0, late: 0, overtimeMinutes: 0, minutesWorked: 0 };
    for (const r of rows) {
      if (r.status === 'PRESENT') counts.present += 1;
      else if (r.status === 'ABSENT') counts.absent += 1;
      else if (r.status === 'HALF_DAY') counts.halfDay += 1;
      else if (r.status === 'LEAVE') counts.leave += 1;
      else if (r.status === 'WEEK_OFF') counts.weekOff += 1;
      if (r.late) counts.late += 1;
      counts.overtimeMinutes += r.overtimeMinutes ?? 0;
      counts.minutesWorked += r.minutesWorked ?? 0;
    }
    return { month, ...counts, payableDays: counts.present + counts.halfDay * 0.5 + counts.weekOff };
  }

  /** Month register: one row per staff member with a status letter per day. */
  async register(societyId: string, month: string, query: { categoryKey?: string } = {}) {
    const start = dayjs(`${month}-01`);
    const days = Array.from({ length: start.daysInMonth() }, (_, i) => start.add(i, 'day').format('YYYY-MM-DD'));
    const filter: Record<string, unknown> = { societyId, deletedAt: null, $or: [{ status: { $in: ['ACTIVE', 'ON_LEAVE'] } }, { leftAt: { $gte: start.toDate() } }] };
    if (query.categoryKey) filter.categoryKey = String(query.categoryKey).toUpperCase();
    const staff = await Staff.find(filter).select('name staffNumber categoryKey designation shiftKey').sort({ name: 1 }).lean();
    const rows = await Attendance.find({ societyId, date: { $regex: `^${month}` }, staffId: { $in: staff.map((s) => s._id) } }).lean();
    const byStaff = new Map<string, Record<string, any>>();
    for (const r of rows) {
      const m = byStaff.get(String(r.staffId)) ?? {};
      m[r.date] = { status: r.status, late: r.late, source: r.source, checkInAt: r.checkInAt, checkOutAt: r.checkOutAt, minutesWorked: r.minutesWorked };
      byStaff.set(String(r.staffId), m);
    }
    return {
      month,
      days,
      rows: await Promise.all(staff.map(async (s) => ({ staff: { id: String(s._id), name: s.name, staffNumber: s.staffNumber, categoryKey: s.categoryKey, designation: s.designation }, byDate: byStaff.get(String(s._id)) ?? {}, summary: await this.summary(societyId, String(s._id), month) }))),
    };
  }

  async exportRegister(societyId: string, month: string) {
    const reg = await this.register(societyId, month);
    return reg.rows.map((r) => ({ staff: r.staff.name, number: r.staff.staffNumber, category: r.staff.categoryKey, ...Object.fromEntries(reg.days.map((d) => [d.slice(-2), STATUS_LETTER[r.byDate[d]?.status] ?? ''])), present: r.summary.present, halfDays: r.summary.halfDay, absent: r.summary.absent, leave: r.summary.leave, late: r.summary.late, overtimeHours: Math.round((r.summary.overtimeMinutes / 60) * 10) / 10, payableDays: r.summary.payableDays }));
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const today = dateKey();
    const [headcount, byCategory, todayRows, onLeave] = await Promise.all([
      Staff.countDocuments({ societyId, deletedAt: null, status: { $in: ['ACTIVE', 'ON_LEAVE'] } }),
      Staff.aggregate([{ $match: { societyId: sid, deletedAt: null, status: { $in: ['ACTIVE', 'ON_LEAVE'] } } }, { $group: { _id: '$categoryKey', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Attendance.aggregate([{ $match: { societyId: sid, date: today } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Staff.countDocuments({ societyId, deletedAt: null, status: 'ON_LEAVE' }),
    ]);
    const t = Object.fromEntries(todayRows.map((r) => [r._id, r.n]));
    const marked = todayRows.reduce((s, r) => s + r.n, 0);
    return { headcount, onLeave, byCategory: byCategory.map((c) => ({ category: c._id, count: c.n })), today: { present: (t.PRESENT ?? 0) + (t.HALF_DAY ?? 0), absent: t.ABSENT ?? 0, leave: t.LEAVE ?? 0, weekOff: t.WEEK_OFF ?? 0, unmarked: Math.max(0, headcount - marked) } };
  }

  /**
   * Nightly / periodic processing: yesterday's unmarked staff become ABSENT (or WEEK_OFF on their weekly off);
   * after the reminder hour, managers are told how many staff are still unmarked today (once per day).
   */
  async process(now = new Date()): Promise<{ autoMarked: number; reminders: number }> {
    const result = { autoMarked: 0, reminders: 0 };
    const yesterday = dateKey(dayjs(now).subtract(1, 'day'));
    const today = dateKey(now);
    const societies = await Staff.distinct('societyId', { deletedAt: null, status: { $in: ['ACTIVE', 'ON_LEAVE'] } });
    for (const sid of societies) {
      const societyId = String(sid);
      const cfg = await this.getConfig(societyId);
      const staff = await Staff.find({ societyId, deletedAt: null, status: { $in: ['ACTIVE', 'ON_LEAVE'] } }).select('weeklyOff status').lean();
      const marked = new Set((await Attendance.find({ societyId, date: yesterday }).select('staffId').lean()).map((r) => String(r.staffId)));
      for (const s of staff) {
        if (marked.has(String(s._id))) continue;
        const status = s.status === 'ON_LEAVE' ? 'LEAVE' : (s.weeklyOff ?? []).includes(dayjs(yesterday).day()) ? 'WEEK_OFF' : 'ABSENT';
        await Attendance.updateOne({ staffId: s._id, date: yesterday }, { $setOnInsert: { societyId, staffId: s._id, date: yesterday, status, source: 'AUTO' } }, { upsert: true });
        result.autoMarked += 1;
      }
      if (dayjs(now).hour() >= (cfg.attendanceReminderHour ?? 12)) {
        const markedToday = await Attendance.countDocuments({ societyId, date: today });
        const unmarked = staff.length - markedToday;
        if (unmarked > 0 && !(await Notification.exists({ societyId, type: 'staff.attendance_missing', 'data.date': today }))) {
          domainEvents.emit('staff.attendance_missing', { date: today, count: unmarked }, { societyId });
          result.reminders += 1;
        }
      }
    }
    return result;
  }
}

export const staffService = new StaffService();
