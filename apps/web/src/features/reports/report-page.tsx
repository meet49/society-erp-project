import * as React from 'react';
import dayjs from 'dayjs';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ChartCard, HorizontalBars, SimpleBarChart, SimpleLineChart } from '@/components/common/charts';
import { PermissionGate } from '@/components/common/gates';
import { ErrorState } from '@/components/common/error-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useExportReportCsv, useReportRun, type ReportColumn } from '@/hooks/use-reports';
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const PRESETS = [{ key: '30d', label: 'Last 30 days', from: () => dayjs().subtract(29, 'day') }, { key: '3m', label: 'Last 3 months', from: () => dayjs().subtract(3, 'month').add(1, 'day') }, { key: '6m', label: 'Last 6 months', from: () => dayjs().subtract(6, 'month').add(1, 'day') }, { key: '12m', label: 'Last 12 months', from: () => dayjs().subtract(12, 'month').add(1, 'day') }, { key: 'fy', label: 'This financial year', from: () => (dayjs().month() >= 3 ? dayjs().month(3).startOf('month') : dayjs().subtract(1, 'year').month(3).startOf('month')) }];

export function formatCell(value: unknown, col: ReportColumn): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  switch (col.type) {
    case 'currency': return formatCurrency(Number(value));
    case 'percent': return `${formatNumber(Number(value), 1)}%`;
    case 'hours': return `${formatNumber(Number(value), 1)} h`;
    case 'number': return formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2);
    case 'date': return formatDate(String(value));
    default: return String(value);
  }
}

/** One report: parameter bar, chart (when the definition has one), full table with totals, CSV export. */
export default function ReportPage() {
  const { key = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const [from, setFrom] = React.useState(search.get('from') ?? '');
  const [to, setTo] = React.useState(search.get('to') ?? '');
  const [month, setMonth] = React.useState(search.get('month') ?? dayjs().format('YYYY-MM'));
  const [asOf, setAsOf] = React.useState(search.get('asOf') ?? dayjs().format('YYYY-MM-DD'));
  const [months, setMonths] = React.useState(search.get('months') ?? '6');
  const params = React.useMemo(() => ({ from: from || undefined, to: to || undefined, month, asOf, months }), [from, to, month, asOf, months]);
  const run = useReportRun(key, params);
  const exportCsv = useExportReportCsv();
  React.useEffect(() => { const next = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v) next.set(k, String(v)); }); setSearch(next, { replace: true }); }, [params, setSearch]);
  if (run.isLoading) return <PageSkeleton />;
  if (run.isError) return <ErrorState error={run.error} onRetry={() => run.refetch()} />;
  const d = run.data!;
  const r = d.report;
  const wants = (p: string) => r.params.includes(p as any);
  const money = r.chart?.currency;
  const fmt = (v: number) => (money ? formatCurrency(v, 'INR', { compact: true }) : formatNumber(v));
  const chartRows = d.rows.slice(0, r.chart?.type === 'hbar' ? 12 : 60);
  return (
    <div>
      <PageHeader title={r.name} description={r.description} breadcrumbs={[{ label: 'Reports', to: '/app/reports' }]} actions={<span className="flex gap-2"><Button asChild variant="ghost" size="sm"><Link to="/app/reports"><ArrowLeft /> All reports</Link></Button><PermissionGate permission="reports:export"><Button size="sm" variant="outline" loading={exportCsv.isPending} onClick={() => exportCsv.mutate({ key, params }, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export CSV</Button></PermissionGate></span>} />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        {wants('period') ? <>
          <div className="space-y-1"><Label htmlFor="rp-preset" className="text-xs">Quick range</Label><Select value={PRESETS.find((p) => p.from().format('YYYY-MM-DD') === from && (to === dayjs().format('YYYY-MM-DD') || !to))?.key ?? 'custom'} onValueChange={(v) => { const p = PRESETS.find((x) => x.key === v); if (p) { setFrom(p.from().format('YYYY-MM-DD')); setTo(dayjs().format('YYYY-MM-DD')); } }}><SelectTrigger id="rp-preset" className="w-44"><SelectValue placeholder="Custom" /></SelectTrigger><SelectContent><SelectItem value="custom">Custom</SelectItem>{PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="rp-from" className="text-xs">From</Label><Input id="rp-from" type="date" value={from || dayjs(d.params.from).format('YYYY-MM-DD')} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="rp-to" className="text-xs">To</Label><Input id="rp-to" type="date" value={to || dayjs(d.params.to).format('YYYY-MM-DD')} onChange={(e) => setTo(e.target.value)} /></div>
        </> : null}
        {wants('month') ? <div className="space-y-1"><Label htmlFor="rp-month" className="text-xs">Month</Label><Input id="rp-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div> : null}
        {wants('asOf') ? <div className="space-y-1"><Label htmlFor="rp-asof" className="text-xs">As of</Label><Input id="rp-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div> : null}
        {wants('months') ? <div className="space-y-1"><Label htmlFor="rp-months" className="text-xs">Months</Label><Select value={months} onValueChange={setMonths}><SelectTrigger id="rp-months" className="w-32"><SelectValue /></SelectTrigger><SelectContent>{['3', '6', '12', '24'].map((m) => <SelectItem key={m} value={m}>{m} months</SelectItem>)}</SelectContent></Select></div> : null}
        <span className="flex-1" />
        <p className="text-xs text-muted-foreground">Generated {dayjs(d.generatedAt).format('DD MMM YYYY, HH:mm')}{run.isFetching ? ' · refreshing…' : ''}</p>
      </div>
      {d.summary ? <div className="mb-4 flex flex-wrap gap-4 text-sm">{Object.entries(d.summary).map(([k, v]) => { const col = r.columns.find((c) => c.key === k); return <span key={k} className="rounded-md border bg-card px-3 py-2"><span className="block text-[11px] uppercase text-muted-foreground">{col?.label ?? k.replace(/([A-Z])/g, ' $1')}</span><span className="text-base font-semibold">{col ? formatCell(v, col) : typeof v === 'number' ? (money ? formatCurrency(v) : formatNumber(v)) : String(v)}</span></span>; })}</div> : null}
      {r.chart && d.rows.length ? (
        <ChartCard title={r.name} description={r.chart.type === 'hbar' && d.rows.length > 12 ? 'Top 12 shown in the chart; the table has everything.' : undefined} columns={r.columns.map((c) => ({ key: c.key, label: c.label, format: (v: any) => formatCell(v, c) }))} rows={chartRows} className="mb-4">
          {r.chart.type === 'line' ? <SimpleLineChart data={chartRows} xKey={r.chart.xKey} series={r.chart.series} valueFormatter={fmt} xFormatter={(v: any) => dayjs(String(v)).isValid() && String(v).length > 7 ? dayjs(String(v)).format('DD MMM') : String(v)} /> : r.chart.type === 'hbar' ? <HorizontalBars data={chartRows} labelKey={r.chart.xKey} valueKey={r.chart.series[0].key} valueFormatter={fmt} /> : <SimpleBarChart data={chartRows} xKey={r.chart.xKey} series={r.chart.series} valueFormatter={fmt} stacked={r.chart.stacked} />}
        </ChartCard>
      ) : null}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow>{r.columns.map((c) => <TableHead key={c.key} className={cn(c.type && c.type !== 'text' && c.type !== 'date' && 'text-right')}>{c.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {d.rows.map((row, i) => <TableRow key={i}>{r.columns.map((c) => <TableCell key={c.key} className={cn('tabular', c.type && c.type !== 'text' && c.type !== 'date' && 'text-right')}>{formatCell(row[c.key], c)}</TableCell>)}</TableRow>)}
            {!d.rows.length ? <TableRow><TableCell colSpan={r.columns.length} className="py-8 text-center text-muted-foreground">Nothing in this range.</TableCell></TableRow> : null}
            {d.totals && d.rows.length ? <TableRow className="bg-muted/40 font-semibold">{r.columns.map((c, i) => <TableCell key={c.key} className={cn('tabular', c.type && c.type !== 'text' && c.type !== 'date' && 'text-right')}>{i === 0 ? 'Total' : d.totals![c.key] !== undefined ? formatCell(d.totals![c.key], c) : ''}</TableCell>)}</TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
