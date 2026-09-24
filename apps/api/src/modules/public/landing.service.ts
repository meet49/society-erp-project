import { LandingSection } from '../../models/landing-section.model';
import { Errors } from '../../lib/errors';
import { configCache, invalidationBus } from '../../lib/cache';
import { configurationService } from '../../core/configuration/configuration.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { auditService } from '../../core/audit/audit.service';
import { planService } from '../platform/plans.service';
import { DEFAULT_LANDING_SECTIONS } from '../../seed/data/landing-sections';

const EDITABLE = ['title', 'subtitle', 'description', 'content', 'image', 'icon', 'cta', 'metadata', 'isVisible'] as const;

class LandingService {
  async ensureDefaults(): Promise<void> {
    const count = await LandingSection.countDocuments();
    if (count > 0) return;
    await LandingSection.insertMany(DEFAULT_LANDING_SECTIONS.map((s) => ({ ...s, isPublished: true, publishedAt: new Date(), isVisible: true })));
    await this.invalidate();
  }

  /** Public payload: published, visible sections + public settings + plans + module catalogue. */
  async publicPage(page = 'home') {
    return configCache.getOrSet(`config:landing:${page}`, async () => {
      const [sections, settings, plans, modules] = await Promise.all([
        LandingSection.find({ page, isPublished: true, isVisible: true }).sort({ sortOrder: 1 }).lean(),
        configurationService.getPublicPlatformSettings(),
        planService.publicPlans(),
        moduleEngine.getGlobalModules('SOCIETY'),
      ]);
      return {
        page,
        sections: sections.map((s) => ({ id: String(s._id), type: s.type, key: s.key, title: s.title, subtitle: s.subtitle, description: s.description, content: s.content, image: s.image, icon: s.icon, cta: s.cta, metadata: s.metadata, sortOrder: s.sortOrder })),
        settings,
        plans,
        modules: modules.filter((m) => m.status !== 'INACTIVE').map((m) => ({ key: m.key, name: m.name, description: m.description, icon: m.icon, category: m.category })),
      };
    }, 60_000);
  }

  /** Preview payload for the CMS: draft values take precedence, hidden/unpublished included with flags. */
  async previewPage(page = 'home') {
    const [sections, settings, plans, modules] = await Promise.all([
      LandingSection.find({ page }).sort({ sortOrder: 1 }).lean(),
      configurationService.getPublicPlatformSettings(),
      planService.publicPlans(),
      moduleEngine.getGlobalModules('SOCIETY'),
    ]);
    return {
      page,
      sections: sections.map((s) => ({ ...(s.draft ? { ...s, ...(s.draft as object) } : s), id: String(s._id), hasDraft: Boolean(s.draft) })),
      settings,
      plans,
      modules: modules.filter((m) => m.status !== 'INACTIVE').map((m) => ({ key: m.key, name: m.name, description: m.description, icon: m.icon, category: m.category })),
    };
  }

  async list(page?: string) {
    const docs = await LandingSection.find(page ? { page } : {}).sort({ page: 1, sortOrder: 1 }).lean();
    return docs.map((d) => ({ ...d, id: String(d._id), hasDraft: Boolean(d.draft) }));
  }

  async get(id: string) {
    const doc = await LandingSection.findById(id).lean();
    if (!doc) throw Errors.notFound('Section');
    return { ...doc, id: String(doc._id), hasDraft: Boolean(doc.draft) };
  }

  async create(input: Record<string, any>, byUserId: string, req?: any) {
    if (await LandingSection.exists({ key: input.key })) throw Errors.conflict('A section with this key already exists');
    const count = await LandingSection.countDocuments({ page: input.page ?? 'home' });
    const doc = await LandingSection.create({ ...input, sortOrder: input.sortOrder ?? count, isPublished: false, updatedBy: byUserId });
    auditService.record({ action: 'landing.section_created', resource: 'LandingSection', resourceId: doc._id, newValue: { key: doc.key, type: doc.type }, req });
    return this.get(String(doc._id));
  }

  /** Saves a draft; the live site does not change until publish. */
  async update(id: string, patch: Record<string, any>, byUserId: string, req?: any) {
    const doc = await LandingSection.findById(id);
    if (!doc) throw Errors.notFound('Section');
    const draft: Record<string, unknown> = { ...((doc.draft as Record<string, unknown>) ?? {}) };
    for (const key of EDITABLE) if (patch[key] !== undefined) draft[key] = patch[key];
    if (patch.sortOrder !== undefined) doc.sortOrder = patch.sortOrder;
    doc.draft = Object.keys(draft).length ? draft : null;
    doc.updatedBy = byUserId as any;
    await doc.save();
    auditService.record({ action: 'landing.section_draft_saved', resource: 'LandingSection', resourceId: doc._id, newValue: patch, req });
    await this.invalidate();
    return this.get(id);
  }

  async publish(id: string, byUserId: string, req?: any) {
    const doc = await LandingSection.findById(id);
    if (!doc) throw Errors.notFound('Section');
    const before = doc.toObject();
    if (doc.draft) {
      for (const [k, v] of Object.entries(doc.draft as Record<string, unknown>)) doc.set(k, v);
      doc.draft = null;
    }
    doc.isPublished = true;
    doc.publishedAt = new Date();
    doc.updatedBy = byUserId as any;
    await doc.save();
    await this.invalidate();
    auditService.record({ action: 'landing.section_published', resource: 'LandingSection', resourceId: doc._id, oldValue: { title: before.title, isPublished: before.isPublished }, newValue: { title: doc.title }, req });
    return this.get(id);
  }

  async unpublish(id: string, byUserId: string, req?: any) {
    const doc = await LandingSection.findById(id);
    if (!doc) throw Errors.notFound('Section');
    doc.isPublished = false;
    doc.updatedBy = byUserId as any;
    await doc.save();
    await this.invalidate();
    auditService.record({ action: 'landing.section_unpublished', resource: 'LandingSection', resourceId: doc._id, req });
    return this.get(id);
  }

  async discardDraft(id: string) {
    await LandingSection.updateOne({ _id: id }, { $set: { draft: null } });
    return this.get(id);
  }

  async reorder(page: string, orderedIds: string[], req?: any) {
    await Promise.all(orderedIds.map((id, i) => LandingSection.updateOne({ _id: id, page }, { $set: { sortOrder: i } })));
    await this.invalidate();
    auditService.record({ action: 'landing.reordered', resource: 'LandingSection', resourceId: page, newValue: { orderedIds }, req });
  }

  async remove(id: string, req?: any) {
    const doc = await LandingSection.findById(id);
    if (!doc) throw Errors.notFound('Section');
    await doc.deleteOne();
    await this.invalidate();
    auditService.record({ action: 'landing.section_deleted', resource: 'LandingSection', resourceId: id, oldValue: { key: doc.key, type: doc.type }, req });
  }

  async invalidate(): Promise<void> {
    configCache.deletePrefix('config:landing:');
    await invalidationBus.invalidate('config:landing');
  }
}

export const landingService = new LandingService();
