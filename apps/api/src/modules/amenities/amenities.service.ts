import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { ErrorCodes } from '@society-erp/shared';
import { Amenity } from '../../models/amenity.model';
import { AmenityBooking, type AmenityBookingDoc } from '../../models/amenity-booking.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { Invoice } from '../../models/invoice.model';
import { Payment } from '../../models/payment.model';
import { Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { workflowService } from '../../core/workflows/workflow.service';
import { domainEvents } from '../../core/events/event-bus';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { billingService } from '../billing/billing.service';
import { paymentService } from '../payments/payments.service';

export interface AmenitiesConfig {
  slotMinutes: number;
  maxAdvanceBookingDays: number;
  maxActiveBookingsPerUnit: number;
  cancellationHours: number;
  paymentWindowHours: number;
  blockIfDuesPending: boolean;
  lateCancellationRefundPercent: number;
  minNoticeHours: number;
}

/** Who is acting. `ownScope` = may only see / touch bookings of their own units. */
export interface Actor { userId: string; ownScope: boolean; unitIds: string[]; residentId?: string | null; canCancelAny: boolean; canManage: boolean }
type WorkflowUser = { userId: string; roleKeys: string[]; permissions: Set<string> };

/** Bookings that hold a slot. */
export const HOLDING_STATUSES = ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED'];
const STAFF: Actor = { userId: '', ownScope: false, unitIds: [], residentId: null, canCancelAny: true, canManage: true };
const round2 = (n: number) => Math.round(n * 100) / 100;
const parseTime = (t: string | undefined | null, fallback: string) => {
  const [h, m] = (t || fallback).split(':').map(Number);
  return { h: h || 0, m: m || 0 };
};
const fmtDT = (d: Date | string | dayjs.Dayjs) => dayjs(d).format('DD MMM YYYY, HH:mm');

class AmenityService {
  // ------------------------------------------------------------------ settings & catalogue
  getConfig(societyId: string): Promise<AmenitiesConfig> { return configurationService.getSocietySetting<AmenitiesConfig>(societyId, 'amenities.config'); }

  async updateConfig(societyId: string, patch: Partial<AmenitiesConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'amenities.config', patch, byUserId);
    auditService.record({ action: 'amenities.config_updated', resource: 'SocietySetting', resourceId: 'amenities.config', societyId, newValue: patch, req });
    return merged;
  }

  /** Amenity types are a configurable category (Settings → Categories → Amenity types). */
  async types(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['AMENITY_TYPE']);
    return categoryService.list(societyId, 'AMENITY_TYPE');
  }

  private async assertType(societyId: string, typeKey?: string): Promise<void> {
    if (!typeKey) return;
    const types = await this.types(societyId);
    if (types.length && !types.some((t: any) => t.key === String(typeKey).toUpperCase())) throw Errors.validation({ typeKey: ['Unknown amenity type'] });
  }

  private presentAmenity(doc: any) {
    const { bookingLock: _lock, ...rest } = doc;
    return { ...rest, id: String(doc._id ?? doc.id) };
  }

  async listAmenities(societyId: string, query: { typeKey?: string; includeInactive?: boolean }, actor: Actor) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null };
    if (!(actor.canManage && query.includeInactive)) filter.status = { $in: ['ACTIVE', 'MAINTENANCE'] };
    if (query.typeKey) filter.typeKey = String(query.typeKey).toUpperCase();
    const docs = await Amenity.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return docs.map((d) => this.presentAmenity(d));
  }

  async getAmenity(societyId: string, id: string, actor: Actor) {
    const doc = await Amenity.findOne({ _id: id, societyId, deletedAt: null }).lean();
    if (!doc || (!actor.canManage && doc.status === 'INACTIVE')) throw Errors.notFound('Amenity');
    return this.presentAmenity(doc);
  }

  async createAmenity(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const code = String(input.code || input.name).toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'AMENITY';
    if (await Amenity.exists({ societyId, code })) throw Errors.conflict(`An amenity with code ${code} already exists`);
    await this.assertType(societyId, input.typeKey);
    const doc = await Amenity.create({ ...input, societyId, code, typeKey: String(input.typeKey ?? 'OTHER').toUpperCase(), createdBy: byUserId });
    auditService.record({ action: 'amenity.created', resource: 'Amenity', resourceId: doc._id, societyId, newValue: { name: doc.name, code, pricing: doc.pricing, requiresApproval: doc.requiresApproval }, req });
    return this.presentAmenity(doc.toJSON());
  }

  async updateAmenity(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const doc = await Amenity.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Amenity');
    if (patch.code) {
      const code = String(patch.code).toUpperCase();
      if (code !== doc.code && (await Amenity.exists({ societyId, code }))) throw Errors.conflict(`An amenity with code ${code} already exists`);
      doc.code = code;
    }
    if (patch.typeKey) {
      await this.assertType(societyId, patch.typeKey);
      doc.typeKey = String(patch.typeKey).toUpperCase();
    }
    for (const key of ['name', 'description', 'location', 'rules', 'images', 'capacity', 'maxGuests', 'bookingMode', 'requiresApproval', 'cancellationHours', 'maintenanceBlocks', 'status', 'sortOrder'] as const) {
      if (patch[key] !== undefined) doc.set(key, patch[key]);
    }
    if (patch.schedule) doc.set('schedule', { ...((doc.schedule as any)?.toObject?.() ?? {}), ...patch.schedule });
    if (patch.pricing) doc.set('pricing', { ...((doc.pricing as any)?.toObject?.() ?? {}), ...patch.pricing });
    await doc.save();
    auditService.record({ action: 'amenity.updated', resource: 'Amenity', resourceId: doc._id, societyId, newValue: patch, req });
    return this.presentAmenity(doc.toJSON());
  }

  async removeAmenity(societyId: string, id: string, byUserId: string, req?: any): Promise<void> {
    const doc = await Amenity.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Amenity');
    const active = await AmenityBooking.countDocuments({ amenityId: doc._id, status: { $in: HOLDING_STATUSES }, endAt: { $gt: new Date() } });
    if (active) throw Errors.conflict(`${doc.name} has ${active} active booking${active === 1 ? '' : 's'}; cancel them first`);
    doc.deletedAt = new Date();
    doc.status = 'INACTIVE';
    doc.code = `${doc.code}_DEL_${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
    await doc.save();
    auditService.record({ action: 'amenity.deleted', resource: 'Amenity', resourceId: doc._id, societyId, actor: { id: byUserId }, req });
  }

  // ------------------------------------------------------------------ time helpers
  /** Opening window of an amenity on a given day, or null when closed. */
  private dayWindow(amenity: any, day: dayjs.Dayjs, cfg: AmenitiesConfig): { open: dayjs.Dayjs; close: dayjs.Dayjs; slotMinutes: number } | null {
    const sch = amenity.schedule ?? {};
    const days: number[] = Array.isArray(sch.daysOpen) && sch.daysOpen.length ? sch.daysOpen : [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(day.day())) return null;
    const o = parseTime(sch.openTime, '06:00');
    const c = parseTime(sch.closeTime, '22:00');
    const open = day.startOf('day').hour(o.h).minute(o.m);
    let close = day.startOf('day').hour(c.h).minute(c.m);
    if (!close.isAfter(open)) close = day.startOf('day').add(1, 'day');
    const slotMinutes = amenity.bookingMode === 'FULL_DAY' ? close.diff(open, 'minute') : Number(sch.slotMinutes || cfg.slotMinutes || 60);
    return { open, close, slotMinutes };
  }

  private blockedReason(amenity: any, start: dayjs.Dayjs, end: dayjs.Dayjs): string | null {
    for (const b of amenity.maintenanceBlocks ?? []) {
      if (dayjs(b.from).isBefore(end) && dayjs(b.to).isAfter(start)) return b.reason ? `Unavailable: ${b.reason}` : 'Unavailable for maintenance';
    }
    return null;
  }

  private priceFor(amenity: any, slots: number, minutes: number): { amount: number; deposit: number; total: number } {
    const p = amenity.pricing ?? {};
    const rate = Number(p.amount ?? 0);
    let amount = 0;
    if (p.mode === 'PER_SLOT') amount = rate * slots;
    else if (p.mode === 'PER_HOUR') amount = rate * (minutes / 60);
    else if (p.mode === 'PER_BOOKING') amount = rate;
    const deposit = round2(Number(p.deposit ?? 0));
    return { amount: round2(amount), deposit, total: round2(amount + deposit) };
  }

  /**
   * Serialises overlap-check + insert per amenity with a short DB lease so two requests (even on
   * different API instances) can never both pass the capacity check for the same slot.
   */
  private async withLock<T>(amenityId: mongoose.Types.ObjectId, fn: () => Promise<T>): Promise<T> {
    const ttlMs = 5000;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const now = Date.now();
      const res = await Amenity.updateOne({ _id: amenityId, $or: [{ bookingLock: null }, { bookingLock: { $lt: new Date(now) } }] }, { $set: { bookingLock: new Date(now + ttlMs) } });
      if (res.matchedCount === 1) {
        try {
          return await fn();
        } finally {
          await Amenity.updateOne({ _id: amenityId }, { $set: { bookingLock: null } });
        }
      }
      await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 35)));
    }
    throw Errors.conflict('The amenity is busy right now, please try again');
  }

  private scopeFilter(actor: Actor): Record<string, unknown> {
    if (!actor.ownScope) return {};
    return { $or: [{ bookedBy: actor.userId }, ...(actor.unitIds.length ? [{ unitId: { $in: actor.unitIds } }] : [])] };
  }

  private isMine(doc: any, actor: Actor): boolean {
    const unitId = String(doc.unitId?._id ?? doc.unitId);
    const bookedBy = String(doc.bookedBy?._id ?? doc.bookedBy);
    return bookedBy === actor.userId || actor.unitIds.includes(unitId);
  }

  private present(doc: any, actor: Actor) {
    return { ...doc, id: String(doc._id), mine: this.isMine(doc, actor) };
  }

  // ------------------------------------------------------------------ availability
  async availability(societyId: string, amenityId: string, dateStr: string | undefined, actor: Actor) {
    const amenity: any = await Amenity.findOne({ _id: amenityId, societyId, deletedAt: null }).lean();
    if (!amenity) throw Errors.notFound('Amenity');
    const cfg = await this.getConfig(societyId);
    const day = dateStr ? dayjs(dateStr) : dayjs();
    if (!day.isValid()) throw Errors.validation({ date: ['Invalid date'] });
    const w = this.dayWindow(amenity, day, cfg);
    const base = {
      date: day.format('YYYY-MM-DD'),
      amenity: { id: String(amenity._id), name: amenity.name, capacity: amenity.capacity, bookingMode: amenity.bookingMode, slotMinutes: w?.slotMinutes ?? null, maxSlotsPerBooking: amenity.bookingMode === 'FULL_DAY' ? 1 : amenity.schedule?.maxSlotsPerBooking ?? 1, pricing: amenity.pricing, requiresApproval: amenity.requiresApproval, status: amenity.status, maxGuests: amenity.maxGuests },
    };
    if (!w) return { ...base, closed: true, reason: `Closed on ${day.format('dddd')}s`, slots: [] as any[] };
    const bookings = await AmenityBooking.find({ amenityId: amenity._id, status: { $in: HOLDING_STATUSES }, startAt: { $lt: w.close.toDate() }, endAt: { $gt: w.open.toDate() } }).select('startAt endAt unitId bookedBy status').lean();
    const now = dayjs();
    const minStart = now.add(Number(amenity.schedule?.minNoticeHours ?? cfg.minNoticeHours ?? 0), 'hour');
    const maxStart = now.add(Number(amenity.schedule?.maxAdvanceDays ?? cfg.maxAdvanceBookingDays), 'day').endOf('day');
    const slots: any[] = [];
    for (let s = w.open; !s.add(w.slotMinutes, 'minute').isAfter(w.close); s = s.add(w.slotMinutes, 'minute')) {
      const e = s.add(w.slotMinutes, 'minute');
      const overlapping = bookings.filter((b) => dayjs(b.startAt).isBefore(e) && dayjs(b.endAt).isAfter(s));
      const booked = overlapping.length;
      const mine = overlapping.some((b) => this.isMine(b, actor));
      let reason: string | null = null;
      if (amenity.status !== 'ACTIVE') reason = amenity.status === 'MAINTENANCE' ? 'Under maintenance' : 'Not available';
      else if (!s.isAfter(minStart)) reason = s.isBefore(now) ? 'Past' : 'Too soon to book';
      else if (s.isAfter(maxStart)) reason = 'Beyond the advance booking window';
      else reason = this.blockedReason(amenity, s, e) ?? (booked >= amenity.capacity ? (amenity.capacity > 1 ? 'Fully booked' : 'Booked') : null);
      slots.push({ startAt: s.toDate(), endAt: e.toDate(), capacity: amenity.capacity, booked, available: Math.max(0, amenity.capacity - booked), bookable: !reason, reason, mine });
    }
    return { ...base, closed: false, slots };
  }

  async calendar(societyId: string, amenityId: string, from: Date, to: Date, actor: Actor) {
    const docs: any[] = await AmenityBooking.find({ societyId, amenityId, status: { $in: [...HOLDING_STATUSES, 'COMPLETED'] }, startAt: { $lt: to }, endAt: { $gt: from } })
      .select('startAt endAt status unitId bookedBy bookingNumber guests purpose paymentStatus')
      .populate('unitId', 'code')
      .sort({ startAt: 1 })
      .lean();
    return docs.map((b) => {
      const mine = this.isMine(b, actor);
      const base = { id: String(b._id), startAt: b.startAt, endAt: b.endAt, status: b.status, unitCode: b.unitId?.code ?? null, mine };
      return actor.ownScope && !mine ? base : { ...base, bookingNumber: b.bookingNumber, guests: b.guests, purpose: b.purpose, paymentStatus: b.paymentStatus };
    });
  }

  // ------------------------------------------------------------------ booking
  async book(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const amenity: any = await Amenity.findOne({ _id: input.amenityId, societyId, deletedAt: null }).lean();
    if (!amenity) throw Errors.notFound('Amenity');
    if (amenity.status !== 'ACTIVE') throw Errors.conflict(`${amenity.name} is ${amenity.status === 'MAINTENANCE' ? 'under maintenance' : 'not open for booking'}`);
    const cfg = await this.getConfig(societyId);

    // which unit is booking
    let unitId: string | undefined;
    if (actor.ownScope) {
      if (input.unitId && !actor.unitIds.includes(String(input.unitId))) throw Errors.forbidden('You can only book for your own unit');
      unitId = input.unitId ? String(input.unitId) : actor.unitIds[0];
      if (!unitId) throw Errors.conflict('Your login is not linked to a unit yet. Ask the society office to link your residency.');
    } else {
      unitId = input.unitId ? String(input.unitId) : actor.unitIds[0];
      if (!unitId) throw Errors.validation({ unitId: ['Choose the unit this booking is for'] });
    }
    const unit = await Unit.findOne({ _id: unitId, societyId, deletedAt: null }).select('code').lean();
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    const onBehalf = !actor.unitIds.includes(String(unit._id));

    // when
    const requested = dayjs(input.startAt);
    if (!requested.isValid()) throw Errors.validation({ startAt: ['Invalid start time'] });
    const w = this.dayWindow(amenity, requested, cfg);
    if (!w) throw Errors.validation({ startAt: [`${amenity.name} is closed on ${requested.format('dddd')}s`] });
    let start = requested.second(0).millisecond(0);
    let end: dayjs.Dayjs;
    let slots = 1;
    if (amenity.bookingMode === 'FULL_DAY') {
      start = w.open;
      end = w.close;
    } else {
      const offset = start.diff(w.open, 'minute');
      if (offset < 0 || offset % w.slotMinutes !== 0 || !start.isBefore(w.close)) throw Errors.validation({ startAt: [`Bookings start on ${w.slotMinutes}-minute slots between ${w.open.format('HH:mm')} and ${w.close.format('HH:mm')}`] });
      slots = Math.max(1, Number(input.slots ?? 1));
      const maxSlots = Number(amenity.schedule?.maxSlotsPerBooking ?? 1);
      if (slots > maxSlots) throw Errors.validation({ slots: [`At most ${maxSlots} consecutive slot${maxSlots === 1 ? '' : 's'} per booking`] });
      end = start.add(slots * w.slotMinutes, 'minute');
      if (end.isAfter(w.close)) throw Errors.validation({ slots: [`${amenity.name} closes at ${w.close.format('HH:mm')}`] });
    }
    const now = dayjs();
    const minNotice = Number(amenity.schedule?.minNoticeHours ?? cfg.minNoticeHours ?? 0);
    if (!start.isAfter(now.add(minNotice, 'hour'))) throw Errors.validation({ startAt: [minNotice ? `Bookings need at least ${minNotice} hours notice` : 'The start time must be in the future'] });
    const advance = Number(amenity.schedule?.maxAdvanceDays ?? cfg.maxAdvanceBookingDays);
    if (start.isAfter(now.add(advance, 'day').endOf('day'))) throw Errors.validation({ startAt: [`Bookings open ${advance} days in advance`] });
    const blocked = this.blockedReason(amenity, start, end);
    if (blocked) throw Errors.conflict(blocked);
    const guests = Number(input.guests ?? 0);
    if (amenity.maxGuests && guests > amenity.maxGuests) throw Errors.validation({ guests: [`${amenity.name} allows at most ${amenity.maxGuests} guests`] });

    // society policies
    if (cfg.maxActiveBookingsPerUnit > 0) {
      const active = await AmenityBooking.countDocuments({ societyId, unitId: unit._id, status: { $in: HOLDING_STATUSES }, endAt: { $gt: now.toDate() } });
      if (active >= cfg.maxActiveBookingsPerUnit) throw Errors.conflict(`Unit ${unit.code} already has ${active} active booking${active === 1 ? '' : 's'} (limit ${cfg.maxActiveBookingsPerUnit})`);
    }
    if (cfg.blockIfDuesPending) {
      const balance = await billingService.getUnitBalance(societyId, String(unit._id));
      if (balance > 0) throw Errors.conflict(`Clear the pending dues of ₹${balance} for unit ${unit.code} before booking amenities`, { balance });
    }
    const { amount, deposit, total } = this.priceFor(amenity, slots, end.diff(start, 'minute'));
    const residentId = actor.residentId && !onBehalf ? actor.residentId : ((await Resident.findOne({ societyId, unitId: unit._id, status: 'ACTIVE', deletedAt: null }).sort({ isPrimary: -1 }).select('_id').lean())?._id ?? null);

    const doc = await this.withLock(amenity._id, async () => {
      const overlapping = await AmenityBooking.countDocuments({ amenityId: amenity._id, status: { $in: HOLDING_STATUSES }, startAt: { $lt: end.toDate() }, endAt: { $gt: start.toDate() } });
      if (overlapping >= amenity.capacity) throw Errors.custom(409, ErrorCodes.BOOKING_OVERLAP, amenity.capacity > 1 ? `${amenity.name} is fully booked for that time` : `${amenity.name} is already booked for that time`);
      const bookingNumber = await sequenceService.next(societyId, 'amenity_booking', { prefix: 'BK', padding: 5, resetPolicy: 'YEARLY' });
      const initial = amenity.requiresApproval ? 'PENDING_APPROVAL' : total > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED';
      const b = new AmenityBooking({ societyId, bookingNumber, amenityId: amenity._id, unitId: unit._id, bookedBy: actor.userId, residentId, onBehalf, startAt: start.toDate(), endAt: end.toDate(), slots, guests, purpose: input.purpose, status: initial, amount, deposit, total, paymentStatus: total > 0 ? 'PENDING' : 'NOT_REQUIRED', history: [{ at: new Date(), userId: actor.userId, action: 'created', to: initial }] });
      await b.save();
      return b;
    });
    auditService.record({ action: 'amenity.booked', resource: 'AmenityBooking', resourceId: doc._id, societyId, newValue: { bookingNumber: doc.bookingNumber, amenity: amenity.code, unit: unit.code, startAt: doc.startAt, endAt: doc.endAt, total }, req });

    if (doc.status === 'PENDING_APPROVAL') {
      const wf = await workflowService.start({ societyId, key: 'amenity_approval', entityType: 'AmenityBooking', entityId: doc._id, context: { amount: total, amenityKey: amenity.code, amenityName: amenity.name, unitCode: unit.code, startAt: start.toISOString(), endAt: end.toISOString(), slots, guests, bookingNumber: doc.bookingNumber, typeKey: amenity.typeKey }, startedBy: actor.userId });
      if (wf.autoApproved) await this.applyWorkflowOutcome(societyId, doc._id, 'APPROVED', null, 'Auto-approved by workflow');
      else {
        doc.workflowInstanceId = wf.instance!._id as any;
        await doc.save();
      }
    } else if (doc.status === 'PENDING_PAYMENT') await this.requestPayment(doc, amenity, cfg, actor.userId, req);
    else await this.confirm(doc, actor.userId);
    domainEvents.emit('amenity.booking_created', { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityId: String(amenity._id), amenityName: amenity.name, unitId: String(unit._id), unitCode: unit.code, startAt: doc.startAt, status: doc.status, bookedBy: actor.userId }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  /** Issues the fee invoice through billing and holds the slot until `paymentDueAt`. */
  private async requestPayment(doc: AmenityBookingDoc, amenity: any, cfg: AmenitiesConfig, byUserId: string | null, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    const window = dayjs().add(cfg.paymentWindowHours, 'hour');
    const dueAt = window.isAfter(dayjs(doc.startAt)) ? dayjs(doc.startAt) : window;
    if (!doc.invoiceId) {
      const range = `${dayjs(doc.startAt).format('DD MMM YYYY HH:mm')} – ${dayjs(doc.endAt).format('HH:mm')}`;
      const lineItems: Record<string, unknown>[] = [];
      if (doc.amount > 0) lineItems.push({ description: `${amenity.name} booking ${doc.bookingNumber} (${range})`, amount: doc.amount, code: 'AMENITY', ledgerAccountCode: amenity.pricing?.ledgerAccountCode || '4130' });
      if (doc.deposit > 0) lineItems.push({ description: `Refundable security deposit – ${amenity.name}`, amount: doc.deposit, code: 'AMENITY_DEPOSIT', ledgerAccountCode: '2200' });
      const invoice = await billingService.createInvoice(societyId, { unitId: String(doc.unitId), label: `Amenity booking ${doc.bookingNumber}`, lineItems, dueDate: dueAt.toDate(), notes: `Booking ${doc.bookingNumber}: pay before ${dueAt.format('DD MMM YYYY HH:mm')} to keep the slot.`, issueImmediately: true }, byUserId ?? String(doc.bookedBy), req);
      doc.invoiceId = (invoice as any).id ?? (invoice as any)._id;
    }
    doc.status = 'PENDING_PAYMENT';
    doc.paymentStatus = 'PENDING';
    doc.paymentDueAt = dueAt.toDate();
    doc.history.push({ at: new Date(), userId: byUserId, action: 'payment_requested', to: 'PENDING_PAYMENT', note: `Pay by ${fmtDT(dueAt)}` } as any);
    await doc.save();
    domainEvents.emit('amenity.payment_due', { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityName: amenity.name, amount: doc.total, invoiceId: String(doc.invoiceId), deadline: dueAt.toDate(), startAt: doc.startAt, bookedBy: String(doc.bookedBy), unitId: String(doc.unitId) }, { societyId, actorId: byUserId });
  }

  private async confirm(doc: AmenityBookingDoc, byUserId: string | null): Promise<void> {
    if (doc.status !== 'CONFIRMED') {
      doc.status = 'CONFIRMED';
      doc.history.push({ at: new Date(), userId: byUserId, action: 'confirmed', to: 'CONFIRMED' } as any);
      await doc.save();
    }
    const amenity = await Amenity.findById(doc.amenityId).select('name').lean();
    domainEvents.emit('amenity.booking_confirmed', { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityName: amenity?.name ?? '', startAt: doc.startAt, endAt: doc.endAt, bookedBy: String(doc.bookedBy), unitId: String(doc.unitId) }, { societyId: String(doc.societyId), actorId: byUserId });
  }

  /** Moves an approved booking on to payment / confirmation, or rejects it. Idempotent (atomic on status). */
  async applyWorkflowOutcome(societyId: string, bookingId: any, status: 'APPROVED' | 'REJECTED', byUserId: string | null, note?: string): Promise<void> {
    const current = await AmenityBooking.findOne({ _id: bookingId, societyId, status: 'PENDING_APPROVAL' }).select('total').lean();
    if (!current) return;
    const next = status === 'REJECTED' ? 'REJECTED' : current.total > 0 ? 'PENDING_PAYMENT' : 'CONFIRMED';
    const doc = await AmenityBooking.findOneAndUpdate(
      { _id: bookingId, societyId, status: 'PENDING_APPROVAL' },
      { $set: { status: next, decidedBy: byUserId, decidedAt: new Date(), decisionNote: note }, $push: { history: { at: new Date(), userId: byUserId, action: status === 'APPROVED' ? 'approved' : 'rejected', from: 'PENDING_APPROVAL', to: next, note } } },
      { new: true },
    );
    if (!doc) {
      await this.waitSettled(bookingId); // another writer (route vs. event) is applying it; wait so callers see the final state
      return;
    }
    const amenity: any = await Amenity.findById(doc.amenityId).lean();
    auditService.record({ action: status === 'APPROVED' ? 'amenity.booking_approved' : 'amenity.booking_rejected', resource: 'AmenityBooking', resourceId: doc._id, societyId, actor: byUserId ? { id: byUserId } : undefined, newValue: { bookingNumber: doc.bookingNumber, note } });
    if (status === 'REJECTED') {
      domainEvents.emit('amenity.booking_rejected', { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityName: amenity?.name ?? '', startAt: doc.startAt, reason: note ?? '', bookedBy: String(doc.bookedBy), unitId: String(doc.unitId) }, { societyId, actorId: byUserId });
      return;
    }
    if (next === 'PENDING_PAYMENT') await this.requestPayment(doc, amenity, await this.getConfig(societyId), byUserId);
    else await this.confirm(doc, byUserId);
  }

  /** Waits (briefly) until a booking whose outcome is being applied elsewhere reaches a settled state. */
  private async waitSettled(bookingId: any): Promise<void> {
    for (let i = 0; i < 40; i += 1) {
      const b = await AmenityBooking.findById(bookingId).select('status invoiceId').lean();
      if (!b || b.status !== 'PENDING_PAYMENT' || b.invoiceId) return;
      await new Promise((r) => setTimeout(r, 75));
    }
  }

  async decide(societyId: string, id: string, input: { decision: 'APPROVED' | 'REJECTED'; note?: string }, user: WorkflowUser, req?: any) {
    const doc = await AmenityBooking.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Booking');
    if (doc.status !== 'PENDING_APPROVAL') throw Errors.invalidTransition(doc.status, input.decision, 'Booking');
    if (doc.workflowInstanceId) {
      const instance = await workflowService.decide(societyId, String(doc.workflowInstanceId), user, input.decision, input.note, req);
      if (instance.status === 'APPROVED' || instance.status === 'REJECTED') await this.applyWorkflowOutcome(societyId, doc._id, instance.status, user.userId, input.note);
    } else await this.applyWorkflowOutcome(societyId, doc._id, input.decision, user.userId, input.note);
    return this.get(societyId, id, STAFF);
  }

  /** Called when a payment settles an invoice: confirms the booking once the invoice is fully paid. */
  async markPaidByInvoice(societyId: string, invoiceId: string, paymentId: string | null): Promise<void> {
    const pending = await AmenityBooking.exists({ societyId, invoiceId, status: 'PENDING_PAYMENT' });
    if (!pending) return;
    const invoice = await Invoice.findOne({ _id: invoiceId, societyId }).select('balanceDue').lean();
    if (!invoice || invoice.balanceDue > 0) return;
    const doc = await AmenityBooking.findOneAndUpdate(
      { societyId, invoiceId, status: 'PENDING_PAYMENT' },
      { $set: { paymentStatus: 'PAID', paymentId, paidAt: new Date(), paymentDueAt: null }, $push: { history: { at: new Date(), userId: null, action: 'paid', from: 'PENDING_PAYMENT', to: 'CONFIRMED' } } },
      { new: true },
    );
    if (!doc) return;
    await this.confirm(doc, null);
  }

  // ------------------------------------------------------------------ cancellation & refunds
  private async voidInvoice(doc: AmenityBookingDoc, reason: string, byUserId: string | null, req?: any): Promise<number> {
    if (doc.paymentStatus !== 'PENDING' || !doc.invoiceId) return 0;
    const societyId = String(doc.societyId);
    try {
      await billingService.cancelInvoice(societyId, String(doc.invoiceId), reason, byUserId ?? String(doc.bookedBy), req);
      doc.paymentStatus = 'VOID';
      return 0;
    } catch (err) {
      logger.warn({ err, bookingId: String(doc._id) }, 'Could not cancel booking invoice');
      const inv = await Invoice.findById(doc.invoiceId).select('amountPaid').lean();
      const paid = round2(inv?.amountPaid ?? 0);
      if (paid > 0) {
        doc.paymentStatus = 'REFUND_DUE';
        doc.set('refund', { amount: paid, reason: 'Partial payment on a cancelled booking' });
      }
      return paid;
    }
  }

  async cancel(societyId: string, id: string, input: { reason?: string }, actor: Actor, req?: any) {
    const doc = await AmenityBooking.findOne({ _id: id, societyId, ...this.scopeFilter(actor) });
    if (!doc) throw Errors.notFound('Booking');
    if (!HOLDING_STATUSES.includes(doc.status)) throw Errors.invalidTransition(doc.status, 'CANCELLED', 'Booking');
    const own = this.isMine(doc, actor);
    if (!own && !actor.canCancelAny) throw Errors.forbidden('Only the booking owner or the committee can cancel this booking');
    const now = dayjs();
    if (!actor.canCancelAny && !dayjs(doc.startAt).isAfter(now)) throw Errors.conflict('This booking has already started');
    const amenity: any = await Amenity.findById(doc.amenityId).lean();
    const cfg = await this.getConfig(societyId);
    let refundAmount = 0;
    if (doc.paymentStatus === 'PAID') {
      const hours = Number(amenity?.cancellationHours ?? cfg.cancellationHours);
      const inTime = dayjs(doc.startAt).diff(now, 'hour', true) >= hours;
      const pct = actor.canCancelAny || inTime ? 100 : Number(cfg.lateCancellationRefundPercent ?? 0);
      refundAmount = round2((doc.amount * pct) / 100 + doc.deposit);
      if (refundAmount > 0) {
        doc.paymentStatus = 'REFUND_DUE';
        doc.set('refund', { amount: refundAmount, reason: pct === 100 ? 'Cancellation within policy' : `Late cancellation (${pct}% of the fee${doc.deposit ? ' + deposit' : ''})` });
      } else doc.paymentStatus = 'FORFEITED';
    } else refundAmount = await this.voidInvoice(doc, `Booking ${doc.bookingNumber} cancelled`, actor.userId, req);
    if (doc.status === 'PENDING_APPROVAL') await workflowService.cancel(societyId, 'AmenityBooking', doc._id, actor.userId);
    const from = doc.status;
    doc.status = 'CANCELLED';
    doc.cancelledAt = now.toDate();
    doc.cancelledBy = actor.userId as any;
    doc.cancellationReason = input.reason;
    doc.paymentDueAt = null;
    doc.history.push({ at: new Date(), userId: actor.userId, action: 'cancelled', from, to: 'CANCELLED', note: input.reason } as any);
    await doc.save();
    auditService.record({ action: 'amenity.booking_cancelled', resource: 'AmenityBooking', resourceId: doc._id, societyId, newValue: { bookingNumber: doc.bookingNumber, reason: input.reason, refundAmount, byOwner: own }, req });
    const unit = await Unit.findById(doc.unitId).select('code').lean();
    const payload = { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityName: amenity?.name ?? '', startAt: doc.startAt, reason: input.reason ?? '', refundAmount, bookedBy: String(doc.bookedBy), unitId: String(doc.unitId), unitCode: unit?.code ?? '', byOwner: own };
    domainEvents.emit('amenity.booking_cancelled', payload, { societyId, actorId: actor.userId });
    if (doc.paymentStatus === 'REFUND_DUE') domainEvents.emit('amenity.refund_due', { ...payload, amount: doc.refund?.amount ?? refundAmount }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  /** Finance processes a due refund through the payment that settled the booking invoice. */
  async refund(societyId: string, id: string, input: { amount?: number; reason: string }, byUserId: string, req?: any) {
    const doc = await AmenityBooking.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Booking');
    if (!['REFUND_DUE', 'PAID'].includes(doc.paymentStatus)) throw Errors.conflict('This booking has no refundable payment');
    if (doc.paymentStatus === 'PAID' && HOLDING_STATUSES.includes(doc.status)) throw Errors.conflict('Cancel the booking before refunding it');
    let paymentId = doc.paymentId ? String(doc.paymentId) : null;
    if (!paymentId && doc.invoiceId) {
      const p = await Payment.findOne({ societyId, 'allocations.invoiceId': doc.invoiceId, status: 'SUCCESS' }).sort({ receivedAt: -1 }).select('_id').lean();
      paymentId = p ? String(p._id) : null;
    }
    if (!paymentId) throw Errors.conflict('No payment is linked to this booking; refund it from Payments instead');
    const amount = round2(input.amount ?? doc.refund?.amount ?? doc.total);
    await paymentService.refund(societyId, paymentId, { amount, reason: input.reason }, byUserId, req);
    doc.paymentStatus = 'REFUNDED';
    doc.set('refund', { amount, reason: input.reason, at: new Date(), by: byUserId });
    doc.history.push({ at: new Date(), userId: byUserId, action: 'refunded', note: `₹${amount}` } as any);
    await doc.save();
    auditService.record({ action: 'amenity.booking_refunded', resource: 'AmenityBooking', resourceId: doc._id, societyId, newValue: { bookingNumber: doc.bookingNumber, amount, reason: input.reason }, req });
    return this.get(societyId, id, STAFF);
  }

  // ------------------------------------------------------------------ queries
  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    const scope = this.scopeFilter(actor);
    if (Object.keys(scope).length) and.push(scope);
    if (query.amenityId) and.push({ amenityId: query.amenityId });
    if (query.unitId) and.push({ unitId: query.unitId });
    if (query.status) and.push({ status: query.status });
    if (query.upcoming) and.push({ status: { $in: HOLDING_STATUSES }, endAt: { $gte: new Date() } });
    if (query.pendingOnly) and.push({ status: { $in: ['PENDING_APPROVAL', 'PENDING_PAYMENT'] } });
    if (query.from || query.to) and.push({ startAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } });
    const rx = searchRegex(query.search);
    if (rx) and.push({ $or: [{ bookingNumber: rx }, { purpose: rx }] });
    const page = await paginate(AmenityBooking as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-startAt', allowedSorts: ['startAt', 'createdAt', 'status', 'amount', 'total'], select: '-history', populate: [{ path: 'amenityId', select: 'name code typeKey location' }, { path: 'unitId', select: 'code' }, { path: 'bookedBy', select: 'name' }] });
    page.items = page.items.map((b: any) => ({ ...b, mine: this.isMine(b, actor) }));
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc: any = await AmenityBooking.findOne({ _id: id, societyId, ...this.scopeFilter(actor) })
      .populate('amenityId', 'name code typeKey location rules pricing requiresApproval bookingMode cancellationHours')
      .populate('unitId', 'code')
      .populate('bookedBy', 'name')
      .populate('decidedBy', 'name')
      .populate('cancelledBy', 'name')
      .populate('history.userId', 'name')
      .populate('invoiceId', 'invoiceNumber total balanceDue amountPaid status dueDate')
      .populate('paymentId', 'receiptNumber amount method receivedAt refund')
      .lean();
    if (!doc) throw Errors.notFound('Booking');
    const workflow = doc.workflowInstanceId ? await workflowService.instanceFor(societyId, 'AmenityBooking', doc._id) : null;
    return { ...this.present(doc, actor), workflow };
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const now = new Date();
    const dayStart = dayjs().startOf('day');
    const monthAgo = dayjs().subtract(30, 'day').toDate();
    const [today, upcoming, pendingApproval, pendingPayment, refundsDue, revenue, usage, activeAmenities] = await Promise.all([
      AmenityBooking.countDocuments({ societyId, status: { $in: HOLDING_STATUSES }, startAt: { $gte: dayStart.toDate(), $lt: dayStart.add(1, 'day').toDate() } }),
      AmenityBooking.countDocuments({ societyId, status: 'CONFIRMED', startAt: { $gte: now } }),
      AmenityBooking.countDocuments({ societyId, status: 'PENDING_APPROVAL' }),
      AmenityBooking.countDocuments({ societyId, status: 'PENDING_PAYMENT' }),
      AmenityBooking.countDocuments({ societyId, paymentStatus: 'REFUND_DUE' }),
      AmenityBooking.aggregate([{ $match: { societyId: sid, paidAt: { $gte: monthAgo } } }, { $group: { _id: null, amount: { $sum: '$amount' }, deposits: { $sum: '$deposit' }, count: { $sum: 1 } } }]),
      AmenityBooking.aggregate([{ $match: { societyId: sid, status: { $in: ['CONFIRMED', 'COMPLETED'] }, startAt: { $gte: monthAgo } } }, { $group: { _id: '$amenityId', bookings: { $sum: 1 }, hours: { $sum: { $divide: [{ $subtract: ['$endAt', '$startAt'] }, 3_600_000] } } } }, { $sort: { bookings: -1 } }, { $limit: 8 }]),
      Amenity.countDocuments({ societyId, status: 'ACTIVE', deletedAt: null }),
    ]);
    const names = await Amenity.find({ _id: { $in: usage.map((u) => u._id) } }).select('name').lean();
    return {
      today,
      upcoming,
      pendingApproval,
      pendingPayment,
      refundsDue,
      activeAmenities,
      revenue30d: round2(revenue[0]?.amount ?? 0),
      deposits30d: round2(revenue[0]?.deposits ?? 0),
      paidBookings30d: revenue[0]?.count ?? 0,
      usage: usage.map((u) => ({ amenityId: String(u._id), name: names.find((n) => String(n._id) === String(u._id))?.name ?? '—', bookings: u.bookings, hours: Math.round(u.hours * 10) / 10 })),
    };
  }

  async exportRows(societyId: string, query: Record<string, any>, actor: Actor) {
    const rows: any[] = [];
    let page = 1;
    while (rows.length < 5000) {
      const res = await this.list(societyId, { ...query, page, limit: 200 }, actor);
      rows.push(...res.items.map((b: any) => ({ booking: b.bookingNumber, amenity: b.amenityId?.name ?? '', unit: b.unitId?.code ?? '', bookedBy: b.bookedBy?.name ?? '', start: dayjs(b.startAt).format('YYYY-MM-DD HH:mm'), end: dayjs(b.endAt).format('YYYY-MM-DD HH:mm'), guests: b.guests, status: b.status, amount: b.amount, deposit: b.deposit, paymentStatus: b.paymentStatus, refund: b.refund?.amount ?? '', purpose: b.purpose ?? '' })));
      if (page >= res.pages) break;
      page += 1;
    }
    return rows;
  }

  // ------------------------------------------------------------------ jobs
  private async systemCancel(doc: AmenityBookingDoc, reason: string, now: Date): Promise<void> {
    const societyId = String(doc.societyId);
    await this.voidInvoice(doc, reason, null);
    if (doc.status === 'PENDING_APPROVAL') await workflowService.cancel(societyId, 'AmenityBooking', doc._id);
    const from = doc.status;
    doc.status = 'CANCELLED';
    doc.cancelledAt = now;
    doc.cancellationReason = reason;
    doc.paymentDueAt = null;
    doc.history.push({ at: now, userId: null, action: 'cancelled', from, to: 'CANCELLED', note: reason } as any);
    await doc.save();
    const [amenity, unit] = await Promise.all([Amenity.findById(doc.amenityId).select('name').lean(), Unit.findById(doc.unitId).select('code').lean()]);
    domainEvents.emit('amenity.booking_cancelled', { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityName: amenity?.name ?? '', startAt: doc.startAt, reason, refundAmount: 0, bookedBy: String(doc.bookedBy), unitId: String(doc.unitId), unitCode: unit?.code ?? '', byOwner: false, system: true }, { societyId });
  }

  /** Completes finished bookings (returning deposits), expires unpaid holds and unanswered approvals. */
  async sweep(now = new Date()): Promise<{ completed: number; expired: number; unapproved: number }> {
    const result = { completed: 0, expired: 0, unapproved: 0 };
    const ended = await AmenityBooking.find({ status: 'CONFIRMED', endAt: { $lte: now } });
    for (const doc of ended) {
      doc.status = 'COMPLETED';
      doc.completedAt = now;
      doc.history.push({ at: now, userId: null, action: 'completed', from: 'CONFIRMED', to: 'COMPLETED' } as any);
      if (doc.deposit > 0 && doc.paymentStatus === 'PAID') {
        doc.paymentStatus = 'REFUND_DUE';
        doc.set('refund', { amount: doc.deposit, reason: 'Security deposit return after use' });
      }
      await doc.save();
      result.completed += 1;
      if (doc.paymentStatus === 'REFUND_DUE') {
        const [amenity, unit] = await Promise.all([Amenity.findById(doc.amenityId).select('name').lean(), Unit.findById(doc.unitId).select('code').lean()]);
        domainEvents.emit('amenity.refund_due', { bookingId: String(doc._id), bookingNumber: doc.bookingNumber, amenityName: amenity?.name ?? '', amount: doc.deposit, unitId: String(doc.unitId), unitCode: unit?.code ?? '', bookedBy: String(doc.bookedBy) }, { societyId: String(doc.societyId) });
      }
    }
    const unpaid = await AmenityBooking.find({ status: 'PENDING_PAYMENT', paymentDueAt: { $lte: now } });
    for (const doc of unpaid) {
      await this.systemCancel(doc, 'Payment window expired', now);
      result.expired += 1;
    }
    const stale = await AmenityBooking.find({ status: 'PENDING_APPROVAL', startAt: { $lte: now } });
    for (const doc of stale) {
      await this.systemCancel(doc, 'Not approved before the booking started', now);
      result.unapproved += 1;
    }
    return result;
  }
}

export const amenityService = new AmenityService();

registerJobHandlers(() => {
  jobQueue.register(JobNames.AMENITY_COMPLETE, async () => {
    const r = await amenityService.sweep();
    if (r.completed || r.expired || r.unapproved) logger.info(r, 'Amenity booking sweep');
  });
});
