import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Save, Trash2, GitBranch } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateWorkflow, useWorkflows } from '@/hooks/use-workflows';
import { useRoles, usePermissionCatalog } from '@/hooks/use-society';
import { cn, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const OPERATORS = [{ value: 'gte', label: '≥' }, { value: 'gt', label: '>' }, { value: 'lte', label: '≤' }, { value: 'lt', label: '<' }, { value: 'eq', label: '=' }, { value: 'neq', label: '≠' }];
const FIELDS: Record<string, string[]> = { Expense: ['amount', 'categoryKey', 'fundKey'], PurchaseOrder: ['amount', 'categoryKey'], Vendor: ['categoryKey'], AmenityBooking: ['amount', 'amenityKey'], Document: ['categoryKey'] };

type Step = { name: string; approverType: 'ROLE' | 'USER' | 'PERMISSION'; approverRef: string; requiredApprovals: string; conditionOn: boolean; cField: string; cOperator: string; cValue: string };

function toStep(s: any): Step { return { name: s.name, approverType: s.approverType, approverRef: s.approverRef, requiredApprovals: String(s.requiredApprovals ?? 1), conditionOn: Boolean(s.condition), cField: s.condition?.field ?? 'amount', cOperator: s.condition?.operator ?? 'gte', cValue: s.condition?.value != null ? String(s.condition.value) : '' }; }
const fromStep = (s: Step, i: number) => ({ order: i + 1, name: s.name, approverType: s.approverType, approverRef: s.approverRef, requiredApprovals: Number(s.requiredApprovals) || 1, condition: s.conditionOn && s.cField ? { field: s.cField, operator: s.cOperator, value: Number.isFinite(Number(s.cValue)) && s.cValue !== '' ? Number(s.cValue) : s.cValue } : null });

function WorkflowCard({ wf, roles, permissions }: { wf: any; roles: any[]; permissions: { value: string; label: string }[] }) {
  const update = useUpdateWorkflow();
  const [active, setActive] = React.useState<boolean>(wf.active);
  const [steps, setSteps] = React.useState<Step[]>(wf.steps.map(toStep));
  const [auto, setAuto] = React.useState<{ on: boolean; field: string; operator: string; value: string }>({ on: Boolean(wf.autoApproveCondition), field: wf.autoApproveCondition?.field ?? 'amount', operator: wf.autoApproveCondition?.operator ?? 'lt', value: wf.autoApproveCondition?.value != null ? String(wf.autoApproveCondition.value) : '' });
  const [dirty, setDirty] = React.useState(false);
  const fields = FIELDS[wf.entityType] ?? ['amount'];
  const setStep = (i: number, patch: Partial<Step>) => { setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s))); setDirty(true); };
  const roleOptions = roles.map((r) => ({ value: r.key, label: r.name }));
  return (
    <Card className={cn(!active && 'opacity-80')}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div><CardTitle className="flex items-center gap-2 text-sm"><GitBranch className="h-4 w-4" /> {wf.name} <Badge variant="outline">{formatStatus(wf.entityType)}</Badge></CardTitle><CardDescription>{wf.description}</CardDescription></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={(v) => { setActive(v); setDirty(true); }} /> {active ? 'Active' : 'Inactive'}</label>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={auto.on} onCheckedChange={(v) => { setAuto({ ...auto, on: v }); setDirty(true); }} /> Auto-approve when</label>
          {auto.on ? <div className="mt-2 grid gap-2 sm:grid-cols-3"><Select value={auto.field} onValueChange={(v) => { setAuto({ ...auto, field: v }); setDirty(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select><Select value={auto.operator} onValueChange={(v) => { setAuto({ ...auto, operator: v }); setDirty(true); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select><Input value={auto.value} onChange={(e) => { setAuto({ ...auto, value: e.target.value }); setDirty(true); }} placeholder="e.g. 2000" aria-label="Auto-approve value" /></div> : null}
        </div>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase text-muted-foreground">Step {i + 1}</p><Button variant="ghost" size="sm" onClick={() => { setSteps(steps.filter((_, idx) => idx !== i)); setDirty(true); }}><Trash2 /></Button></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1"><Label className="text-xs">Step name</Label><Input value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Approver type</Label><Select value={s.approverType} onValueChange={(v) => setStep(i, { approverType: v as Step['approverType'], approverRef: '' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ROLE">Anyone with role</SelectItem><SelectItem value="PERMISSION">Anyone with permission</SelectItem><SelectItem value="USER">Specific user (id)</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label className="text-xs">{s.approverType === 'ROLE' ? 'Role' : s.approverType === 'PERMISSION' ? 'Permission' : 'User id'}</Label>{s.approverType === 'ROLE' ? <Combobox value={s.approverRef} onChange={(v) => setStep(i, { approverRef: v ?? '' })} options={roleOptions} placeholder="Role" /> : s.approverType === 'PERMISSION' ? <Combobox value={s.approverRef} onChange={(v) => setStep(i, { approverRef: v ?? '' })} options={permissions} placeholder="Permission" /> : <Input value={s.approverRef} onChange={(e) => setStep(i, { approverRef: e.target.value })} />}</div>
                <div className="space-y-1"><Label className="text-xs">Approvals needed</Label><Input type="number" min={1} max={10} value={s.requiredApprovals} onChange={(e) => setStep(i, { requiredApprovals: e.target.value })} /></div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm"><Switch checked={s.conditionOn} onCheckedChange={(v) => setStep(i, { conditionOn: v })} /> Only when</label>
              {s.conditionOn ? <div className="mt-2 grid gap-2 sm:grid-cols-3"><Select value={s.cField} onValueChange={(v) => setStep(i, { cField: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{fields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select><Select value={s.cOperator} onValueChange={(v) => setStep(i, { cOperator: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select><Input value={s.cValue} onChange={(e) => setStep(i, { cValue: e.target.value })} placeholder="value" aria-label="Condition value" /></div> : null}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => { setSteps([...steps, { name: `Step ${steps.length + 1}`, approverType: 'ROLE', approverRef: 'COMMITTEE', requiredApprovals: '1', conditionOn: false, cField: 'amount', cOperator: 'gte', cValue: '' }]); setDirty(true); }}><Plus /> Add step</Button>
        </div>
        <div className="flex justify-end"><Button size="sm" disabled={!dirty} loading={update.isPending} onClick={() => update.mutate({ key: wf.key, active, steps: steps.map(fromStep), autoApproveCondition: auto.on && auto.value !== '' ? { field: auto.field, operator: auto.operator, value: Number.isFinite(Number(auto.value)) ? Number(auto.value) : auto.value } : null }, { onSuccess: () => { toast.success(`${wf.name} saved`); setDirty(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Save /> Save</Button></div>
      </CardContent>
    </Card>
  );
}

export default function WorkflowsPage() {
  const workflows = useWorkflows();
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const permissions = React.useMemo(
    () =>
      (catalog.data ?? []).flatMap((m: any) => {
        const moduleKey = m.module ?? m.key;
        const list: any[] = m.permissions ?? m.actions ?? [];
        return list.map((a: any) => {
          const key: string = a.key ?? a.permission ?? String(a);
          return { value: key.includes(':') ? key : `${moduleKey}:${key}`, label: `${m.name ?? moduleKey}: ${a.label ?? key}` };
        });
      }),
    [catalog.data],
  );
  return (
    <div>
      <PageHeader title="Approval workflows" description="Who approves what, in which order, and when approval can be skipped. Changes apply to requests submitted from now on." />
      <SettingsNav />
      <SubscriptionGate>
        {workflows.isLoading ? <PageSkeleton /> : workflows.isError ? <ErrorState error={workflows.error} onRetry={() => workflows.refetch()} /> : (
          <div className="space-y-4">{(workflows.data ?? []).map((wf: any) => <WorkflowCard key={wf.key} wf={wf} roles={roles.data ?? []} permissions={permissions} />)}</div>
        )}
      </SubscriptionGate>
    </div>
  );
}
