import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Save, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Priorities } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useComplaintSettings, useSaveComplaintSettings } from '@/hooks/use-complaints';
import { useRoles } from '@/hooks/use-society';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const toHours = (m: number) => Math.round((m / 60) * 100) / 100;

/** Helpdesk rules: response/resolution targets per priority, escalation ladder and behaviour switches. */
export default function ComplaintsSettingsPage() {
  const settings = useComplaintSettings();
  const roles = useRoles();
  const save = useSaveComplaintSettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => {
    if (settings.data && !form) {
      const sla = Object.fromEntries(Priorities.map((p) => [p, { responseHours: String(toHours(settings.data.sla?.[p]?.responseMinutes ?? 240)), resolutionHours: String(toHours(settings.data.sla?.[p]?.resolutionMinutes ?? 2880)) }]));
      setForm({ config: { ...settings.data.config }, sla, levels: (settings.data.escalation?.levels ?? []).map((l: any) => ({ afterHours: String(toHours(l.afterMinutesPastDue ?? 0)), notifyRoleKeys: l.notifyRoleKeys ?? [] })) });
    }
  }, [settings.data, form]);
  if (settings.isLoading || !form) return <div><PageHeader title="SLA & escalation" /><PageSkeleton /></div>;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const submit = () => save.mutate({ config: { autoCloseAfterResolvedDays: Number(form.config.autoCloseAfterResolvedDays) || 0, allowReopenDays: Number(form.config.allowReopenDays) || 0, memberCanRate: Boolean(form.config.memberCanRate), defaultPriority: form.config.defaultPriority }, sla: Object.fromEntries(Priorities.map((p) => [p, { responseMinutes: Math.max(1, Math.round(Number(form.sla[p].responseHours) * 60)), resolutionMinutes: Math.max(1, Math.round(Number(form.sla[p].resolutionHours) * 60)) }])), escalation: { levels: form.levels.map((l: any, i: number) => ({ level: i + 1, afterMinutesPastDue: Math.max(0, Math.round(Number(l.afterHours) * 60)), notifyRoleKeys: l.notifyRoleKeys, notifyUserIds: [] })) } }, { onSuccess: () => toast.success('Helpdesk settings saved'), onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div>
      <PageHeader title="SLA & escalation" description="Response and resolution targets per priority, who gets pulled in when a ticket runs late, and closing rules." actions={<><Button asChild variant="ghost"><Link to="/app/complaints"><ArrowLeft /> Complaints</Link></Button><Button loading={save.isPending} onClick={submit}><Save /> Save</Button></>} />
      <SubscriptionGate>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">SLA targets</CardTitle><CardDescription>Hours from the time a ticket is raised. The clock restarts when a ticket is reopened.</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs font-semibold text-muted-foreground"><span>Priority</span><span>First response (h)</span><span>Resolution (h)</span></div>
              {Priorities.map((p) => (
                <div key={p} className="mt-2 grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
                  <span className="text-sm">{formatStatus(p)}</span>
                  <Input type="number" min={0.25} step="0.25" value={form.sla[p].responseHours} onChange={(e) => setForm({ ...form, sla: { ...form.sla, [p]: { ...form.sla[p], responseHours: e.target.value } } })} aria-label={`${p} response hours`} />
                  <Input type="number" min={0.25} step="0.25" value={form.sla[p].resolutionHours} onChange={(e) => setForm({ ...form, sla: { ...form.sla, [p]: { ...form.sla[p], resolutionHours: e.target.value } } })} aria-label={`${p} resolution hours`} />
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Escalation ladder</CardTitle><CardDescription>When resolution is overdue, notify these roles after the given delay. Levels fire once each.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {form.levels.map((l: any, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Level {i + 1}</p><Button variant="ghost" size="sm" onClick={() => setForm({ ...form, levels: form.levels.filter((_: any, idx: number) => idx !== i) })}><Trash2 /></Button></div>
                  <div className="space-y-1.5"><Label className="text-xs">Hours past due</Label><Input type="number" min={0} step="0.5" value={l.afterHours} onChange={(e) => setForm({ ...form, levels: form.levels.map((x: any, idx: number) => (idx === i ? { ...x, afterHours: e.target.value } : x)) })} /></div>
                  <div className="mt-2 space-y-1.5"><Label className="text-xs">Notify roles</Label><div className="flex flex-wrap gap-3">{(roles.data ?? []).map((r: any) => <label key={r.key} className="flex items-center gap-1.5 text-sm"><Checkbox checked={l.notifyRoleKeys.includes(r.key)} onCheckedChange={(c) => setForm({ ...form, levels: form.levels.map((x: any, idx: number) => (idx === i ? { ...x, notifyRoleKeys: c ? [...x.notifyRoleKeys, r.key] : x.notifyRoleKeys.filter((k: string) => k !== r.key) } : x)) })} />{r.name}</label>)}</div></div>
                </div>
              ))}
              <Button variant="outline" size="sm" disabled={form.levels.length >= 5} onClick={() => setForm({ ...form, levels: [...form.levels, { afterHours: '24', notifyRoleKeys: ['SOCIETY_ADMIN'] }] })}><Plus /> Add level</Button>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-sm">Behaviour</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="cs-autoclose">Auto-close resolved after (days, 0 = never)</Label><Input id="cs-autoclose" type="number" min={0} max={90} value={form.config.autoCloseAfterResolvedDays} onChange={(e) => setForm({ ...form, config: { ...form.config, autoCloseAfterResolvedDays: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label htmlFor="cs-reopen">Residents can reopen within (days, 0 = always)</Label><Input id="cs-reopen" type="number" min={0} max={90} value={form.config.allowReopenDays} onChange={(e) => setForm({ ...form, config: { ...form.config, allowReopenDays: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Default priority</Label><Select value={form.config.defaultPriority} onValueChange={(v) => setForm({ ...form, config: { ...form.config, defaultPriority: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Priorities.map((p) => <SelectItem key={p} value={p}>{formatStatus(p)}</SelectItem>)}</SelectContent></Select></div>
              <label className="flex items-center gap-2 self-end text-sm"><Switch checked={Boolean(form.config.memberCanRate)} onCheckedChange={(v) => setForm({ ...form, config: { ...form.config, memberCanRate: v } })} /> Residents can rate resolutions</label>
            </CardContent>
          </Card>
        </div>
      </SubscriptionGate>
    </div>
  );
}
