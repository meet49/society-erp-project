import * as React from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Combobox } from '@/components/common/combobox';
import { TableSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useCreateFeatureFlag, useFeatureFlagsPlatform, usePlans, useSocieties, useUpdateFeatureFlag } from '@/hooks/use-platform';

function SocietyPicker({ onPick }: { onPick: (id: string, name: string) => void }) {
  const [search, setSearch] = React.useState('');
  const societies = useSocieties({ search, limit: 20 });
  return <Combobox value={null} onChange={(v, o) => v && onPick(v, o?.label ?? v)} onSearch={setSearch} loading={societies.isFetching} options={(societies.data?.items ?? []).map((s: any) => ({ value: s.id, label: s.name, description: s.address?.city }))} placeholder="Add society override…" clearable={false} />;
}

export default function FeatureFlagsPage() {
  const flags = useFeatureFlagsPlatform();
  const plans = usePlans();
  const update = useUpdateFeatureFlag();
  const create = useCreateFeatureFlag();
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ key: '', name: '', description: '' });
  if (flags.isError) return <ErrorState error={flags.error} onRetry={() => flags.refetch()} />;

  const patch = (key: string, body: Record<string, unknown>) => update.mutate({ key, ...body }, { onSuccess: () => toast.success('Flag updated') });
  const ids = (list: any[]) => list.map((x) => String(x.id ?? x._id ?? x));

  return (
    <div>
      <PageHeader title="Feature flags" description="Platform-wide switches with per-society and per-plan rollouts. A society override always wins over the global value." actions={<Button onClick={() => setCreating(true)}><Plus /> New flag</Button>} />
      {flags.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="space-y-3">
          {(flags.data ?? []).map((f: any) => (
            <Card key={f.key}>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_320px]">
                <div>
                  <div className="flex items-center gap-3">
                    <Switch checked={f.enabled} onCheckedChange={(v) => patch(f.key, { enabled: v })} aria-label={`Toggle ${f.name}`} />
                    <div>
                      <p className="font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground"><code>{f.key}</code> · {f.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">Enabled for plans:</span>
                      {(plans.data ?? []).map((p: any) => {
                        const on = ids(f.enabledForPlanIds ?? []).includes(p.id);
                        return (
                          <button key={p.id} type="button" onClick={() => patch(f.key, { enabledForPlanIds: on ? ids(f.enabledForPlanIds).filter((x: string) => x !== p.id) : [...ids(f.enabledForPlanIds), p.id] })}>
                            <Badge variant={on ? 'success' : 'outline'}>{p.name}</Badge>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">Enabled for societies:</span>
                      {(f.enabledForSocietyIds ?? []).map((s: any) => (
                        <Badge key={s.id ?? s._id} variant="success" className="gap-1">
                          {s.name ?? String(s.id ?? s._id).slice(-6)}
                          <button type="button" onClick={() => patch(f.key, { enabledForSocietyIds: ids(f.enabledForSocietyIds).filter((x: string) => x !== String(s.id ?? s._id)) })} aria-label="Remove"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                      {!(f.enabledForSocietyIds ?? []).length ? <span className="text-muted-foreground">none</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground">Disabled for societies:</span>
                      {(f.disabledForSocietyIds ?? []).map((s: any) => (
                        <Badge key={s.id ?? s._id} variant="destructive" className="gap-1">
                          {s.name ?? String(s.id ?? s._id).slice(-6)}
                          <button type="button" onClick={() => patch(f.key, { disabledForSocietyIds: ids(f.disabledForSocietyIds).filter((x: string) => x !== String(s.id ?? s._id)) })} aria-label="Remove"><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                      {!(f.disabledForSocietyIds ?? []).length ? <span className="text-muted-foreground">none</span> : null}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Force ON for a society</Label>
                  <SocietyPicker onPick={(id) => patch(f.key, { enabledForSocietyIds: [...new Set([...ids(f.enabledForSocietyIds), id])] })} />
                  <Label className="text-xs">Force OFF for a society</Label>
                  <SocietyPicker onPick={(id) => patch(f.key, { disabledForSocietyIds: [...new Set([...ids(f.disabledForSocietyIds), id])] })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>New feature flag</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Key</Label><Input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="e.g. smart_meters" /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={!draft.key || !draft.name} onClick={() => create.mutate({ ...draft, enabled: false }, { onSuccess: () => { toast.success('Flag created'); setCreating(false); setDraft({ key: '', name: '', description: '' }); } })}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
