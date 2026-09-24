import * as React from 'react';
import dayjs from 'dayjs';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Play, CheckCheck, Ban, Eye, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBillingConfig, useBillingRun, useBillingRuns, useCancelRun, useChargeHeads, useGenerateRun, useIssueRun, usePreviewRun } from '@/hooks/use-billing';
import { useBuildings } from '@/hooks/use-units';
import { formatCurrency, formatDate, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

function defaultPeriod(cycle: string) {
  const end = dayjs().subtract(1, 'month').endOf('month');
  const months = cycle === 'QUARTERLY' ? 3 : cycle === 'HALF_YEARLY' ? 6 : cycle === 'ANNUAL' ? 12 : 1;
  return { from: end.subtract(months - 1, 'month').startOf('month').format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') };
}

/** New billing run wizard: scope → preview → generate (→ optionally issue). */
function NewRunDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const config = useBillingConfig();
  const heads = useChargeHeads();
  const buildings = useBuildings();
  const preview = usePreviewRun();
  const generate = useGenerateRun();
  const [form, setForm] = React.useState<any>(null);
  const [step, setStep] = React.useState<'scope' | 'preview'>('scope');
  React.useEffect(() => {
    if (open && config.data && heads.data && !form) {
      const p = defaultPeriod(config.data.cycle);
      setForm({ periodFrom: p.from, periodTo: p.to, label: '', dueDate: '', chargeHeadIds: heads.data.filter((h: any) => h.frequency === 'RECURRING').map((h: any) => h.id), buildingIds: [], includePreviousBalance: true, issueImmediately: false, notes: '' });
      setStep('scope');
    }
    if (!open) setForm(null);
  }, [open, config.data, heads.data, form]);
  if (!form) return null;
  const payload = { periodFrom: new Date(form.periodFrom).toISOString(), periodTo: new Date(form.periodTo).toISOString(), label: form.label || undefined, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined, chargeHeadIds: form.chargeHeadIds, buildingIds: form.buildingIds.length ? form.buildingIds : undefined, includePreviousBalance: form.includePreviousBalance, issueImmediately: form.issueImmediately, notes: form.notes || undefined };
  const toggle = (key: 'chargeHeadIds' | 'buildingIds', id: string) => setForm({ ...form, [key]: form[key].includes(id) ? form[key].filter((x: string) => x !== id) : [...form[key], id] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{step === 'scope' ? 'Run billing cycle' : 'Preview'}</DialogTitle></DialogHeader>
        {step === 'scope' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="run-from">Period from *</Label><Input id="run-from" type="date" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="run-to">Period to *</Label><Input id="run-to" type="date" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="run-label">Label</Label><Input id="run-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={dayjs(form.periodFrom).format('MMM YYYY')} /></div>
            <div className="space-y-1.5"><Label htmlFor="run-due">Due date <span className="text-xs text-muted-foreground">(default: day {config.data?.dueDay} of next month)</span></Label><Input id="run-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Charge heads</Label>
              <div className="grid gap-1 sm:grid-cols-2">
                {(heads.data ?? []).map((h: any) => (
                  <label key={h.id} className="flex items-center gap-2 rounded border p-2 text-sm"><Checkbox checked={form.chargeHeadIds.includes(h.id)} onCheckedChange={() => toggle('chargeHeadIds', h.id)} /><span className="flex-1">{h.name} <span className="text-xs text-muted-foreground">{formatStatus(h.type)}{h.frequency === 'ONE_TIME' ? ' · one-time' : ''}</span></span></label>
                ))}
                {!(heads.data ?? []).length ? <p className="text-sm text-muted-foreground">No active charge heads. <Link to="/app/billing/setup" className="text-primary hover:underline">Add them first</Link>.</p> : null}
              </div>
            </div>
            {(buildings.data ?? []).length > 1 ? <div className="space-y-1.5 sm:col-span-2"><Label>Buildings <span className="text-xs text-muted-foreground">(none = all)</span></Label><div className="flex flex-wrap gap-1.5">{(buildings.data ?? []).map((b: any) => <button type="button" key={b.id} onClick={() => toggle('buildingIds', b.id)} className={`rounded-full border px-2.5 py-0.5 text-xs ${form.buildingIds.includes(b.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{b.name}</button>)}</div></div> : null}
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="run-notes">Note on invoices</Label><Textarea id="run-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={config.data?.notes} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.includePreviousBalance} onCheckedChange={(v) => setForm({ ...form, includePreviousBalance: v })} /> Show previous balance</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.issueImmediately} onCheckedChange={(v) => setForm({ ...form, issueImmediately: v })} /> Issue immediately after generating</label>
          </div>
        ) : (
          <div className="space-y-3">
            {preview.data ? (
              <>
                <div className="flex flex-wrap gap-4 text-sm"><span><strong>{preview.data.count}</strong> invoices</span><span>Total <strong className="tabular">{formatCurrency(preview.data.totalAmount)}</strong></span><span>Period <strong>{preview.data.period.label}</strong></span>{preview.data.skipped.length ? <span className="text-muted-foreground">{preview.data.skipped.length} units skipped</span> : null}</div>
                <div className="max-h-[50vh] overflow-auto rounded border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Unit</TableHead><TableHead>Line items</TableHead><TableHead className="text-right">Prev. balance</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {preview.data.invoices.map((r: any) => (
                        <TableRow key={r.unitId}><TableCell className="font-medium">{r.unitCode}</TableCell><TableCell className="text-xs text-muted-foreground">{r.items.map((i: any) => `${i.description} ${formatCurrency(i.total)}`).join(' · ')}</TableCell><TableCell className="text-right tabular">{r.previousBalance ? formatCurrency(r.previousBalance) : '—'}</TableCell><TableCell className="text-right tabular font-medium">{formatCurrency(r.total)}</TableCell></TableRow>
                      ))}
                      {preview.data.skipped.map((s: any) => <TableRow key={`s-${s.unitCode}`} className="opacity-60"><TableCell>{s.unitCode}</TableCell><TableCell colSpan={3} className="text-xs">{s.reason}</TableCell></TableRow>)}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : <p className="text-sm text-muted-foreground">Calculating…</p>}
          </div>
        )}
        <DialogFooter>
          {step === 'scope' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button loading={preview.isPending} disabled={!form.chargeHeadIds.length} onClick={() => preview.mutate(payload, { onSuccess: () => setStep('preview'), onError: (e) => toast.error(getErrorMessage(e)) })}><Eye /> Preview</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('scope')}>Back</Button>
              <Button loading={generate.isPending} disabled={!preview.data?.count} onClick={() => generate.mutate(payload, { onSuccess: (run) => { toast.success(`${run.invoiceCount} invoices ${run.status === 'ISSUED' ? 'issued' : 'generated as drafts'}`); onOpenChange(false); navigate(`/app/billing/runs/${run.id}`); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Play /> Generate {preview.data?.count ?? ''} invoices</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const run = useBillingRun(id);
  const issue = useIssueRun();
  const cancel = useCancelRun();
  const { confirm, ConfirmElement } = useConfirm();
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState('');
  if (run.isLoading) return <PageSkeleton />;
  if (run.isError || !run.data) return <ErrorState error={run.error} onRetry={() => run.refetch()} />;
  const r = run.data;
  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title={<span className="flex items-center gap-2">{r.runNumber} <StatusBadge status={r.status} /></span>}
        description={`${r.period.label} · ${formatStatus(r.cycle)} · generated ${formatDateTime(r.createdAt)} by ${r.generatedBy?.name ?? '—'}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/app/billing/runs')}><ArrowLeft /> Runs</Button>
            <Button asChild variant="outline"><Link to={`/app/billing?billingRunId=${r.id}`}>View invoices</Link></Button>
            <SubscriptionGate>
              {r.status === 'DRAFT' ? <PermissionGate permission="billing:issue"><Button loading={issue.isPending} onClick={async () => { if (await confirm({ title: `Issue ${r.invoiceCount} invoices?`, description: 'Invoices are posted to unit ledgers and residents are notified as per your settings.', confirmLabel: 'Issue' })) issue.mutate(id, { onSuccess: () => toast.success('Invoices issued'), onError: (e) => toast.error(getErrorMessage(e)) }); }}><CheckCheck /> Issue all</Button></PermissionGate> : null}
              {r.status !== 'CANCELLED' ? <PermissionGate permission="billing:cancel"><Button variant="ghost" className="text-destructive" onClick={() => setCancelling(true)}><Ban /> Cancel run</Button></PermissionGate> : null}
            </SubscriptionGate>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
          <CardContent>
            <KeyValue columns={3} items={[{ label: 'Invoices', value: r.invoiceCount }, { label: 'Total billed', value: formatCurrency(r.totalAmount) }, { label: 'Charge heads', value: (r.chargeHeadIds ?? []).map((h: any) => h.name ?? h.code).join(', ') || '—', span: 3 }, { label: 'Buildings', value: r.unitFilter?.buildingIds?.length ? `${r.unitFilter.buildingIds.length} selected` : 'All' }, { label: 'Due date', value: r.options?.dueDate ? formatDate(r.options.dueDate) : 'Default' }, { label: 'Issued', value: r.issuedAt ? `${formatDateTime(r.issuedAt)} by ${r.issuedBy?.name ?? ''}` : '—' }]} />
            {r.summary?.length ? <div className="mt-4 flex flex-wrap gap-2">{r.summary.map((s: any) => <Badge key={s.status} variant="outline">{formatStatus(s.status)}: {s.count} · {formatCurrency(s.total)}{s.paid ? ` (paid ${formatCurrency(s.paid)})` : ''}</Badge>)}</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Skipped units</CardTitle><CardDescription>Units that did not get an invoice.</CardDescription></CardHeader>
          <CardContent>{r.skipped?.length ? <ul className="space-y-1 text-sm">{r.skipped.map((s: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{s.unitCode}</span><span className="text-xs text-muted-foreground">{s.reason}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">None.</p>}</CardContent>
        </Card>
      </div>
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Cancel {r.runNumber}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">All invoices in this run are voided. Runs with recorded payments cannot be cancelled.</p>
          <div className="space-y-1.5"><Label htmlFor="run-cancel-reason">Reason *</Label><Textarea id="run-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setCancelling(false)}>Keep</Button><Button variant="destructive" loading={cancel.isPending} disabled={reason.trim().length < 2} onClick={() => cancel.mutate({ id, reason }, { onSuccess: () => { toast.success('Run cancelled'); setCancelling(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Cancel run</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BillingRunsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const list = useListState({ sort: '-createdAt' });
  const runs = useBillingRuns(list.params);
  const [creating, setCreating] = React.useState(params.get('new') === '1');
  React.useEffect(() => { if (params.get('new') === '1') { setCreating(true); params.delete('new'); setParams(params, { replace: true }); } }, [params, setParams]);
  if (id) return <RunDetail id={id} />;
  return (
    <div>
      <PageHeader title="Billing runs" description="Each run generates one invoice per unit for a period. Review drafts, then issue them together." actions={<SubscriptionGate><PermissionGate permission="billing:generate"><Button onClick={() => setCreating(true)}><Play /> Run billing cycle</Button></PermissionGate></SubscriptionGate>} />
      <DataTable
        rows={runs.data?.items}
        loading={runs.isFetching}
        error={runs.error}
        onRetry={() => runs.refetch()}
        rowKey={(r: any) => r.id}
        sort={list.sort}
        onSortChange={list.setSort}
        onRowClick={(r: any) => navigate(`/app/billing/runs/${r.id}`)}
        emptyTitle="No billing runs yet"
        emptyDescription="Generate your first cycle once charge heads are configured."
        columns={[
          { key: 'runNumber', header: 'Run', cell: (r: any) => <span className="font-medium">{r.runNumber}</span> },
          { key: 'period.from', header: 'Period', sortable: true, cell: (r: any) => r.period?.label },
          { key: 'invoiceCount', header: 'Invoices', className: 'text-right', headerClassName: 'text-right', cell: (r: any) => r.invoiceCount },
          { key: 'totalAmount', header: 'Total', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (r: any) => <span className="tabular">{formatCurrency(r.totalAmount)}</span> },
          { key: 'createdAt', header: 'Generated', sortable: true, hideBelow: 'md', cell: (r: any) => `${formatDate(r.createdAt)} · ${r.generatedBy?.name ?? ''}` },
          { key: 'status', header: 'Status', sortable: true, cell: (r: any) => <StatusBadge status={r.status} /> },
        ]}
        pagination={runs.data ? { page: runs.data.page, pages: runs.data.pages, total: runs.data.total, limit: runs.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <NewRunDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
