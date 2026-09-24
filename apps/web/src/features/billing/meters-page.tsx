import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Upload, Trash2, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDeleteMeterReading, useImportMeterReadings, useMeterReadings, useMeterTypes, useRecordMeterReading } from '@/hooks/use-billing';
import { useUnitOptions } from '@/hooks/use-units';
import { formatDate, formatNumber, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const SAMPLE = 'unitCode,meterType,currentReading,readingDate\nA-101,WATER,1240,2025-03-31\nA-102,WATER,980,2025-03-31';

export default function MetersPage() {
  const list = useListState({ sort: '-readingDate' });
  const readings = useMeterReadings(list.params);
  const types = useMeterTypes();
  const units = useUnitOptions();
  const record = useRecordMeterReading();
  const importCsv = useImportMeterReadings();
  const remove = useDeleteMeterReading();
  const { confirm, ConfirmElement } = useConfirm();
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [form, setForm] = React.useState({ unitId: '', meterType: 'WATER', currentReading: '', previousReading: '', readingDate: toInputDate(new Date()), notes: '' });
  const [csv, setCsv] = React.useState('');
  const [importResult, setImportResult] = React.useState<any>(null);
  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title="Meter readings"
        description="Water, electricity, gas or any custom meter. Consumption feeds metered charge heads in the next billing run."
        actions={
          <SubscriptionGate>
            <PermissionGate permission="billing:meter_readings">
              <Button variant="outline" onClick={() => { setImportResult(null); setImporting(true); }}><Upload /> Import CSV</Button>
              <Button onClick={() => setAdding(true)}><Plus /> Record reading</Button>
            </PermissionGate>
          </SubscriptionGate>
        }
      />
      <FilterBar onReset={list.reset}>
        <FilterSelect value={list.filters.meterType ?? ''} onChange={(v) => list.setFilter('meterType', v)} options={(types.data ?? []).map((t) => ({ value: t, label: t }))} allLabel="All meter types" />
        <FilterSelect value={list.filters.billed ?? ''} onChange={(v) => list.setFilter('billed', v)} options={[{ value: 'false', label: 'Not yet billed' }, { value: 'true', label: 'Billed' }]} allLabel="Billed & unbilled" />
      </FilterBar>
      <DataTable
        rows={readings.data?.items}
        loading={readings.isFetching}
        error={readings.error}
        onRetry={() => readings.refetch()}
        rowKey={(r: any) => r.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No readings yet"
        emptyDescription="Record readings one by one or import a CSV from your meter reader."
        columns={[
          { key: 'unit', header: 'Unit', cell: (r: any) => <span className="font-medium">{r.unitId?.code}<span className="block text-xs text-muted-foreground">{r.unitId?.buildingId?.name}</span></span> },
          { key: 'meterType', header: 'Meter', sortable: true, cell: (r: any) => <Badge variant="outline"><Gauge className="mr-1 h-3 w-3" />{r.meterType}</Badge> },
          { key: 'readingDate', header: 'Date', sortable: true, cell: (r: any) => formatDate(r.readingDate) },
          { key: 'reading', header: 'Previous → current', hideBelow: 'md', cell: (r: any) => <span className="tabular">{formatNumber(r.previousReading)} → {formatNumber(r.currentReading)}</span> },
          { key: 'consumption', header: 'Consumption', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (r: any) => <span className="tabular font-medium">{formatNumber(r.consumption, 2)}</span> },
          { key: 'billed', header: 'Billing', cell: (r: any) => (r.billed ? <Badge variant="success">Billed</Badge> : <Badge variant="muted">Pending</Badge>) },
          { key: 'source', header: 'Source', hideBelow: 'lg', cell: (r: any) => `${r.source} · ${r.recordedBy?.name ?? ''}` },
          { key: 'actions', header: '', className: 'text-right', cell: (r: any) => (!r.billed ? <PermissionGate permission="billing:meter_readings"><Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: 'Delete this reading?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(r.id, { onSuccess: () => toast.success('Reading deleted'), onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 /></Button></PermissionGate> : null) },
        ]}
        pagination={readings.data ? { page: readings.data.page, pages: readings.data.pages, total: readings.data.total, limit: readings.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record a meter reading</DialogTitle><DialogDescription>Consumption = (current − previous) × meter multiplier. The previous reading defaults to the last one recorded.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Unit *</Label><Combobox value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v ?? '' })} options={units.data ?? []} placeholder="Select unit" /></div>
            <div className="space-y-1.5"><Label htmlFor="mr-type">Meter type *</Label><Input id="mr-type" list="mr-types" value={form.meterType} onChange={(e) => setForm({ ...form, meterType: e.target.value.toUpperCase() })} /><datalist id="mr-types">{['WATER', 'ELECTRICITY', 'GAS', ...(types.data ?? [])].filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t} value={t} />)}</datalist></div>
            <div className="space-y-1.5"><Label htmlFor="mr-date">Reading date</Label><Input id="mr-date" type="date" value={form.readingDate} onChange={(e) => setForm({ ...form, readingDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="mr-current">Current reading *</Label><Input id="mr-current" type="number" min={0} step="0.01" value={form.currentReading} onChange={(e) => setForm({ ...form, currentReading: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="mr-previous">Previous reading <span className="text-xs text-muted-foreground">(optional override)</span></Label><Input id="mr-previous" type="number" min={0} step="0.01" value={form.previousReading} onChange={(e) => setForm({ ...form, previousReading: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="mr-notes">Notes</Label><Textarea id="mr-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button loading={record.isPending} disabled={!form.unitId || !form.meterType || form.currentReading === ''} onClick={() => record.mutate({ unitId: form.unitId, meterType: form.meterType, currentReading: Number(form.currentReading), previousReading: form.previousReading === '' ? undefined : Number(form.previousReading), readingDate: form.readingDate ? new Date(form.readingDate).toISOString() : undefined, notes: form.notes || undefined }, { onSuccess: (r) => { toast.success(`Reading saved · consumption ${formatNumber(r.consumption, 2)}`); setAdding(false); setForm({ ...form, unitId: '', currentReading: '', previousReading: '', notes: '' }); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Save reading</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Import readings from CSV</DialogTitle><DialogDescription>Columns: unitCode, meterType, currentReading, readingDate (optional), previousReading (optional). Paste the file contents or upload it.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} aria-label="CSV file" />
            <Textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} className="font-mono text-xs" aria-label="CSV contents" />
            {importResult ? (
              <div className="rounded border p-3 text-sm">
                <p className="font-medium">{importResult.saved} saved · {importResult.failed} failed</p>
                {importResult.results.filter((r: any) => !r.ok).length ? <ul className="mt-1 max-h-40 overflow-auto text-xs text-destructive">{importResult.results.filter((r: any) => !r.ok).map((r: any) => <li key={r.line}>Line {r.line} {r.unitCode}: {r.error}</li>)}</ul> : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImporting(false)}>Close</Button>
            <Button loading={importCsv.isPending} disabled={!csv.trim()} onClick={() => importCsv.mutate({ csv }, { onSuccess: (r) => { setImportResult(r); toast.success(`${r.saved} readings imported`); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Upload /> Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
