import { SUPPORTED_LOCALES, type Locale } from '@society-erp/shared';
import { LandingSection } from '../../models/landing-section.model';
import { Errors } from '../../lib/errors';
import { configCache, invalidationBus } from '../../lib/cache';
import { configurationService } from '../../core/configuration/configuration.service';
import { moduleEngine } from '../../core/modules/module-engine.service';
import { auditService } from '../../core/audit/audit.service';
import { planService } from '../platform/plans.service';
import { DEFAULT_LANDING_SECTIONS } from '../../seed/data/landing-sections';

const EDITABLE = ['title', 'subtitle', 'description', 'content', 'image', 'icon', 'cta', 'metadata', 'translations', 'isVisible'] as const;

type Translation = { title?: string; subtitle?: string; description?: string; cta?: Record<string, string>; content?: Record<string, unknown> };
export interface LocaleConfig {
  default: Locale;
  enabled: Locale[];
}

/**
 * Overlays a translation on the English base. Strings replace only when non-empty, objects merge
 * key by key and arrays merge by index, so `content.items[2].icon` set in English survives a Hindi
 * translation that only supplies `title` and `description` for that item.
 */
export function mergeTranslation<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base;
    return base.map((item, i) => (i < over.length ? mergeTranslation(item, over[i]) : item)) as T;
  }
  if (typeof base === 'object' && base !== null) {
    if (typeof over !== 'object' || Array.isArray(over)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = k in out ? mergeTranslation(out[k], v) : v;
    return out as T;
  }
  if (typeof over === 'string') return (over.trim() ? over : base) as T;
  return base;
}

class LandingService {
  async ensureDefaults(): Promise<void> {
    const count = await LandingSection.countDocuments();
    if (count === 0) {
      await LandingSection.insertMany(DEFAULT_LANDING_SECTIONS.map((s) => ({ ...s, isPublished: true, publishedAt: new Date(), isVisible: true })));
      await this.invalidate();
      return;
    }
    // Sites seeded before translations existed: give the stock sections their stock translations once,
    // without touching anything the admin has edited. A section that already carries translations is left alone.
    let changed = 0;
    for (const def of DEFAULT_LANDING_SECTIONS) {
      if (!def.translations) continue;
      const res = await LandingSection.updateOne({ key: def.key, $or: [{ translations: { $exists: false } }, { translations: null }, { translations: {} }] }, { $set: { translations: def.translations } });
      changed += res.modifiedCount;
    }
    if (changed) await this.invalidate();
  }

  async localeConfig(settings?: Record<string, unknown>): Promise<LocaleConfig> {
    const raw = ((settings ?? (await configurationService.getPublicPlatformSettings()))['landing.locales'] ?? {}) as Partial<LocaleConfig>;
    const enabled = (Array.isArray(raw.enabled) ? raw.enabled : []).filter((l): l is Locale => (SUPPORTED_LOCALES as readonly string[]).includes(l));
    const list = enabled.length ? enabled : (['en'] as Locale[]);
    const def = raw.default && list.includes(raw.default) ? raw.default : list[0];
    return { default: def, enabled: list };
  }

  /** `hi-IN` -> `hi`; anything not enabled falls back to the default language rather than erroring. */
  resolveLocale(requested: string | undefined, cfg: LocaleConfig): Locale {
    const short = (requested ?? '').toLowerCase().split('-')[0] as Locale;
    return cfg.enabled.includes(short) ? short : cfg.default;
  }

  private localize<T extends { translations?: unknown; title?: string; subtitle?: string; description?: string; cta?: unknown; content?: unknown }>(s: T, locale: Locale): T {
    if (locale === 'en') return s;
    const t = ((s.translations as Record<string, Translation> | undefined) ?? {})[locale];
    if (!t) return s;
    return { ...s, title: mergeTranslation(s.title ?? '', t.title), subtitle: mergeTranslation(s.subtitle ?? '', t.subtitle), description: mergeTranslation(s.description ?? '', t.description), cta: mergeTranslation(s.cta ?? {}, t.cta), content: mergeTranslation(s.content ?? {}, t.content) };
  }

  /** Public payload: published, visible sections + public settings + plans + module catalogue, in the requested language. */
  async publicPage(page = 'home', requestedLocale?: string) {
    const settings = await configurationService.getPublicPlatformSettings();
    const cfg = await this.localeConfig(settings);
    const locale = this.resolveLocale(requestedLocale, cfg);
    return configCache.getOrSet(`config:landing:${page}:${locale}`, async () => {
      const [sections, plans, modules] = await Promise.all([LandingSection.find({ page, isPublished: true, isVisible: true }).sort({ sortOrder: 1 }).lean(), planService.publicPlans(), moduleEngine.getGlobalModules('SOCIETY')]);
      return {
        page,
        locale,
        locales: cfg,
        sections: sections.map((s) => {
          const l = this.localize(s, locale);
          return { id: String(s._id), type: s.type, key: s.key, title: l.title, subtitle: l.subtitle, description: l.description, content: l.content, image: s.image, icon: s.icon, cta: l.cta, metadata: s.metadata, sortOrder: s.sortOrder };
        }),
        settings,
        plans,
        modules: modules.filter((m) => m.status !== 'INACTIVE').map((m) => ({ key: m.key, name: m.name, description: m.description, icon: m.icon, category: m.category })),
      };
    }, 60_000);
  }

  /** Preview payload for the CMS: draft values take precedence, hidden/unpublished included with flags. */
  async previewPage(page = 'home', requestedLocale?: string) {
    const [sections, settings, plans, modules] = await Promise.all([
      LandingSection.find({ page }).sort({ sortOrder: 1 }).lean(),
      configurationService.getPublicPlatformSettings(),
      planService.publicPlans(),
      moduleEngine.getGlobalModules('SOCIETY'),
    ]);
    const cfg = await this.localeConfig(settings);
    const locale = this.resolveLocale(requestedLocale, cfg);
    return {
      page,
      locale,
      locales: cfg,
      sections: sections.map((s) => ({ ...this.localize(s.draft ? { ...s, ...(s.draft as object) } : s, locale), id: String(s._id), hasDraft: Boolean(s.draft) })),
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
