import * as React from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PageSkeleton } from '@/components/common/loading-state';
import { usePlatformSettings, useUpdatePlatformSettings } from '@/hooks/use-platform';
import { formatStatus } from '@/lib/utils';

const GROUPS = ['subscription', 'security', 'support', 'notifications', 'platform', 'signup', 'navigation'];

/** Generic editor: booleans → switch, numbers → number input, strings → text, arrays/objects → JSON. */
function SettingField({ setting, value, onChange }: { setting: any; value: any; onChange: (v: unknown) => void }) {
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [jsonText, setJsonText] = React.useState(() => JSON.stringify(value, null, 2));
  React.useEffect(() => setJsonText(JSON.stringify(value, null, 2)), [value]);
  if (typeof value === 'boolean') return <Switch checked={value} onCheckedChange={onChange} />;
  if (typeof value === 'number') return <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="max-w-xs" />;
  if (typeof value === 'string' || value === null) return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="max-w-md" placeholder={setting.isSecret ? '••••••' : ''} />;
  return (
    <div className="space-y-1">
      <Textarea value={jsonText} rows={Math.min(14, jsonText.split('\n').length + 1)} className="font-mono text-xs" onChange={(e) => { setJsonText(e.target.value); try { onChange(JSON.parse(e.target.value)); setJsonError(null); } catch { setJsonError('Invalid JSON'); } }} />
      {jsonError ? <p className="text-xs text-destructive">{jsonError}</p> : null}
    </div>
  );
}

export default function PlatformSettingsPage() {
  const settings = usePlatformSettings();
  const update = useUpdatePlatformSettings();
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  if (settings.isLoading) return <PageSkeleton />;
  const all = settings.data ?? [];
  const save = () => update.mutate(Object.entries(draft).map(([key, value]) => ({ key, value })), { onSuccess: () => { toast.success('Settings saved'); setDraft({}); } });
  return (
    <div>
      <PageHeader
        title="Platform settings"
        description="Subscription rules, security, support SLAs, notification defaults and navigation groups. Website content lives under Website."
        actions={
          <>
            <Button asChild variant="outline"><Link to="/admin/settings/users">Platform users</Link></Button>
            <Button asChild variant="outline"><Link to="/admin/settings/health">Health</Link></Button>
            <Button onClick={save} loading={update.isPending} disabled={!Object.keys(draft).length}>Save {Object.keys(draft).length ? `(${Object.keys(draft).length})` : ''}</Button>
          </>
        }
      />
      <Tabs defaultValue="subscription">
        <TabsList>{GROUPS.map((g) => <TabsTrigger key={g} value={g}>{formatStatus(g)}</TabsTrigger>)}</TabsList>
        {GROUPS.map((g) => (
          <TabsContent key={g} value={g}>
            <Card>
              <CardHeader><CardTitle className="text-sm">{formatStatus(g)} settings</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {all.filter((s: any) => s.group === g).map((s: any) => {
                  const value = s.key in draft ? draft[s.key] : s.value;
                  return (
                    <div key={s.key} className="grid gap-2 py-4 md:grid-cols-[320px_1fr]">
                      <div>
                        <Label>{s.label}</Label>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground"><code>{s.key}</code>{s.isPublic ? ' · public' : ''}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex-1"><SettingField setting={s} value={value} onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))} /></div>
                        {s.defaultValue !== undefined && JSON.stringify(value) !== JSON.stringify(s.defaultValue) ? (
                          <Button variant="ghost" size="icon-sm" title="Reset to default" onClick={() => setDraft((d) => ({ ...d, [s.key]: s.defaultValue }))}><RotateCcw /></Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
