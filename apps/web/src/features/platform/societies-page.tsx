import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Copy } from 'lucide-react';
import { SocietyTypes, SubscriptionStatus, emailSchema, phoneSchema } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextField, SelectField, SwitchField, applyServerErrors } from '@/components/common/form';
import { useCreateSociety, usePlans, useSocieties } from '@/hooks/use-platform';
import { formatCurrency, formatDate, formatStatus } from '@/lib/utils';

const createSchema = z.object({
  society: z.object({ name: z.string().trim().min(3).max(160), type: z.enum(SocietyTypes).default('APARTMENT'), city: z.string().trim().max(80).optional(), totalUnits: z.coerce.number().int().min(0).optional() }),
  admin: z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, phone: phoneSchema.optional().or(z.literal('')) }),
  planId: z.string().min(1, 'Select a plan'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  startTrial: z.boolean().default(true),
});
type CreateInput = z.infer<typeof createSchema>;

export default function SocietiesPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const list = useListState({ sort: '-createdAt' });
  React.useEffect(() => {
    const s = params.get('subscriptionStatus');
    if (s) list.setFilter('subscriptionStatus', s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const societies = useSocieties(list.params);
  const plans = usePlans();
  const create = useCreateSociety();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const form = useForm<CreateInput>({ resolver: zodResolver(createSchema), defaultValues: { society: { name: '', type: 'APARTMENT', city: '' }, admin: { name: '', email: '', phone: '' }, planId: '', billingCycle: 'MONTHLY', startTrial: true } });

  return (
    <div>
      <PageHeader
        title="Societies"
        description="Every tenant on the platform with its plan and subscription state."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New society
          </Button>
        }
      />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, city, email…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'SUSPENDED', 'ARCHIVED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
        <FilterSelect value={list.filters.subscriptionStatus ?? ''} onChange={(v) => list.setFilter('subscriptionStatus', v)} options={Object.values(SubscriptionStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any subscription" />
        <FilterSelect value={list.filters.planId ?? ''} onChange={(v) => list.setFilter('planId', v)} options={(plans.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))} allLabel="Any plan" />
        <FilterSelect value={list.filters.expiringWithinDays ?? ''} onChange={(v) => list.setFilter('expiringWithinDays', v)} options={[{ value: '7', label: 'Expiring in 7 days' }, { value: '30', label: 'Expiring in 30 days' }]} allLabel="Any renewal" />
      </FilterBar>
      <DataTable
        rows={societies.data?.items}
        loading={societies.isFetching}
        error={societies.error}
        onRetry={() => societies.refetch()}
        rowKey={(s: any) => s.id}
        onRowClick={(s: any) => navigate(`/admin/societies/${s.id}`)}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No societies match"
        columns={[
          { key: 'name', header: 'Society', sortable: true, cell: (s: any) => (
              <div>
                <Link to={`/admin/societies/${s.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{s.name}</Link>
                <p className="text-xs text-muted-foreground">{s.address?.city ?? '—'} · {formatStatus(s.type)}</p>
              </div>
            ) },
          { key: 'admin', header: 'Admin', hideBelow: 'md', cell: (s: any) => (
              <div className="text-xs">
                <p>{s.admin?.name ?? '—'}</p>
                <p className="text-muted-foreground">{s.admin?.email}</p>
              </div>
            ) },
          { key: 'plan', header: 'Plan', cell: (s: any) => s.plan?.name ?? '—' },
          { key: 'subscription', header: 'Subscription', cell: (s: any) => <StatusBadge status={s.subscription?.status ?? 'NONE'} /> },
          { key: 'renewalDate', header: 'Renewal', sortable: true, hideBelow: 'md', cell: (s: any) => formatDate(s.subscription?.renewalDate) },
          { key: 'units', header: 'Units / Users', hideBelow: 'lg', cell: (s: any) => `${s.stats?.units ?? 0} / ${s.stats?.users ?? 0}` },
          { key: 'status', header: 'Status', cell: (s: any) => <StatusBadge status={s.status} /> },
          { key: 'createdAt', header: 'Created', sortable: true, hideBelow: 'lg', cell: (s: any) => formatDate(s.createdAt) },
        ]}
        pagination={societies.data ? { page: societies.data.page, pages: societies.data.pages, total: societies.data.total, limit: societies.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResult(null); form.reset(); } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create a society</DialogTitle>
            <DialogDescription>Creates the society, its default roles, the admin account and the subscription in one step.</DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="space-y-4">
              <Alert variant="success">
                <AlertDescription>
                  <strong>{result.society.name}</strong> is ready. {result.admin.existed ? 'The existing account was made administrator.' : 'A temporary password was generated for the administrator.'}
                </AlertDescription>
              </Alert>
              {result.tempPassword ? (
                <div className="rounded-md border bg-muted p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Temporary password for {result.admin.email} (shown once)</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="font-mono text-base">{result.tempPassword}</code>
                    <Button variant="ghost" size="icon-sm" onClick={() => { void navigator.clipboard.writeText(result.tempPassword); toast.success('Copied'); }} aria-label="Copy password">
                      <Copy />
                    </Button>
                  </div>
                </div>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
                <Button onClick={() => navigate(`/admin/societies/${result.society.id}`)}>Open society</Button>
              </DialogFooter>
            </div>
          ) : (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => create.mutate(v, { onSuccess: (data) => setResult(data), onError: (e) => applyServerErrors(form, e) }))} noValidate>
              <TextField control={form.control} name="society.name" label="Society name" required className="sm:col-span-2" />
              <SelectField control={form.control} name="society.type" label="Type" options={SocietyTypes.map((t) => ({ value: t, label: formatStatus(t) }))} />
              <TextField control={form.control} name="society.city" label="City" />
              <TextField control={form.control} name="admin.name" label="Admin name" required />
              <TextField control={form.control} name="admin.email" label="Admin email" type="email" required />
              <TextField control={form.control} name="admin.phone" label="Admin phone" type="tel" />
              <TextField control={form.control} name="society.totalUnits" label="Approx. units" type="number" />
              <SelectField control={form.control} name="planId" label="Plan" required options={(plans.data ?? []).filter((p: any) => p.status === 'ACTIVE').map((p: any) => ({ value: p.id, label: `${p.name} · ${formatCurrency(p.monthlyPrice, p.currency)}/mo` }))} />
              <SelectField control={form.control} name="billingCycle" label="Billing cycle" options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'ANNUAL', label: 'Annual' }]} />
              <SwitchField control={form.control} name="startTrial" label="Start with a trial" description="Off = ACTIVE immediately (payment recorded offline)" className="sm:col-span-2" />
              <DialogFooter className="sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" loading={create.isPending}>Create society</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
