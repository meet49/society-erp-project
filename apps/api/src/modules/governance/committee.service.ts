import { CommitteeMember } from '../../models/committee.model';
import { Membership } from '../../models/membership.model';
import { Errors } from '../../lib/errors';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { domainEvents } from '../../core/events/event-bus';

export interface HandoverState { active: boolean; startedAt: string | null; startedBy: string | null; note: string; checklist: { key: string; label: string; done: boolean; doneAt: string | null }[]; completedAt: string | null }
export interface GovernanceConfig { handover: HandoverState; showCommitteeToMembers: boolean }

const DEFAULT_CHECKLIST = ['Bank signatories updated', 'Accounts closed and audited up to the handover date', 'Society registers and documents handed over', 'Vendor contracts and AMC papers handed over', 'Keys, assets and inventory verified', 'Login credentials rotated for outgoing members'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

class CommitteeService {
  getConfig(societyId: string): Promise<GovernanceConfig> { return configurationService.getSocietySetting<GovernanceConfig>(societyId, 'governance.config'); }

  async positions(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['COMMITTEE_POSITION']);
    return categoryService.list(societyId, 'COMMITTEE_POSITION');
  }

  private present(row: any, positions: any[], forMembers: boolean) {
    const position = positions.find((p) => p.key === row.positionKey);
    const out: any = { ...row, id: String(row._id), positionName: position?.name ?? row.positionKey, unitCode: row.unitId?.code ?? null };
    if (forMembers && !row.showContactToMembers) { out.phone = undefined; out.email = undefined; }
    if (forMembers) out.notes = undefined;
    return out;
  }

  async list(societyId: string, opts: { status?: string; forMembers: boolean }) {
    const positions = await this.positions(societyId);
    const rows = await CommitteeMember.find({ societyId, status: opts.status ?? { $in: ['ACTIVE', 'INCOMING'] } }).populate('userId', 'name').populate('unitId', 'code').sort({ status: 1, sortOrder: 1, createdAt: 1 }).lean();
    const order = new Map(positions.map((p: any, i: number) => [p.key, i]));
    return rows.sort((a, b) => (a.status === b.status ? (order.get(a.positionKey) ?? 99) - (order.get(b.positionKey) ?? 99) || a.sortOrder - b.sortOrder : a.status === 'ACTIVE' ? -1 : 1)).map((r) => this.present(r, positions, opts.forMembers));
  }

  async add(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    const positions = await this.positions(societyId);
    if (!positions.some((p: any) => p.key === String(input.positionKey).toUpperCase())) throw Errors.validation({ positionKey: ['Unknown position'] });
    if (input.userId && !(await Membership.exists({ societyId, userId: input.userId, status: 'ACTIVE' }))) throw Errors.validation({ userId: ['That person is not a member of this society'] });
    const doc = await CommitteeMember.create({ ...input, email: input.email || undefined, positionKey: String(input.positionKey).toUpperCase(), societyId, createdBy: byUserId });
    auditService.record({ action: 'committee.member_added', resource: 'CommitteeMember', resourceId: doc._id, societyId, newValue: { name: doc.name, position: doc.positionKey, status: doc.status }, req });
    domainEvents.emit('governance.changed', { committee: true }, { societyId, actorId: byUserId });
    return this.present(await CommitteeMember.findById(doc._id).populate('userId', 'name').populate('unitId', 'code').lean(), positions, false);
  }

  async update(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const doc = await CommitteeMember.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Committee member');
    const positions = await this.positions(societyId);
    if (patch.positionKey) {
      if (!positions.some((p: any) => p.key === String(patch.positionKey).toUpperCase())) throw Errors.validation({ positionKey: ['Unknown position'] });
      doc.positionKey = String(patch.positionKey).toUpperCase();
    }
    for (const key of ['userId', 'residentId', 'unitId', 'name', 'phone', 'showContactToMembers', 'termStart', 'termEnd', 'status', 'sortOrder', 'notes'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.email !== undefined) doc.email = patch.email || undefined;
    await doc.save();
    auditService.record({ action: 'committee.member_updated', resource: 'CommitteeMember', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.present(await CommitteeMember.findById(doc._id).populate('userId', 'name').populate('unitId', 'code').lean(), positions, false);
  }

  /** Ends the term (kept for history) rather than deleting. */
  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await CommitteeMember.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Committee member');
    if (doc.status === 'INCOMING') await doc.deleteOne();
    else { doc.status = 'ENDED'; doc.termEnd = doc.termEnd ?? new Date(); await doc.save(); }
    auditService.record({ action: 'committee.member_removed', resource: 'CommitteeMember', resourceId: doc._id, societyId, req });
  }

  async overview(societyId: string, forMembers: boolean) {
    const [cfg, positions, members] = await Promise.all([this.getConfig(societyId), this.positions(societyId), this.list(societyId, { forMembers })]);
    const active = members.filter((m: any) => m.status === 'ACTIVE');
    const filled = new Set(active.map((m: any) => m.positionKey));
    return { members: active, incoming: members.filter((m: any) => m.status === 'INCOMING'), vacantPositions: positions.filter((p: any) => !filled.has(p.key) && !p.metadata?.multiple).map((p: any) => ({ key: p.key, name: p.name })), handover: forMembers ? { active: cfg.handover?.active ?? false } : cfg.handover, positions: positions.map((p: any) => ({ key: p.key, name: p.name })) };
  }

  // ------------------------------------------------------------------ handover
  async startHandover(societyId: string, input: { note?: string; checklist?: string[] }, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    if (cfg.handover?.active) throw Errors.conflict('A handover is already in progress');
    const labels = input.checklist?.length ? input.checklist : DEFAULT_CHECKLIST;
    const handover: HandoverState = { active: true, startedAt: new Date().toISOString(), startedBy: byUserId, note: input.note ?? '', checklist: labels.map((label) => ({ key: slug(label), label, done: false, doneAt: null })), completedAt: null };
    await configurationService.setSocietySetting(societyId, 'governance.config', { handover }, byUserId);
    auditService.record({ action: 'committee.handover_started', resource: 'Society', resourceId: societyId, societyId, newValue: { note: input.note, items: handover.checklist.length }, req });
    domainEvents.emit('committee.handover', { status: 'started', note: input.note ?? '' }, { societyId, actorId: byUserId });
    return this.overview(societyId, false);
  }

  async tickHandover(societyId: string, key: string, done: boolean, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    if (!cfg.handover?.active) throw Errors.conflict('No handover in progress');
    const item = cfg.handover.checklist.find((c) => c.key === key);
    if (!item) throw Errors.notFound('Checklist item');
    item.done = done;
    item.doneAt = done ? new Date().toISOString() : null;
    await configurationService.setSocietySetting(societyId, 'governance.config', { handover: cfg.handover }, byUserId);
    auditService.record({ action: 'committee.handover_item', resource: 'Society', resourceId: societyId, societyId, newValue: { key, done }, req });
    return this.overview(societyId, false);
  }

  /** Completes the handover: outgoing members' terms end, incoming members take office. */
  async completeHandover(societyId: string, input: { termStart?: Date; termEnd?: Date | null; note?: string }, byUserId: string, req?: any) {
    const cfg = await this.getConfig(societyId);
    if (!cfg.handover?.active) throw Errors.conflict('No handover in progress');
    const pending = cfg.handover.checklist.filter((c) => !c.done);
    if (pending.length) throw Errors.conflict(`Finish the checklist first: ${pending.map((p) => p.label).join(', ')}`, { pending: pending.map((p) => p.key) });
    const incoming = await CommitteeMember.countDocuments({ societyId, status: 'INCOMING' });
    if (!incoming) throw Errors.conflict('Add the incoming committee members before completing the handover');
    const now = new Date();
    await CommitteeMember.updateMany({ societyId, status: 'ACTIVE' }, { $set: { status: 'ENDED', termEnd: now } });
    await CommitteeMember.updateMany({ societyId, status: 'INCOMING' }, { $set: { status: 'ACTIVE', termStart: input.termStart ?? now, termEnd: input.termEnd ?? null } });
    const handover: HandoverState = { ...cfg.handover, active: false, completedAt: now.toISOString(), note: input.note ?? cfg.handover.note };
    await configurationService.setSocietySetting(societyId, 'governance.config', { handover }, byUserId);
    auditService.record({ action: 'committee.handover_completed', resource: 'Society', resourceId: societyId, societyId, newValue: { incoming, note: input.note }, req });
    domainEvents.emit('committee.handover', { status: 'completed', note: input.note ?? '' }, { societyId, actorId: byUserId });
    return this.overview(societyId, false);
  }
}

export const committeeService = new CommitteeService();
