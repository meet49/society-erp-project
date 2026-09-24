import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { DomesticHelp, DomesticHelpLog } from '../../models/domestic-help.model';
import { Unit } from '../../models/unit.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { maskString, randomDigits, randomToken } from '../../lib/crypto';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { storageService } from '../../core/storage/storage.service';
import { domainEvents } from '../../core/events/event-bus';

export interface HelpConfig { notifyOnEntry: boolean; requireVerificationForEntry: boolean; passcodeLength: number }
export interface Actor { userId: string; ownScope: boolean; unitIds: string[]; isGuard: boolean }

class DomesticHelpService {
  getConfig(societyId: string): Promise<HelpConfig> { return configurationService.getSocietySetting<HelpConfig>(societyId, 'domestic_help.config'); }

  async updateConfig(societyId: string, patch: Partial<HelpConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'domestic_help.config', patch, byUserId);
    auditService.record({ action: 'domestic_help.config_updated', resource: 'SocietySetting', resourceId: 'domestic_help.config', societyId, newValue: patch, req });
    return merged;
  }

  async types(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['DOMESTIC_HELP_TYPE']);
    return categoryService.list(societyId, 'DOMESTIC_HELP_TYPE');
  }

  private ownsHelp(doc: any, actor: Actor): boolean {
    return (doc.units ?? []).some((u: any) => u.active && actor.unitIds.includes(String(u.unitId?._id ?? u.unitId)));
  }

  private async present(doc: any, actor: Actor) {
    const own = this.ownsHelp(doc, actor);
    const out: any = { ...doc, id: String(doc._id), qrToken: undefined, isInside: Boolean(doc.insideSince) };
    if (own || !actor.ownScope) {
      out.qrPayload = `SERP:H:${doc.qrToken}`;
      out.shareText = `${doc.name} (${String(doc.typeKey).toLowerCase()}) - gate passcode ${doc.passcode}. Show this at the gate.`;
    } else {
      out.passcode = undefined;
      out.phone = maskString(doc.phone ?? '', 2);
    }
    if (actor.isGuard || (actor.ownScope && !own)) { out.idProof = out.idProof ? { type: out.idProof.type } : undefined; }
    if (doc.photoKey) out.photoUrl = await storageService.signedUrl(doc.photoKey, { expiresInSeconds: 600 }).catch(() => null);
    return out;
  }

  private scopeFilter(actor: Actor): Record<string, unknown> {
    return actor.ownScope ? { units: { $elemMatch: { unitId: { $in: actor.unitIds }, active: true } } } : {};
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId, deletedAt: null, ...this.scopeFilter(actor) };
    if (query.typeKey) filter.typeKey = String(query.typeKey).toUpperCase();
    if (query.status) filter.status = query.status;
    if (query.verification) filter['verification.status'] = query.verification;
    if (query.unitId) filter.units = { $elemMatch: { unitId: query.unitId, active: true } };
    if (query.insideOnly) filter.insideSince = { $ne: null };
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { phone: rx }, { passcode: rx }];
    const page = await paginate(DomesticHelp as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: 'name', allowedSorts: ['name', 'createdAt', 'status', 'lastEntryAt', 'verification.status'], populate: [{ path: 'units.unitId', select: 'code' }] });
    page.items = await Promise.all(page.items.map((d: any) => this.present(d, actor)));
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc: any = await DomesticHelp.findOne({ _id: id, societyId, deletedAt: null, ...this.scopeFilter(actor) }).populate('units.unitId', 'code').populate('verification.verifiedBy', 'name').lean();
    if (!doc) throw Errors.notFound('Domestic help');
    const logs = await DomesticHelpLog.find({ helpId: doc._id }).sort({ at: -1 }).limit(20).populate('unitId', 'code').lean();
    return { ...(await this.present(doc, actor)), recentLogs: logs.map((l: any) => ({ id: String(l._id), type: l.type, at: l.at, unitCode: l.unitId?.code ?? null })) };
  }

  private async uniquePasscode(societyId: string, length: number): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const code = randomDigits(length);
      if (!(await DomesticHelp.exists({ societyId, passcode: code }))) return code;
    }
    throw Errors.internal('Could not allocate a passcode');
  }

  /** Residents register their help; a known phone number joins the existing record (shared maids). */
  async register(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    const unitId = actor.ownScope ? (input.unitId && actor.unitIds.includes(input.unitId) ? input.unitId : actor.unitIds[0]) : input.unitId;
    if (!unitId) throw Errors.validation({ unitId: [actor.ownScope ? 'Your login is not linked to a unit' : 'Unit is required'] });
    if (!(await Unit.exists({ _id: unitId, societyId, deletedAt: null }))) throw Errors.validation({ unitId: ['Unknown unit'] });
    const types = await this.types(societyId);
    const typeKey = String(input.typeKey).toUpperCase();
    if (!types.some((t: any) => t.key === typeKey)) throw Errors.validation({ typeKey: ['Unknown help type'] });
    const cfg = await this.getConfig(societyId);
    const phone = String(input.phone).replace(/\s+/g, '');
    let doc = await DomesticHelp.findOne({ societyId, phone, deletedAt: null });
    let created = false;
    if (doc) {
      const existing: any = doc.units.find((u: any) => String(u.unitId) === String(unitId));
      if (existing) { existing.active = true; existing.schedule = input.schedule ?? existing.schedule; existing.addedBy = actor.userId; }
      else doc.units.push({ unitId, addedBy: actor.userId, schedule: input.schedule, since: new Date(), active: true } as any);
      if (doc.status === 'INACTIVE') doc.status = 'ACTIVE';
      doc.markModified('units');
    } else {
      created = true;
      doc = new DomesticHelp({ name: input.name, phone, typeKey, idProof: input.idProof, units: [{ unitId, addedBy: actor.userId, schedule: input.schedule, since: new Date(), active: true }], passcode: await this.uniquePasscode(societyId, cfg.passcodeLength ?? 6), qrToken: randomToken(24), societyId, status: 'ACTIVE', createdBy: actor.userId });
    }
    if (input.photo) doc.photoKey = (await storageService.storeDataUrl({ societyId, scope: 'domestic-help', dataUrl: input.photo, name: `${doc.name}.jpg` })).storageKey;
    await doc.save();
    auditService.record({ action: created ? 'domestic_help.registered' : 'domestic_help.linked', resource: 'DomesticHelp', resourceId: doc._id, societyId, newValue: { name: doc.name, type: typeKey, unitId }, req });
    const unit = await Unit.findById(unitId).select('code').lean();
    if (created) domainEvents.emit('domestic_help.registered', { helpId: String(doc._id), name: doc.name, typeKey, unitCode: unit?.code ?? '' }, { societyId, actorId: actor.userId });
    domainEvents.emit('operations.changed', { helpId: String(doc._id) }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  async update(societyId: string, id: string, patch: Record<string, any>, actor: Actor, req?: any) {
    const doc = await DomesticHelp.findOne({ _id: id, societyId, deletedAt: null, ...this.scopeFilter(actor) });
    if (!doc) throw Errors.notFound('Domestic help');
    if (patch.typeKey) {
      const types = await this.types(societyId);
      if (!types.some((t: any) => t.key === String(patch.typeKey).toUpperCase())) throw Errors.validation({ typeKey: ['Unknown help type'] });
      doc.typeKey = String(patch.typeKey).toUpperCase();
    }
    for (const key of ['name', 'phone', 'idProof'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.schedule !== undefined) {
      const unitId = patch.unitId ?? actor.unitIds[0];
      const eng: any = doc.units.find((u: any) => String(u.unitId) === String(unitId) && u.active);
      if (eng) { eng.schedule = patch.schedule; doc.markModified('units'); }
    }
    if (patch.photo) doc.photoKey = (await storageService.storeDataUrl({ societyId, scope: 'domestic-help', dataUrl: patch.photo, name: `${doc.name}.jpg` })).storageKey;
    await doc.save();
    auditService.record({ action: 'domestic_help.updated', resource: 'DomesticHelp', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, actor);
  }

  /** A resident stops the engagement for their unit; the record stays for other units. */
  async removeFromUnit(societyId: string, id: string, unitId: string, actor: Actor, req?: any) {
    const doc = await DomesticHelp.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Domestic help');
    if (actor.ownScope && !actor.unitIds.includes(unitId)) throw Errors.forbidden('You can only manage help for your own unit');
    const eng: any = doc.units.find((u: any) => String(u.unitId) === unitId && u.active);
    if (!eng) throw Errors.notFound('Engagement');
    eng.active = false;
    doc.markModified('units');
    if (!doc.units.some((u: any) => u.active)) doc.status = 'INACTIVE';
    await doc.save();
    auditService.record({ action: 'domestic_help.unlinked', resource: 'DomesticHelp', resourceId: doc._id, societyId, newValue: { unitId }, req });
    domainEvents.emit('operations.changed', { helpId: String(doc._id) }, { societyId, actorId: actor.userId });
    return { ok: true, status: doc.status };
  }

  async verify(societyId: string, id: string, input: { status: 'VERIFIED' | 'REJECTED'; note?: string; policeVerificationKey?: string }, byUserId: string, req?: any) {
    const doc = await DomesticHelp.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Domestic help');
    if (input.policeVerificationKey) storageService.assertOwned(input.policeVerificationKey, societyId);
    doc.set('verification', { status: input.status, verifiedAt: new Date(), verifiedBy: byUserId, note: input.note, policeVerificationKey: input.policeVerificationKey ?? doc.verification?.policeVerificationKey });
    await doc.save();
    auditService.record({ action: `domestic_help.${input.status.toLowerCase()}`, resource: 'DomesticHelp', resourceId: doc._id, societyId, newValue: { note: input.note }, req });
    domainEvents.emit('domestic_help.verified', { helpId: String(doc._id), name: doc.name, status: input.status, unitIds: doc.units.filter((u: any) => u.active).map((u: any) => String(u.unitId)) }, { societyId, actorId: byUserId });
    return this.get(societyId, id, { userId: byUserId, ownScope: false, unitIds: [], isGuard: false });
  }

  async setBlocked(societyId: string, id: string, blocked: boolean, reason: string | undefined, byUserId: string, req?: any) {
    const doc = await DomesticHelp.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Domestic help');
    doc.status = blocked ? 'BLOCKED' : doc.units.some((u: any) => u.active) ? 'ACTIVE' : 'INACTIVE';
    doc.blockedReason = blocked ? reason : undefined;
    await doc.save();
    auditService.record({ action: blocked ? 'domestic_help.blocked' : 'domestic_help.unblocked', resource: 'DomesticHelp', resourceId: doc._id, societyId, newValue: { reason }, req });
    domainEvents.emit('operations.changed', { helpId: String(doc._id) }, { societyId, actorId: byUserId });
    return this.get(societyId, id, { userId: byUserId, ownScope: false, unitIds: [], isGuard: false });
  }

  /** Gate lookup by passcode or QR payload. */
  async lookup(societyId: string, code: string) {
    const raw = code.trim();
    const token = raw.startsWith('SERP:H:') ? raw.slice(7) : null;
    const doc: any = await DomesticHelp.findOne({ societyId, deletedAt: null, ...(token ? { qrToken: token } : { passcode: raw }) }).populate('units.unitId', 'code').lean();
    if (!doc) return { found: false, allowed: false, reason: 'No domestic help matches this code' };
    const cfg = await this.getConfig(societyId);
    const active = doc.units.filter((u: any) => u.active);
    let reason: string | null = null;
    if (doc.status === 'BLOCKED') reason = `Blocked: ${doc.blockedReason ?? 'contact the office'}`;
    else if (doc.status !== 'ACTIVE' || !active.length) reason = 'Not engaged by any unit right now';
    else if (cfg.requireVerificationForEntry && doc.verification?.status !== 'VERIFIED') reason = 'Verification pending - entry needs office approval';
    return { found: true, allowed: !reason, reason, help: { id: String(doc._id), name: doc.name, typeKey: doc.typeKey, phone: maskString(doc.phone ?? '', 2), photoUrl: doc.photoKey ? await storageService.signedUrl(doc.photoKey, { expiresInSeconds: 600 }).catch(() => null) : null, verification: doc.verification?.status ?? 'PENDING', isInside: Boolean(doc.insideSince), units: active.map((u: any) => ({ id: String(u.unitId?._id ?? u.unitId), code: u.unitId?.code ?? '', schedule: u.schedule })) } };
  }

  async punch(societyId: string, id: string, type: 'IN' | 'OUT', input: { gateId?: string; unitId?: string; clientRef?: string }, byUserId: string, req?: any) {
    if (input.clientRef) {
      const dup = await DomesticHelpLog.findOne({ societyId, clientRef: input.clientRef }).lean();
      if (dup) return { ...dup, id: String(dup._id), replayed: true };
    }
    const doc = await DomesticHelp.findOne({ _id: id, societyId, deletedAt: null });
    if (!doc) throw Errors.notFound('Domestic help');
    if (type === 'IN') {
      const check = await this.lookup(societyId, doc.passcode);
      if (!check.allowed) throw Errors.conflict(check.reason ?? 'Entry not allowed');
    }
    const unitId = input.unitId ?? (doc.units.find((u: any) => u.active) as any)?.unitId ?? null;
    const log = await DomesticHelpLog.create({ societyId, helpId: doc._id, unitId, type, at: new Date(), gateId: input.gateId ?? null, byUserId, clientRef: input.clientRef ?? null });
    doc.lastEntryAt = type === 'IN' ? log.at : doc.lastEntryAt;
    doc.insideSince = type === 'IN' ? log.at : null;
    await doc.save();
    const cfg = await this.getConfig(societyId);
    if (cfg.notifyOnEntry) domainEvents.emit('domestic_help.entry', { helpId: String(doc._id), name: doc.name, type, at: log.at, unitIds: doc.units.filter((u: any) => u.active).map((u: any) => String(u.unitId)) }, { societyId, actorId: byUserId });
    domainEvents.emit('operations.changed', { helpId: String(doc._id), gate: true }, { societyId, actorId: byUserId });
    void req;
    return { ...log.toJSON(), replayed: false, help: { id: String(doc._id), name: doc.name } };
  }

  async logs(societyId: string, query: Record<string, any>, actor: Actor) {
    const filter: Record<string, unknown> = { societyId };
    if (actor.ownScope) {
      const own = await DomesticHelp.find({ societyId, deletedAt: null, ...this.scopeFilter(actor) }).select('_id').lean();
      filter.helpId = { $in: own.map((h) => h._id) };
    }
    if (query.helpId) filter.helpId = query.helpId;
    if (query.unitId) filter.unitId = query.unitId;
    if (query.date) filter.at = { $gte: dayjs(query.date).startOf('day').toDate(), $lte: dayjs(query.date).endOf('day').toDate() };
    return paginate(DomesticHelpLog as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-at', allowedSorts: ['at'], populate: [{ path: 'helpId', select: 'name typeKey' }, { path: 'unitId', select: 'code' }, { path: 'gateId', select: 'name' }] });
  }

  async stats(societyId: string) {
    const sid = new mongoose.Types.ObjectId(societyId);
    const [active, pending, inside, entriesToday, byType] = await Promise.all([
      DomesticHelp.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE' }),
      DomesticHelp.countDocuments({ societyId, deletedAt: null, status: 'ACTIVE', 'verification.status': 'PENDING' }),
      DomesticHelp.countDocuments({ societyId, deletedAt: null, insideSince: { $ne: null } }),
      DomesticHelpLog.countDocuments({ societyId, type: 'IN', at: { $gte: dayjs().startOf('day').toDate() } }),
      DomesticHelp.aggregate([{ $match: { societyId: sid, deletedAt: null, status: 'ACTIVE' } }, { $group: { _id: '$typeKey', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    ]);
    return { active, pendingVerification: pending, insideNow: inside, entriesToday, byType: byType.map((t) => ({ type: t._id, count: t.n })) };
  }
}

export const domesticHelpService = new DomesticHelpService();
