import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { Document, DocumentFolder } from '../../models/document.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { categoryService } from '../../core/categories/category.service';
import { storageService } from '../../core/storage/storage.service';
import { workflowService } from '../../core/workflows/workflow.service';
import { limitService } from '../../core/limits/limit.service';
import { domainEvents } from '../../core/events/event-bus';

export interface DocumentsConfig { memberVisibleCategories: string[]; signedUrlMinutes: number; expiryReminderDays: number; requireApprovalForStaffUploads: boolean }
/**
 * `level` is what the caller may browse: ADMIN (society admins), COMMITTEE (staff / committee) or
 * MEMBERS (residents). Residents additionally see UNIT documents of their own units.
 */
export interface Actor { userId: string; level: 'ADMIN' | 'COMMITTEE' | 'MEMBERS'; unitIds: string[]; canApprove: boolean }
type WorkflowUser = { userId: string; roleKeys: string[]; permissions: Set<string> };

const RANK: Record<string, number> = { ADMIN: 3, COMMITTEE: 2, MEMBERS: 1, UNIT: 1 };

class DocumentService {
  getConfig(societyId: string): Promise<DocumentsConfig> { return configurationService.getSocietySetting<DocumentsConfig>(societyId, 'documents.config'); }

  async updateConfig(societyId: string, patch: Partial<DocumentsConfig>, byUserId: string, req?: any) {
    const merged = await configurationService.setSocietySetting(societyId, 'documents.config', patch, byUserId);
    auditService.record({ action: 'documents.config_updated', resource: 'SocietySetting', resourceId: 'documents.config', societyId, newValue: patch, req });
    return merged;
  }

  async categories(societyId: string) {
    await categoryService.ensureDefaults(societyId, undefined, ['DOCUMENT_CATEGORY']);
    return categoryService.list(societyId, 'DOCUMENT_CATEGORY');
  }

  /** Visibility levels the caller can see (ADMIN sees everything). */
  private visibleLevels(actor: Actor): string[] {
    if (actor.level === 'ADMIN') return ['ADMIN', 'COMMITTEE', 'MEMBERS', 'UNIT'];
    if (actor.level === 'COMMITTEE') return ['COMMITTEE', 'MEMBERS', 'UNIT'];
    return ['MEMBERS', 'UNIT'];
  }

  private async scopeFilter(societyId: string, actor: Actor): Promise<Record<string, unknown>> {
    if (actor.level === 'ADMIN') return {};
    const levels = this.visibleLevels(actor);
    const or: Record<string, unknown>[] = [{ visibility: { $in: levels.filter((l) => l !== 'UNIT') } }];
    if (actor.unitIds.length) or.push({ visibility: 'UNIT', unitIds: { $in: actor.unitIds } });
    if (actor.level === 'MEMBERS') {
      const cfg = await this.getConfig(societyId);
      return { $and: [{ $or: or }, { status: 'ACTIVE' }, { $or: [{ visibility: 'UNIT' }, { categoryKey: { $in: cfg.memberVisibleCategories.map((c) => c.toUpperCase()) } }] }] };
    }
    return { $or: or };
  }

  // ------------------------------------------------------------------ folders
  async folders(societyId: string, actor: Actor) {
    const levels = this.visibleLevels(actor);
    const rows = await DocumentFolder.find({ societyId, ...(actor.level === 'ADMIN' ? {} : { visibility: { $in: levels } }) }).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await Document.aggregate([{ $match: { societyId: new mongoose.Types.ObjectId(societyId), status: { $ne: 'ARCHIVED' } } }, { $group: { _id: '$folderId', n: { $sum: 1 } } }]);
    const byFolder = new Map(counts.map((c) => [String(c._id), c.n]));
    return rows.map((f) => ({ ...f, id: String(f._id), documentCount: byFolder.get(String(f._id)) ?? 0 }));
  }

  async createFolder(societyId: string, input: Record<string, any>, byUserId: string, req?: any) {
    if (input.parentId && !(await DocumentFolder.exists({ _id: input.parentId, societyId }))) throw Errors.validation({ parentId: ['Unknown folder'] });
    if (await DocumentFolder.exists({ societyId, parentId: input.parentId ?? null, name: input.name })) throw Errors.conflict('A folder with that name already exists here');
    const doc = await DocumentFolder.create({ ...input, parentId: input.parentId ?? null, societyId, createdBy: byUserId });
    auditService.record({ action: 'document.folder_created', resource: 'DocumentFolder', resourceId: doc._id, societyId, newValue: { name: doc.name }, req });
    return { ...doc.toJSON(), id: String(doc._id), documentCount: 0 };
  }

  async updateFolder(societyId: string, id: string, patch: Record<string, any>, req?: any) {
    const doc = await DocumentFolder.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Folder');
    if (patch.parentId !== undefined) {
      if (patch.parentId === id) throw Errors.validation({ parentId: ['A folder cannot contain itself'] });
      doc.parentId = patch.parentId ?? null;
    }
    for (const key of ['name', 'visibility', 'sortOrder'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    await doc.save();
    auditService.record({ action: 'document.folder_updated', resource: 'DocumentFolder', resourceId: doc._id, societyId, newValue: patch, req });
    return doc.toJSON();
  }

  async removeFolder(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await DocumentFolder.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Folder');
    const [docs, children] = await Promise.all([Document.countDocuments({ societyId, folderId: doc._id }), DocumentFolder.countDocuments({ societyId, parentId: doc._id })]);
    if (docs || children) throw Errors.conflict('Move or delete the contents of this folder first');
    await doc.deleteOne();
    auditService.record({ action: 'document.folder_deleted', resource: 'DocumentFolder', resourceId: doc._id, societyId, req });
  }

  // ------------------------------------------------------------------ documents
  private present(doc: any, actor: Actor) {
    const { storageKey: _k, versions, ...rest } = doc;
    return { ...rest, id: String(doc._id), versions: (versions ?? []).map((v: any) => ({ version: v.version, name: v.name, size: v.size, mimeType: v.mimeType, uploadedAt: v.uploadedAt, uploadedBy: v.uploadedBy, note: v.note })), canEdit: actor.level !== 'MEMBERS' };
  }

  async list(societyId: string, query: Record<string, any>, actor: Actor) {
    const and: Record<string, unknown>[] = [{ societyId }, await this.scopeFilter(societyId, actor)];
    if (query.folderId) and.push({ folderId: query.folderId === 'root' ? null : query.folderId });
    if (query.categoryKey) and.push({ categoryKey: String(query.categoryKey).toUpperCase() });
    if (query.status && actor.level !== 'MEMBERS') and.push({ status: query.status });
    else if (!query.search && actor.level !== 'MEMBERS' && !query.status) and.push({ status: { $ne: 'ARCHIVED' } });
    if (query.visibility) and.push({ visibility: query.visibility });
    if (query.tag) and.push({ tags: String(query.tag).toLowerCase() });
    if (query.pinnedOnly) and.push({ isPinned: true });
    if (query.expiringOnly) and.push({ expiresAt: { $ne: null, $lte: dayjs().add(60, 'day').toDate() } });
    const rx = searchRegex(query.search);
    if (rx) and.push({ $or: [{ title: rx }, { description: rx }, { name: rx }, { tags: rx }] });
    const page = await paginate(Document as any, { $and: and }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-isPinned,-createdAt', allowedSorts: ['isPinned', 'createdAt', 'title', 'expiresAt', 'size', 'downloadCount', 'categoryKey'], populate: [{ path: 'uploadedBy', select: 'name' }, { path: 'folderId', select: 'name' }] });
    page.items = page.items.map((d: any) => this.present(d, actor));
    return page;
  }

  async get(societyId: string, id: string, actor: Actor) {
    const doc: any = await Document.findOne({ $and: [{ _id: id, societyId }, await this.scopeFilter(societyId, actor)] }).populate('uploadedBy', 'name').populate('folderId', 'name').populate('versions.uploadedBy', 'name').populate('archivedBy', 'name').lean();
    if (!doc) throw Errors.notFound('Document');
    const workflow = doc.workflowInstanceId ? await workflowService.instanceFor(societyId, 'Document', doc._id) : null;
    return { ...this.present(doc, actor), workflow };
  }

  private async assertVisibility(actor: Actor, visibility: string) {
    if (RANK[visibility] > RANK[actor.level]) throw Errors.forbidden(`You cannot publish documents at ${visibility.toLowerCase()} level`);
  }

  async create(societyId: string, input: Record<string, any>, actor: Actor, req?: any) {
    storageService.assertOwned(input.file.storageKey, societyId);
    await this.assertVisibility(actor, input.visibility ?? 'COMMITTEE');
    if (input.folderId && !(await DocumentFolder.exists({ _id: input.folderId, societyId }))) throw Errors.validation({ folderId: ['Unknown folder'] });
    await limitService.assertWithinLimit(societyId, 'maxDocuments');
    const cfg = await this.getConfig(societyId);
    const doc = new Document({
      ...input,
      societyId,
      categoryKey: String(input.categoryKey ?? 'OTHER').toUpperCase(),
      tags: (input.tags ?? []).map((t: string) => t.toLowerCase()),
      folderId: input.folderId ?? null,
      storageKey: input.file.storageKey,
      name: input.file.name,
      mimeType: input.file.mimeType,
      size: input.file.size ?? 0,
      version: 1,
      versions: [{ version: 1, storageKey: input.file.storageKey, name: input.file.name, mimeType: input.file.mimeType, size: input.file.size ?? 0, uploadedBy: actor.userId, uploadedAt: new Date() }],
      status: 'ACTIVE',
      uploadedBy: actor.userId,
    });
    const needsReview = actor.level !== 'ADMIN' && cfg.requireApprovalForStaffUploads;
    if (needsReview) doc.status = 'PENDING_APPROVAL';
    await doc.save();
    auditService.record({ action: 'document.uploaded', resource: 'Document', resourceId: doc._id, societyId, newValue: { title: doc.title, category: doc.categoryKey, visibility: doc.visibility, size: doc.size, status: doc.status }, req });
    if (needsReview) {
      const wf = await workflowService.start({ societyId, key: 'document_approval', entityType: 'Document', entityId: doc._id, context: { title: doc.title, categoryKey: doc.categoryKey, visibility: doc.visibility, name: doc.name, uploadedBy: actor.userId }, startedBy: actor.userId });
      if (wf.autoApproved) await this.applyWorkflowOutcome(societyId, doc._id, 'APPROVED', null, 'No review workflow active');
      else { doc.workflowInstanceId = wf.instance!._id as any; await doc.save(); }
    }
    domainEvents.emit('document.uploaded', { documentId: String(doc._id), title: doc.title, status: doc.status, visibility: doc.visibility }, { societyId, actorId: actor.userId });
    return this.get(societyId, String(doc._id), actor);
  }

  async update(societyId: string, id: string, patch: Record<string, any>, actor: Actor, req?: any) {
    const doc = await Document.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Document');
    if (patch.visibility) await this.assertVisibility(actor, patch.visibility);
    if (patch.folderId && !(await DocumentFolder.exists({ _id: patch.folderId, societyId }))) throw Errors.validation({ folderId: ['Unknown folder'] });
    for (const key of ['title', 'description', 'visibility', 'unitIds', 'expiresAt', 'isPinned'] as const) if (patch[key] !== undefined) doc.set(key, patch[key]);
    if (patch.folderId !== undefined) doc.folderId = patch.folderId ?? null;
    if (patch.categoryKey) doc.categoryKey = String(patch.categoryKey).toUpperCase();
    if (patch.tags) doc.tags = patch.tags.map((t: string) => t.toLowerCase());
    await doc.save();
    auditService.record({ action: 'document.updated', resource: 'Document', resourceId: doc._id, societyId, newValue: Object.keys(patch), req });
    return this.get(societyId, id, actor);
  }

  async addVersion(societyId: string, id: string, input: { file: any; note?: string }, actor: Actor, req?: any) {
    const doc = await Document.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Document');
    if (doc.status === 'ARCHIVED') throw Errors.conflict('Archived documents cannot be updated');
    storageService.assertOwned(input.file.storageKey, societyId);
    doc.version += 1;
    doc.versions.push({ version: doc.version, storageKey: input.file.storageKey, name: input.file.name, mimeType: input.file.mimeType, size: input.file.size ?? 0, uploadedBy: actor.userId, uploadedAt: new Date(), note: input.note } as any);
    doc.storageKey = input.file.storageKey;
    doc.name = input.file.name;
    doc.mimeType = input.file.mimeType;
    doc.size = input.file.size ?? 0;
    await doc.save();
    auditService.record({ action: 'document.version_added', resource: 'Document', resourceId: doc._id, societyId, newValue: { version: doc.version, name: doc.name }, req });
    return this.get(societyId, id, actor);
  }

  /** Short-lived signed URL for the current (or an older) version; counts as a download. */
  async downloadUrl(societyId: string, id: string, actor: Actor, version?: number, req?: any) {
    const doc: any = await Document.findOne({ $and: [{ _id: id, societyId }, await this.scopeFilter(societyId, actor)] }).lean();
    if (!doc) throw Errors.notFound('Document');
    if (doc.status !== 'ACTIVE' && actor.level === 'MEMBERS') throw Errors.notFound('Document');
    const v = version ? doc.versions.find((x: any) => x.version === version) : null;
    const key = v?.storageKey ?? doc.storageKey;
    const name = v?.name ?? doc.name;
    storageService.assertOwned(key, societyId);
    const cfg = await this.getConfig(societyId);
    const url = await storageService.signedUrl(key, { expiresInSeconds: cfg.signedUrlMinutes * 60, fileName: name });
    await Document.updateOne({ _id: doc._id }, { $inc: { downloadCount: 1 } });
    auditService.record({ action: 'document.downloaded', resource: 'Document', resourceId: doc._id, societyId, metadata: { version: v?.version ?? doc.version }, req });
    return { url, name, mimeType: v?.mimeType ?? doc.mimeType, expiresInMinutes: cfg.signedUrlMinutes };
  }

  async archive(societyId: string, id: string, byUserId: string, req?: any) {
    const doc = await Document.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Document');
    doc.status = 'ARCHIVED';
    doc.archivedAt = new Date();
    doc.archivedBy = byUserId as any;
    doc.isPinned = false;
    await doc.save();
    auditService.record({ action: 'document.archived', resource: 'Document', resourceId: doc._id, societyId, req });
    return this.get(societyId, id, { userId: byUserId, level: 'ADMIN', unitIds: [], canApprove: true });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const doc = await Document.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Document');
    await doc.deleteOne();
    for (const v of doc.versions) await storageService.remove(v.storageKey);
    if (!doc.versions.some((v) => v.storageKey === doc.storageKey)) await storageService.remove(doc.storageKey);
    if (doc.workflowInstanceId) await workflowService.cancel(societyId, 'Document', doc._id);
    auditService.record({ action: 'document.deleted', resource: 'Document', resourceId: doc._id, societyId, newValue: { title: doc.title }, req });
  }

  async applyWorkflowOutcome(societyId: string, documentId: any, status: 'APPROVED' | 'REJECTED', byUserId: string | null, note?: string): Promise<void> {
    const doc = await Document.findOneAndUpdate({ _id: documentId, societyId, status: 'PENDING_APPROVAL' }, { $set: { status: status === 'APPROVED' ? 'ACTIVE' : 'REJECTED', reviewNote: note } }, { new: true });
    if (!doc) return;
    auditService.record({ action: status === 'APPROVED' ? 'document.approved' : 'document.rejected', resource: 'Document', resourceId: doc._id, societyId, actor: byUserId ? { id: byUserId } : undefined, newValue: { note } });
    domainEvents.emit('document.reviewed', { documentId: String(doc._id), title: doc.title, status: doc.status, note: note ?? '', uploadedBy: doc.uploadedBy ? String(doc.uploadedBy) : null }, { societyId, actorId: byUserId });
  }

  async review(societyId: string, id: string, input: { decision: 'APPROVED' | 'REJECTED'; note?: string }, user: WorkflowUser, req?: any) {
    const doc = await Document.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Document');
    if (doc.status !== 'PENDING_APPROVAL') throw Errors.invalidTransition(doc.status, input.decision, 'Document');
    if (doc.workflowInstanceId) {
      const instance = await workflowService.decide(societyId, String(doc.workflowInstanceId), user, input.decision, input.note, req);
      if (instance.status === 'APPROVED' || instance.status === 'REJECTED') await this.applyWorkflowOutcome(societyId, doc._id, instance.status, user.userId, input.note);
    } else await this.applyWorkflowOutcome(societyId, doc._id, input.decision, user.userId, input.note);
    return this.get(societyId, id, { userId: user.userId, level: 'ADMIN', unitIds: [], canApprove: true });
  }

  async stats(societyId: string) {
    const now = new Date();
    const sid = new mongoose.Types.ObjectId(societyId);
    const [total, pending, expiring, expired, sizeAgg, byCategory, limits] = await Promise.all([
      Document.countDocuments({ societyId, status: 'ACTIVE' }),
      Document.countDocuments({ societyId, status: 'PENDING_APPROVAL' }),
      Document.countDocuments({ societyId, status: 'ACTIVE', expiresAt: { $gt: now, $lte: dayjs().add(60, 'day').toDate() } }),
      Document.countDocuments({ societyId, status: 'ACTIVE', expiresAt: { $ne: null, $lte: now } }),
      Document.aggregate([{ $match: { societyId: sid, status: { $ne: 'ARCHIVED' } } }, { $group: { _id: null, size: { $sum: '$size' } } }]),
      Document.aggregate([{ $match: { societyId: sid, status: 'ACTIVE' } }, { $group: { _id: '$categoryKey', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      limitService.getLimitsWithUsage(societyId).catch(() => [] as { key: string; limit: number | null }[]),
    ]);
    const sizeMb = Math.round(((sizeAgg[0]?.size ?? 0) / (1024 * 1024)) * 100) / 100;
    return { total, pending, expiring, expired, sizeMb, storageLimitMb: limits.find((l) => l.key === 'maxStorageMb')?.limit ?? null, byCategory: byCategory.map((c) => ({ category: c._id, count: c.n })) };
  }

  /** Sweep helper: documents expiring within the configured window (used by the reminder job). */
  async expiring(societyId: string, days: number) {
    return Document.find({ societyId, status: 'ACTIVE', expiresAt: { $gt: new Date(), $lte: dayjs().add(days, 'day').toDate() } }).select('title expiresAt categoryKey').lean();
  }
}

export const documentService = new DocumentService();
