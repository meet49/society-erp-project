import * as React from 'react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';
import { Plus, Trash2, ArrowUp, ArrowDown, Languages } from 'lucide-react';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useDiscardSectionDraft, usePublishSection, useUpdateSection } from '@/hooks/use-platform';
import { cn } from '@/lib/utils';

/** Field definitions for each section type's content.items (generic list editor). */
export const ITEM_FIELDS: Record<string, { key: string; label: string; multiline?: boolean }[]> = {
  VALUE_PROPOSITION: [{ key: 'icon', label: 'Icon (lucide)' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }],
  FEATURES: [{ key: 'icon', label: 'Icon (lucide)' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }],
  SECURITY: [{ key: 'icon', label: 'Icon (lucide)' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }],
  TESTIMONIALS: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role / society' }, { key: 'quote', label: 'Quote', multiline: true }, { key: 'avatar', label: 'Avatar URL' }],
  FAQ: [{ key: 'question', label: 'Question' }, { key: 'answer', label: 'Answer', multiline: true }],
  CUSTOM: [{ key: 'icon', label: 'Icon (lucide)' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }],
  MODULES: [{ key: 'icon', label: 'Icon (lucide)' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }],
};

/** Fields that are the same in every language (links, icons, images, names) and so are not offered for translation. */
const UNTRANSLATABLE = new Set(['icon', 'avatar', 'step', 'href', 'name']);

export function ItemsEditor({ items, onChange, fields }: { items: Record<string, string>[]; onChange: (items: Record<string, string>[]) => void; fields: { key: string; label: string; multiline?: boolean }[] }) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Item {i + 1}</p>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
                <Label className="text-xs">{f.label}</Label>
                {f.multiline ? <Textarea rows={2} value={it[f.key] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} /> : <Input value={it[f.key] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, '']))])}><Plus /> Add item</Button>
    </div>
  );
}

/**
 * Translation of a list: one row per English item (same order, same count), only the text fields.
 * The English value is the placeholder, so an empty box means "show the English text".
 */
function TranslatedItemsEditor({ base, value, onChange, fields }: { base: Record<string, any>[]; value: Record<string, string>[] | undefined; onChange: (items: Record<string, string>[]) => void; fields: { key: string; label: string; multiline?: boolean }[] }) {
  const current = base.map((_, i) => value?.[i] ?? {});
  const setField = (i: number, key: string, v: string) => onChange(current.map((x, j) => (j === i ? { ...x, [key]: v } : x)));
  if (!base.length) return <p className="text-xs text-muted-foreground">Add items in English first; each one can then be translated here.</p>;
  return (
    <div className="space-y-3">
      {base.map((b, i) => (
        <div key={i} className="rounded-md border p-3">
          <p className="mb-2 truncate text-xs font-semibold text-muted-foreground">
            Item {i + 1} · <span className="font-normal">{String(b[fields[0]?.key] ?? '')}</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
                <Label className="text-xs">{f.label}</Label>
                {f.multiline ? <Textarea rows={2} value={current[i][f.key] ?? ''} placeholder={String(b[f.key] ?? '')} onChange={(e) => setField(i, f.key, e.target.value)} /> : <Input value={current[i][f.key] ?? ''} placeholder={String(b[f.key] ?? '')} onChange={(e) => setField(i, f.key, e.target.value)} />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Editor for one landing section: saves a draft, publishes, or discards. Works on the merged (draft over live) values. */
export function SectionEditor({ section, onClose }: { section: any; onClose?: () => void }) {
  const merged = React.useMemo(() => ({ ...section, ...(section.draft ?? {}) }), [section]);
  const [lang, setLang] = React.useState<Locale>('en');
  const [title, setTitle] = React.useState(merged.title ?? '');
  const [subtitle, setSubtitle] = React.useState(merged.subtitle ?? '');
  const [description, setDescription] = React.useState(merged.description ?? '');
  const [image, setImage] = React.useState(merged.image ?? '');
  const [cta, setCta] = React.useState(merged.cta ?? {});
  const [content, setContent] = React.useState<any>(merged.content ?? {});
  const [translations, setTranslations] = React.useState<Record<string, any>>(merged.translations ?? {});
  const [isVisible, setVisible] = React.useState(merged.isVisible !== false);
  const update = useUpdateSection();
  const publish = usePublishSection();
  const discard = useDiscardSectionDraft();
  const fields = ITEM_FIELDS[section.type];
  const textFields = fields?.filter((f) => !UNTRANSLATABLE.has(f.key));

  const hasDescription = ['HERO', 'CUSTOM', 'FEATURES', 'VALUE_PROPOSITION'].includes(section.type);
  const hasCta = ['HERO', 'CTA', 'CUSTOM'].includes(section.type);
  const hasItems = Boolean(fields) && (section.type !== 'MODULES' || content.showFromCatalog === false);

  // Current language's overrides; `setTr` patches just that language and drops nothing else.
  const tr = translations[lang] ?? {};
  const setTr = (patch: Record<string, unknown>) => setTranslations({ ...translations, [lang]: { ...tr, ...patch } });
  const setTrContent = (patch: Record<string, unknown>) => setTr({ content: { ...(tr.content ?? {}), ...patch } });
  const hasTranslation = (l: Locale) => Object.keys(translations[l] ?? {}).length > 0;

  // mutateAsync: the list refetch after saving may re-render / remount this editor, and per-call
  // mutate() callbacks are dropped on unmount, which would silently skip the publish step.
  const save = async (thenPublish = false) => {
    try {
      await update.mutateAsync({ id: section.id, title, subtitle, description, image, cta, content, translations, isVisible });
      if (thenPublish) {
        await publish.mutateAsync(section.id);
        toast.success('Published to the live site');
        onClose?.();
      } else toast.success('Draft saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-1 text-sm" role="tablist" aria-label="Language">
          {SUPPORTED_LOCALES.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={lang === l} lang={l} className={cn('flex items-center gap-1.5 rounded px-3 py-1 transition-colors', lang === l ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')} onClick={() => setLang(l)}>
              {l === 'en' ? <Languages className="h-3.5 w-3.5" /> : null}
              {LOCALE_LABELS[l].native}
              {l !== 'en' ? <span className={cn('h-1.5 w-1.5 rounded-full', hasTranslation(l) ? 'bg-success' : 'bg-warning')} title={hasTranslation(l) ? 'Translated' : 'Not translated yet'} /> : null}
            </button>
          ))}
        </div>
        {lang !== 'en' ? <p className="text-xs text-muted-foreground">Leave a field empty to show the English text. Links, icons, images and numbers are shared across languages.</p> : null}
      </div>

      {lang === 'en' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-title">Title</Label><Input id="sec-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-subtitle">Subtitle</Label><Input id="sec-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></div>
          {hasDescription ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-description">Description</Label><Textarea id="sec-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div> : null}
          {['HERO', 'CUSTOM'].includes(section.type) ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-image">Image URL</Label><Input id="sec-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" /></div> : null}
          {hasCta ? (
            <>
              <div className="space-y-1.5"><Label htmlFor="sec-cta-label">Primary button label</Label><Input id="sec-cta-label" value={cta.label ?? ''} onChange={(e) => setCta({ ...cta, label: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="sec-cta-href">Primary button link</Label><Input id="sec-cta-href" value={cta.href ?? ''} onChange={(e) => setCta({ ...cta, href: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="sec-cta2-label">Secondary button label</Label><Input id="sec-cta2-label" value={cta.secondaryLabel ?? ''} onChange={(e) => setCta({ ...cta, secondaryLabel: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="sec-cta2-href">Secondary button link</Label><Input id="sec-cta2-href" value={cta.secondaryHref ?? ''} onChange={(e) => setCta({ ...cta, secondaryHref: e.target.value })} /></div>
            </>
          ) : null}
          {section.type === 'HERO' ? (
            <>
              <div className="space-y-1.5 sm:col-span-2"><Label>Badges (comma separated)</Label><Input value={(content.badges ?? []).join(', ')} onChange={(e) => setContent({ ...content, badges: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Stats</Label>
                <ItemsEditor items={content.stats ?? []} onChange={(stats) => setContent({ ...content, stats })} fields={[{ key: 'label', label: 'Label' }, { key: 'value', label: 'Value' }]} />
              </div>
            </>
          ) : null}
          {section.type === 'HOW_IT_WORKS' ? (
            <div className="sm:col-span-2">
              <Label className="text-xs">Steps</Label>
              <ItemsEditor items={(content.steps ?? []).map((s: any) => ({ ...s, step: String(s.step ?? '') }))} onChange={(steps) => setContent({ ...content, steps: steps.map((s, i) => ({ ...s, step: Number(s.step) || i + 1 })) })} fields={[{ key: 'step', label: 'Step number' }, { key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }]} />
            </div>
          ) : null}
          {section.type === 'MODULES' ? (
            <div className="flex items-center gap-2 sm:col-span-2 text-sm">
              <Switch checked={content.showFromCatalog !== false} onCheckedChange={(v) => setContent({ ...content, showFromCatalog: v })} /> Show modules from the live catalogue
              {content.showFromCatalog !== false ? <Input className="ml-2 h-8" placeholder="highlight keys, comma separated" value={(content.highlight ?? []).join(', ')} onChange={(e) => setContent({ ...content, highlight: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /> : null}
            </div>
          ) : null}
          {section.type === 'PRICING' ? (
            <div className="flex items-center gap-2 sm:col-span-2 text-sm"><Switch checked={content.showToggle !== false} onCheckedChange={(v) => setContent({ ...content, showToggle: v })} /> Show monthly / annual toggle</div>
          ) : null}
          {hasItems ? (
            <div className="sm:col-span-2">
              <Label className="text-xs">Items</Label>
              <ItemsEditor items={content.items ?? []} onChange={(items) => setContent({ ...content, items })} fields={fields!} />
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={isVisible} onCheckedChange={setVisible} /> Visible on the page</div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" lang={lang}>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tr-title">Title</Label><Input id="tr-title" value={tr.title ?? ''} placeholder={title} onChange={(e) => setTr({ title: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tr-subtitle">Subtitle</Label><Input id="tr-subtitle" value={tr.subtitle ?? ''} placeholder={subtitle} onChange={(e) => setTr({ subtitle: e.target.value })} /></div>
          {hasDescription ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tr-description">Description</Label><Textarea id="tr-description" rows={3} value={tr.description ?? ''} placeholder={description} onChange={(e) => setTr({ description: e.target.value })} /></div> : null}
          {hasCta ? (
            <>
              <div className="space-y-1.5"><Label htmlFor="tr-cta-label">Primary button label</Label><Input id="tr-cta-label" value={tr.cta?.label ?? ''} placeholder={cta.label ?? ''} onChange={(e) => setTr({ cta: { ...(tr.cta ?? {}), label: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label htmlFor="tr-cta2-label">Secondary button label</Label><Input id="tr-cta2-label" value={tr.cta?.secondaryLabel ?? ''} placeholder={cta.secondaryLabel ?? ''} onChange={(e) => setTr({ cta: { ...(tr.cta ?? {}), secondaryLabel: e.target.value } })} /></div>
            </>
          ) : null}
          {section.type === 'HERO' ? (
            <>
              <div className="space-y-1.5 sm:col-span-2"><Label>Badges (comma separated, same order as English)</Label><Input value={(tr.content?.badges ?? []).join(', ')} placeholder={(content.badges ?? []).join(', ')} onChange={(e) => setTrContent({ badges: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Stats</Label>
                <TranslatedItemsEditor base={content.stats ?? []} value={tr.content?.stats} onChange={(stats) => setTrContent({ stats })} fields={[{ key: 'label', label: 'Label' }, { key: 'value', label: 'Value' }]} />
              </div>
            </>
          ) : null}
          {section.type === 'HOW_IT_WORKS' ? (
            <div className="sm:col-span-2">
              <Label className="text-xs">Steps</Label>
              <TranslatedItemsEditor base={content.steps ?? []} value={tr.content?.steps} onChange={(steps) => setTrContent({ steps })} fields={[{ key: 'title', label: 'Title' }, { key: 'description', label: 'Description', multiline: true }]} />
            </div>
          ) : null}
          {hasItems && textFields?.length ? (
            <div className="sm:col-span-2">
              <Label className="text-xs">Items</Label>
              <TranslatedItemsEditor base={content.items ?? []} value={tr.content?.items} onChange={(items) => setTrContent({ items })} fields={textFields} />
            </div>
          ) : null}
          {hasTranslation(lang) ? (
            <div className="sm:col-span-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTranslations(Object.fromEntries(Object.entries(translations).filter(([k]) => k !== lang)))}><Trash2 /> Clear {LOCALE_LABELS[lang].english} translation</Button>
            </div>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {section.hasDraft ? <Button variant="ghost" onClick={() => discard.mutate(section.id, { onSuccess: () => toast.success('Draft discarded') })}>Discard draft</Button> : null}
        <Button variant="outline" onClick={() => save(false)} loading={update.isPending}>Save draft</Button>
        <Button onClick={() => save(true)} loading={publish.isPending}>Save & publish</Button>
      </div>
    </div>
  );
}
