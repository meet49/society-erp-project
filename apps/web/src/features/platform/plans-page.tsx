import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Archive, Trash2 } from 'lucide-react';
import { slugSchema } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TextField, TextareaField, SelectField, SwitchField, applyServerErrors } from '@/components/common/form';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useArchivePlan, useCreatePlan, usePlans, usePlatformModules, useUpdatePlan } from '@/hooks/use-platform';
import { formatCurrency, formatStatus } from '@/lib/utils';

const LIMIT_KEYS = [['maxUnits', 'Units'], ['maxResidents', 'Residents'], ['maxUsers', 'Users'], ['maxStaff', 'Staff'], ['maxVehicles', 'Vehicles'], ['maxDocuments', 'Documents'], ['maxAdmins', 'Admins'], ['maxStorageMb', 'Storage (MB)']] as const;

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  description: z.string().trim().max(400).optional(),
  monthlyPrice: z.coerce.number().min(0),
  annualPrice: z.coerce.number().min(0),
  currency: z.string().length(3).toUpperCase().default('INR'),
  trialDays: z.coerce.number().int().min(0).max(365),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  displayOrder: z.coerce.number().int(),
  highlighted: z.boolean(),
  publicVisibility: z.boolean(),
  isDefault: z.boolean(),
  badge: z.string().max(40).optional(),
  ctaLabel: z.string().max(60).optional(),
  modules: z.array(z.string()),
  limits: z.record(z.string()),
  features: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), included: z.boolean() })),
});
type PlanForm = z.infer<typeof schema>;

const blank: PlanForm = { name: '', slug: '', description: '', monthlyPrice: 0, annualPrice: 0, currency: 'INR', trialDays: 14, status: 'DRAFT', displayOrder: 0, highlighted: false, publicVisibility: true, isDefault: false, badge: '', ctaLabel: '', modules: [], limits: {}, features: [] };

function toForm(p: any): PlanForm {
  return { ...blank, ...p, description: p.description ?? '', badge: p.badge ?? '', ctaLabel: p.ctaLabel ?? '', limits: Object.fromEntries(Object.entries(p.limits ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])), features: (p.features ?? []).map((f: any) => ({ key: f.key, label: f.label, included: f.included !== false })) };
}

export default function PlansPage() {
  const plans = usePlans(true);
  const modules = usePlatformModules();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const archive = useArchivePlan();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | null | 'new'>(null);
  const form = useForm<PlanForm>({ resolver: zodResolver(schema), defaultValues: blank });
  const features = useFieldArray({ control: form.control, name: 'features' });
  const societyModules = (modules.data ?? []).filter((m: any) => m.scope === 'SOCIETY' && !m.isCore);

  React.useEffect(() => {
    if (editing === 'new') form.reset(blank);
    else if (editing) form.reset(toForm(editing));
  }, [editing, form]);

  const submit = (v: PlanForm) => {
    const payload = { ...v, limits: Object.fromEntries(Object.entries(v.limits).filter(([, val]) => val !== '').map(([k, val]) => [k, Number(val)])) };
    const onError = (e: unknown) => applyServerErrors(form, e);
    if (editing === 'new') create.mutate(payload, { onSuccess: () => { toast.success('Plan created'); setEditing(null); }, onError });
    else update.mutate({ id: editing.id, ...payload }, { onSuccess: () => { toast.success('Plan updated'); setEditing(null); }, onError });
  };

  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Plans" description="Pricing, limits and module bundles. Changes apply to the public site and every society on the plan immediately." actions={<Button onClick={() => setEditing('new')}><Plus /> New plan</Button>} />
      <DataTable
        rows={plans.data}
        loading={plans.isLoading}
        error={plans.error}
        rowKey={(p: any) => p.id}
        columns={[
          { key: 'name', header: 'Plan', cell: (p: any) => (
              <div>
                <p className="font-medium">{p.name} {p.isDefault ? <Badge variant="info" className="ml-1">Default</Badge> : null} {p.highlighted ? <Badge variant="secondary" className="ml-1">Highlighted</Badge> : null}</p>
                <p className="text-xs text-muted-foreground">/{p.slug} · order {p.displayOrder}</p>
              </div>
            ) },
          { key: 'price', header: 'Price', cell: (p: any) => `${formatCurrency(p.monthlyPrice, p.currency)}/mo · ${formatCurrency(p.annualPrice, p.currency)}/yr` },
          { key: 'trial', header: 'Trial', hideBelow: 'md', cell: (p: any) => `${p.trialDays} days` },
          { key: 'modules', header: 'Modules', hideBelow: 'lg', cell: (p: any) => `${p.modules.length}` },
          { key: 'subs', header: 'Societies', cell: (p: any) => `${p.activeSubscriptions} active / ${p.subscriptions}` },
          { key: 'status', header: 'Status', cell: (p: any) => <div className="flex gap-1"><StatusBadge status={p.status} />{!p.publicVisibility ? <Badge variant="muted">Hidden</Badge> : null}</div> },
          { key: 'actions', header: '', cell: (p: any) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(p)} aria-label="Edit"><Pencil /></Button>
                {p.status !== 'ARCHIVED' ? <Button variant="ghost" size="icon-sm" aria-label="Archive" onClick={async () => { if (await confirm({ title: `Archive ${p.name}?`, description: 'Existing subscriptions keep working; the plan is hidden from signup and plan changes.', destructive: true, confirmLabel: 'Archive' })) archive.mutate(p.id, { onSuccess: () => toast.success('Plan archived') }); }}><Archive /></Button> : null}
              </div>
            ) },
        ]}
      />

      <Sheet open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editing === 'new' ? 'New plan' : `Edit ${editing?.name ?? ''}`}</SheetTitle>
            <SheetDescription>Leave a limit empty for unlimited.</SheetDescription>
          </SheetHeader>
          <form className="mt-6 space-y-6" onSubmit={form.handleSubmit(submit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Name" required />
              <TextField control={form.control} name="slug" label="Slug" required hint="Used in URLs, e.g. growth" />
              <TextareaField control={form.control} name="description" label="Description" className="sm:col-span-2" rows={2} />
              <TextField control={form.control} name="monthlyPrice" label="Monthly price" type="number" min={0} />
              <TextField control={form.control} name="annualPrice" label="Annual price" type="number" min={0} />
              <TextField control={form.control} name="currency" label="Currency" maxLength={3} />
              <TextField control={form.control} name="trialDays" label="Trial days" type="number" min={0} />
              <SelectField control={form.control} name="status" label="Status" options={['DRAFT', 'ACTIVE', 'ARCHIVED'].map((s) => ({ value: s, label: formatStatus(s) }))} />
              <TextField control={form.control} name="displayOrder" label="Display order" type="number" />
              <TextField control={form.control} name="badge" label="Badge" placeholder="Most popular" />
              <TextField control={form.control} name="ctaLabel" label="CTA label" placeholder="Start free trial" />
              <SwitchField control={form.control} name="highlighted" label="Highlight on pricing page" />
              <SwitchField control={form.control} name="publicVisibility" label="Visible on public site" />
              <SwitchField control={form.control} name="isDefault" label="Default plan for signup" className="sm:col-span-2" />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Modules included</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {societyModules.map((m: any) => (
                  <label key={m.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox checked={form.watch('modules').includes(m.key)} onCheckedChange={(v) => { const cur = form.getValues('modules'); form.setValue('modules', v ? [...cur, m.key] : cur.filter((k) => k !== m.key)); }} />
                    <span className="flex-1">{m.name}</span>
                    {m.dependencies?.length ? <span className="text-[10px] text-muted-foreground">needs {m.dependencies.join(', ')}</span> : null}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Core modules (dashboard, settings, notifications, support) are always included.</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Limits</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {LIMIT_KEYS.map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`limit-${key}`}>{label}</Label>
                    <Input id={`limit-${key}`} type="number" min={0} placeholder="Unlimited" {...form.register(`limits.${key}` as const)} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Feature bullets (pricing page)</p>
                <Button type="button" variant="outline" size="sm" onClick={() => features.append({ key: `feature_${features.fields.length + 1}`, label: '', included: true })}><Plus /> Add</Button>
              </div>
              <div className="space-y-2">
                {features.fields.map((f, i) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <Checkbox checked={form.watch(`features.${i}.included`)} onCheckedChange={(v) => form.setValue(`features.${i}.included`, v === true)} aria-label="Included" />
                    <Input placeholder="Feature label" {...form.register(`features.${i}.label` as const)} />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => features.remove(i)} aria-label="Remove"><Trash2 /></Button>
                  </div>
                ))}
              </div>
            </div>
            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={create.isPending || update.isPending}>Save plan</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
