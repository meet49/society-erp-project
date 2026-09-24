import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PageSkeleton } from '@/components/common/loading-state';
import { ItemsEditor } from '@/features/platform/website/section-editor';
import { usePlatformSettings, useUpdatePlatformSettings } from '@/hooks/use-platform';

function useSettingsDraft(groups: string[]) {
  const queries = groups.map((g) => usePlatformSettings(g)); // eslint-disable-line react-hooks/rules-of-hooks
  const loading = queries.some((q) => q.isLoading);
  const all = React.useMemo(() => Object.fromEntries(queries.flatMap((q) => (q.data ?? []).map((s: any) => [s.key, s.value]))), [queries]);
  const [draft, setDraft] = React.useState<Record<string, any>>({});
  const get = (key: string) => (key in draft ? draft[key] : all[key]);
  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  return { loading, get, set, draft, clear: () => setDraft({}) };
}

export default function BrandPage() {
  const { loading, get, set, draft, clear } = useSettingsDraft(['brand', 'website', 'signup']);
  const update = useUpdatePlatformSettings();
  if (loading) return <PageSkeleton />;
  const _contact = get('landing.contact') ?? {};
  const social = get('landing.social') ?? {};
  const seo = get('landing.seo') ?? {};
  const _cta = get('landing.cta') ?? {};
  const footer = get('landing.footer') ?? {};
  const save = () => update.mutate(Object.entries(draft).map(([key, value]) => ({ key, value })), { onSuccess: () => { toast.success('Website settings saved'); clear(); } });

  const text = (key: string, label: string, opts: { obj?: string; field?: string; placeholder?: string } = {}) => {
    const value = opts.obj ? (get(opts.obj) ?? {})[opts.field!] ?? '' : get(key) ?? '';
    const onChange = (v: string) => (opts.obj ? set(opts.obj, { ...(get(opts.obj) ?? {}), [opts.field!]: v }) : set(key, v));
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={opts.placeholder} />
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Brand & SEO" description="Branding, contact details, social links, footer, SEO and signup behaviour of the public website. No code changes required." actions={<Button onClick={save} loading={update.isPending} disabled={!Object.keys(draft).length}>Save changes</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Brand</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {text('brand.name', 'Brand name')}
            {text('brand.tagline', 'Tagline')}
            {text('brand.logoUrl', 'Logo URL', { placeholder: 'https://…/logo.png' })}
            {text('brand.faviconUrl', 'Favicon URL')}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Primary colour</Label><Input type="color" value={get('brand.primaryColor') ?? '#4f46e5'} onChange={(e) => set('brand.primaryColor', e.target.value)} className="h-9 w-full p-1" /></div>
              <div className="space-y-1.5"><Label>Accent colour</Label><Input type="color" value={get('brand.accentColor') ?? '#0ea5e9'} onChange={(e) => set('brand.accentColor', e.target.value)} className="h-9 w-full p-1" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">SEO</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {text('landing.seo', 'Page title', { obj: 'landing.seo', field: 'title' })}
            <div className="space-y-1.5"><Label>Meta description</Label><Textarea rows={3} value={seo.description ?? ''} onChange={(e) => set('landing.seo', { ...seo, description: e.target.value })} /></div>
            {text('landing.seo', 'Open Graph image URL', { obj: 'landing.seo', field: 'ogImage' })}
            {text('landing.seo', 'Keywords', { obj: 'landing.seo', field: 'keywords' })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {text('landing.contact', 'Email', { obj: 'landing.contact', field: 'email' })}
            {text('landing.contact', 'Phone', { obj: 'landing.contact', field: 'phone' })}
            {text('landing.contact', 'Address', { obj: 'landing.contact', field: 'address' })}
            {text('landing.contact', 'Hours', { obj: 'landing.contact', field: 'hours' })}
            {(['twitter', 'linkedin', 'facebook', 'instagram', 'youtube'] as const).map((k) => (
              <div key={k} className="space-y-1.5"><Label className="capitalize">{k}</Label><Input value={social[k] ?? ''} onChange={(e) => set('landing.social', { ...social, [k]: e.target.value })} placeholder="https://…" /></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Global call to action</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {text('landing.cta', 'Primary label', { obj: 'landing.cta', field: 'primaryLabel' })}
            {text('landing.cta', 'Primary link', { obj: 'landing.cta', field: 'primaryHref' })}
            {text('landing.cta', 'Secondary label', { obj: 'landing.cta', field: 'secondaryLabel' })}
            {text('landing.cta', 'Secondary link', { obj: 'landing.cta', field: 'secondaryHref' })}
            <div className="flex items-center justify-between rounded-md border p-3 text-sm sm:col-span-2">
              <div>
                <Label>Public signup enabled</Label>
                <p className="text-xs text-muted-foreground">When off, the signup page asks prospects to contact sales.</p>
              </div>
              <Switch checked={get('signup.enabled') !== false} onCheckedChange={(v) => set('signup.enabled', v)} />
            </div>
            {text('signup.defaultPlanSlug', 'Default plan slug for signup')}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Footer</CardTitle>
            <CardDescription>Description, legal line and link columns.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="space-y-1.5"><Label>Description</Label><Input value={footer.text ?? ''} onChange={(e) => set('landing.footer', { ...footer, text: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Legal line</Label><Input value={footer.legal ?? ''} onChange={(e) => set('landing.footer', { ...footer, legal: e.target.value })} /></div>
            {(footer.columns ?? []).map((col: any, i: number) => (
              <div key={i} className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Input value={col.title} onChange={(e) => set('landing.footer', { ...footer, columns: footer.columns.map((c: any, j: number) => (j === i ? { ...c, title: e.target.value } : c)) })} className="h-8 max-w-xs" />
                  <Button variant="ghost" size="sm" onClick={() => set('landing.footer', { ...footer, columns: footer.columns.filter((_: any, j: number) => j !== i) })}>Remove column</Button>
                </div>
                <ItemsEditor items={col.links ?? []} onChange={(links) => set('landing.footer', { ...footer, columns: footer.columns.map((c: any, j: number) => (j === i ? { ...c, links } : c)) })} fields={[{ key: 'label', label: 'Label' }, { key: 'href', label: 'Link' }]} />
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => set('landing.footer', { ...footer, columns: [...(footer.columns ?? []), { title: 'New column', links: [] }] })}>Add column</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
