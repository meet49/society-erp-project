import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Event, EventRsvp, type EventDoc } from '../../models/event.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { audienceService, type Audience, type AudienceMember } from '../../core/audience/audience.service';
import { domainEvents } from '../../core/events/event-bus';

export interface EventsConfig { memberCanSeeAttendees: boolean; reminderHours: number }
export interface Actor extends AudienceMember { ownScope: boolean }
const ALL: Audience = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };
const VISIBLE = ['PUBLISHED', 'COMPLETED', 'CANCELLED'];

class EventService {
  getConfig(societyId: string): Promise<EventsConfig> { return configurationService.getSocietySetting<EventsConfig>(societyId, 'events.config'); }

  async updateConfig(societyId: string, patch: Partial<EventsConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'events.config', patch, byUserId);
    auditService.record({ action: 'events.config_updated', resource: 'SocietySetting', resourceId: 'events.config', societyId, newValue: patch, req });
    return merged;
  }

  async types(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['EVENT_TYPE']);
    return categoryService.list(societyId, 'EVENT_TYPE');
  }

  private async memberFilter(societyId: string, actor: Actor) {
    return { $and: [{ status: { $in: VISIBLE } }, await audienceService.matchFilter(societyId, actor)] };
  }

  private async withMyRsvp(actor: Actor, items: any[]) {
    if (!items.length) return items;
    const mine = await EventRsvp.find({ userId: actor.userId, eventId: { $in: items.map((e) => e._id) } }).lean();
    const byId = new Map(mine.map((r) => [String(r.eventId), r]));
    return items.map((e) => ({ ...e, id: String(e._id), myRsvp: byId.get(String(e._id)) ? { status: byId.get(String(e._id))!.status, guests: byId.get(String(e._id))!.guests, note: byId.get(String(e._id))!.note } : null }));
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }];
    if (actor.ownScope) and.push(await this.memberFilter(societyId, actor));
    else if (query.status) and.push({ status: query.status });
    if (query.upcoming) and.push({ endAt: { $gte: new Date() }, status: { $ne: 'CANCELLED' } });
    if (query.typeKey) and.push({ typeKey: String(query.typeKey).toUpperCase() });
    if (query.from || query.to) and.push({ startAt: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } });
    const rx = searchRegex(query.search);
    if (rx) and.push({ $or: [{ title: rx }, { description: rx }, { venue: rx }] });
    const page = await paginate(Event as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: query.upcoming ? 'startAt' : '-startAt', allowedSorts: ['startAt', 'createdAt', 'title', 'goingCount', 'status'], select: '-description', populate: [{ path: 'createdBy', select: 'name' }] });
    page.items = await this.withMyRsvp(actor, page.items);
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const filter = actor.ownScope ? { _id: id, societyId, ...(await this.memberFilter(societyId, actor)) } : { _id: id, societyId };
    const doc: any = await Event.findOne(filter).populate('createdBy', 'name').lean();
    if (!doc) throw Errors.notFound('Event');
    const cfg = await this.getConfig(societyId);
    const [withRsvp] = await this.withMyRsvp(actor, [doc]);
    const attendeesVisible = !actor.ownScope || cfg.memberCanSeeAttendees;
    const attendees = attendeesVisible ? await EventRsvp.find({ eventId: doc._id, status: { $in: ['GOING', 'MAYBE'] } }).populate('userId', 'name').populate('unitId', 'code').sort({ status: 1, createdAt: 1 }).limit(200).lean() : [];
    return { ...withRsvp, attendeesVisible, attendees: attendees.map((r: any) => ({ id: String(r._id), name: r.userId?.name ?? '—', unitCode: r.unitId?.code ?? null, status: r.status, guests: r.guests })), spotsLeft: doc.capacity > 0 ? Math.max(0, doc.capacity - doc.goingCount - doc.guestsCount) : null };
  }

  async create(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const audience: Audience = input.audience ?? ALL;
    const doc = new Event({ ...input, societyId, typeKey: String(input.typeKey ?? 'COMMUNITY').toUpperCase(), audience, audienceLabel: await audienceService.describe(societyId, audience), status: 'DRAFT', createdBy: byUserId });
    await doc.save();
    auditService.record({ action: 'event.created', resource: 'Event', resourceId: doc._id, societyId, newValue: { title: doc.title, startAt: doc.startAt, audience: doc.audienceLabel }, req });
    if (input.publishNow) await this.publishDoc(doc, byUserId, req);
    return this.get(societyId, String(doc._id), { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async update(societyId: string, id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await Event.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Event');
    if (['CANCELLED', 'COMPLETED'].includes(doc.status)) throw Errors.conflict(`${doc.status === 'CANCELLED' ? 'Cancelled' : 'Completed'} events cannot be edited`);
    if (patch.audience) {
      doc.set('audience', patch.audience);
      doc.audienceLabel = await audienceService.describe(societyId, patch.audience);
    }
    for (const key of ['title', 'description', 'startAt', 'endAt', 'venue', 'coverImage', 'attachments', 'capacity', 'maxGuestsPerRsvp', 'rsvpDeadline', 'allowRsvp'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.typeKey) doc.typeKey = String(patch.typeKey).toUpperCase();
    if (!dayjs(doc.endAt).isAfter(dayjs(doc.startAt))) throw Errors.validation({ endAt: ['End time must be after the start time'] });
    await doc.save();
    auditService.record({ action: 'event.updated', resource: 'Event', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  private async publishDoc(doc: EventDoc, byUserId: string, req?: any): Promise<void> {
    const societyId = String(doc.societyId);
    doc.status = 'PUBLISHED';
    doc.publishedAt = new Date();
    await doc.save();
    auditService.record({ action: 'event.published', resource: 'Event', resourceId: doc._id, societyId, req });
    domainEvents.emit('event.published', { eventId: String(doc._id), name: doc.title, startAt: doc.startAt, venue: doc.venue ?? '', userIds: await audienceService.resolveUserIds(societyId, doc.audience as any) }, { societyId, actorId: byUserId });
  }

  async publish(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Event.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Event');
    if (doc.status !== 'DRAFT') throw Errors.invalidTransition(doc.status, 'PUBLISHED', 'Event');
    await this.publishDoc(doc, byUserId, req);
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async cancel(societyId: string, id: string, reason: string | undefined, byUserId: string, req?: any) {
    const doc = await Event.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Event');
    if (!['DRAFT', 'PUBLISHED'].includes(doc.status)) throw Errors.invalidTransition(doc.status, 'CANCELLED', 'Event');
    const wasPublished = doc.status === 'PUBLISHED';
    doc.status = 'CANCELLED';
    doc.cancelledAt = new Date();
    doc.cancelReason = reason;
    await doc.save();
    auditService.record({ action: 'event.cancelled', resource: 'Event', resourceId: doc._id, societyId, newValue: { reason }, req });
    if (wasPublished) {
      const rsvps = await EventRsvp.find({ eventId: doc._id, status: { $in: ['GOING', 'MAYBE'] } }).select('userId').lean();
      domainEvents.emit('event.cancelled', { eventId: String(doc._id), name: doc.title, startAt: doc.startAt, reason: reason ?? '', userIds: [...new Set(rsvps.map((r) => String(r.userId)))] }, { societyId, actorId: byUserId });
    }
    return this.get(societyId, id, { userId: byUserId, unitIds: [], roleKeys: [], ownScope: false });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Event.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Event');
    if (doc.status !== 'DRAFT') throw Errors.conflict('Only draft events can be deleted; cancel published ones instead');
    await doc.deleteOne();
    auditService.record({ action: 'event.deleted', resource: 'Event', resourceId: doc._id, societyId, req });
  }

  private async recount(eventId: any): Promise<void> {
    const rows = await EventRsvp.aggregate([{ $match: { eventId } }, { $group: { _id: '$status', people: { $sum: 1 }, guests: { $sum: '$guests' } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r]));
    await Event.updateOne({ _id: eventId }, { $set: { goingCount: by.GOING?.people ?? 0, guestsCount: by.GOING?.guests ?? 0, maybeCount: by.MAYBE?.people ?? 0, notGoingCount: by.NOT_GOING?.people ?? 0 } });
  }

  async rsvp(societyId: string, id: string, input: { status: string; guests?: number; note?: string }, actor: Actor) {
    const doc = await Event.findOne({ _id: id, societyId, status: 'PUBLISHED' });
    if (!doc) throw Errors.notFound('Event');
    if (!doc.allowRsvp) throw Errors.conflict('RSVPs are not open for this event');
    if (doc.rsvpDeadline && dayjs().isAfter(dayjs(doc.rsvpDeadline))) throw Errors.conflict('The RSVP deadline has passed');
    if (dayjs().isAfter(dayjs(doc.endAt))) throw Errors.conflict('This event is over');
    if (actor.ownScope && !(await audienceService.includes(societyId, actor, doc.audience as any))) throw Errors.forbidden('This event is not open to you');
    const guests = input.status === 'GOING' ? Number(input.guests ?? 0) : 0;
    if (guests > doc.maxGuestsPerRsvp) throw Errors.validation({ guests: [doc.maxGuestsPerRsvp ? `At most ${doc.maxGuestsPerRsvp} guests per household` : 'Guests are not allowed for this event'] });
    if (input.status === 'GOING' && doc.capacity > 0) {
      const others = await EventRsvp.aggregate([{ $match: { eventId: doc._id, status: 'GOING', userId: { $ne: new mongoose.Types.ObjectId(actor.userId) } } }, { $group: { _id: null, people: { $sum: 1 }, guests: { $sum: '$guests' } } }]);
      const taken = (others[0]?.people ?? 0) + (others[0]?.guests ?? 0);
      if (taken + 1 + guests > doc.capacity) throw Errors.conflict(taken >= doc.capacity ? 'The event is full' : `Only ${doc.capacity - taken} spot${doc.capacity - taken === 1 ? '' : 's'} left`);
    }
    await EventRsvp.updateOne({ eventId: doc._id, userId: actor.userId }, { $set: { status: input.status, guests, note: input.note, unitId: actor.unitIds[0] ?? null }, $setOnInsert: { societyId, eventId: doc._id, userId: actor.userId } }, { upsert: true });
    await this.recount(doc._id);
    domainEvents.emit('event.rsvp', { eventId: String(doc._id), status: input.status }, { societyId, actorId: actor.userId });
    return this.get(societyId, id, actor);
  }

  async attendees(societyId: string, id: string) {
    const doc = await Event.findOne({ _id: id, societyId }).select('title goingCount guestsCount maybeCount notGoingCount capacity').lean();
    if (!doc) throw Errors.notFound('Event');
    const rows = await EventRsvp.find({ eventId: doc._id }).populate('userId', 'name email phone').populate('unitId', 'code').sort({ status: 1, createdAt: 1 }).lean();
    return { event: { ...doc, id: String(doc._id) }, rsvps: rows.map((r: any) => ({ id: String(r._id), user: r.userId, unitCode: r.unitId?.code ?? null, status: r.status, guests: r.guests, note: r.note, at: r.updatedAt })) };
  }

  async exportRows(societyId: string, id: string) {
    const { rsvps } = await this.attendees(societyId, id);
    return rsvps.map((r: any) => ({ name: r.user?.name ?? '', unit: r.unitCode ?? '', status: r.status, guests: r.guests, note: r.note ?? '', respondedAt: dayjs(r.at).format('YYYY-MM-DD HH:mm') }));
  }

  async stats(societyId: string) {
    const now = new Date();
    const [upcoming, drafts, next] = await Promise.all([
      Event.countDocuments({ societyId, status: 'PUBLISHED', endAt: { $gte: now } }),
      Event.countDocuments({ societyId, status: 'DRAFT' }),
      Event.findOne({ societyId, status: 'PUBLISHED', endAt: { $gte: now } }).sort({ startAt: 1 }).select('title startAt goingCount guestsCount capacity').lean(),
    ]);
    return { upcoming, drafts, next: next ? { ...next, id: String(next._id) } : null };
  }

  /** Sweep: past events become COMPLETED. */
  async complete(now = new Date()): Promise<number> {
    const res = await Event.updateMany({ status: 'PUBLISHED', endAt: { $lte: now } }, { $set: { status: 'COMPLETED' } });
    return res.modifiedCount;
  }
}

export const eventService = new EventService();
