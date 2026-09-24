import * as React from 'react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/errors';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useDiscardSectionDraft, usePublishSection, useUpdateSection } from '@/hooks/use-platform';

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

/** Editor for one landing section: saves a draft, publishes, or discards. Works on the merged (draft over live) values. */
export function SectionEditor({ section, onClose }: { section: any; onClose?: () => void }) {
  const merged = React.useMemo(() => ({ ...section, ...(section.draft ?? {}) }), [section]);
  const [title, setTitle] = React.useState(merged.title ?? '');
  const [subtitle, setSubtitle] = React.useState(merged.subtitle ?? '');
  const [description, setDescription] = React.useState(merged.description ?? '');
  const [image, setImage] = React.useState(merged.image ?? '');
  const [cta, setCta] = React.useState(merged.cta ?? {});
  const [content, setContent] = React.useState<any>(merged.content ?? {});
  const [isVisible, setVisible] = React.useState(merged.isVisible !== false);
  const update = useUpdateSection();
  const publish = usePublishSection();
  const discard = useDiscardSectionDraft();
  const fields = ITEM_FIELDS[section.type];

  // mutateAsync: the list refetch after saving may re-render / remount this editor, and per-call
  // mutate() callbacks are dropped on unmount, which would silently skip the publish step.
  const save = async (thenPublish = false) => {
    try {
      await update.mutateAsync({ id: section.id, title, subtitle, description, image, cta, content, isVisible });
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-title">Title</Label><Input id="sec-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-subtitle">Subtitle</Label><Input id="sec-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></div>
        {['HERO', 'CUSTOM', 'FEATURES', 'VALUE_PROPOSITION'].includes(section.type) ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-description">Description</Label><Textarea id="sec-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div> : null}
        {['HERO', 'CUSTOM'].includes(section.type) ? <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="sec-image">Image URL</Label><Input id="sec-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" /></div> : null}
        {['HERO', 'CTA', 'CUSTOM'].includes(section.type) ? (
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
        {fields && (section.type !== 'MODULES' || content.showFromCatalog === false) ? (
          <div className="sm:col-span-2">
            <Label className="text-xs">Items</Label>
            <ItemsEditor items={content.items ?? []} onChange={(items) => setContent({ ...content, items })} fields={fields} />
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={isVisible} onCheckedChange={setVisible} /> Visible on the page</div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {section.hasDraft ? <Button variant="ghost" onClick={() => discard.mutate(section.id, { onSuccess: () => toast.success('Draft discarded') })}>Discard draft</Button> : null}
        <Button variant="outline" onClick={() => save(false)} loading={update.isPending}>Save draft</Button>
        <Button onClick={() => save(true)} loading={publish.isPending}>Save & publish</Button>
      </div>
    </div>
  );
}
