import * as React from 'react';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, BookOpenCheck, Landmark, Scale, PiggyBank, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate } from '@/components/common/gates';
import { ChartCard, SimpleBarChart, HorizontalBars } from '@/components/common/charts';
import { PageSkeleton } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Combobox } from '@/components/common/combobox';
import { useAccountingSummary, useAccountingTrend, useAccounts, useExportReport, useGeneralLedger, useReport } from '@/hooks/use-accounting';
import { formatCurrency, formatDate, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const money = (v: number) => formatCurrency(v);

function PeriodPicker({ from, to, onChange }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1"><Label htmlFor="rp-from" className="text-xs">From</Label><Input id="rp-from" type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} /></div>
      <div className="space-y-1"><Label htmlFor="rp-to" className="text-xs">To</Label><Input id="rp-to" type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} /></div>
    </div>
  );
}

function ReportRows({ rows, cols, footer }: { rows: any[]; cols: { key: string; label: string; money?: boolean; align?: 'right' }[]; footer?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow>{cols.map((c) => <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => <TableRow key={r.code ?? r.unitId ?? r.id ?? i}>{cols.map((c) => <TableCell key={c.key} className={c.align === 'right' ? 'text-right tabular' : ''}>{c.money ? money(r[c.key] ?? 0) : r[c.key]}</TableCell>)}</TableRow>)}
          {!rows.length ? <TableRow><TableCell colSpan={cols.length} className="text-center text-muted-foreground">Nothing to show for this period.</TableCell></TableRow> : null}
          {footer}
        </TableBody>
      </Table>
    </div>
  );
}

function Overview() {
  const summary = useAccountingSummary();
  const trend = useAccountingTrend();
  if (summary.isLoading) return <PageSkeleton />;
  const s = summary.data ?? {};
  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard label="Cash & bank" value={money(s.cashAndBank ?? 0)} icon={<Landmark />} tone="primary" to="/app/accounting/bank" />
        <StatCard label="Receivables" value={money(s.receivables ?? 0)} hint="member dues" icon={<Scale />} to="/app/billing" />
        <StatCard label="Payables" value={money(s.payables ?? 0)} hint="vendor bills" icon={<BookOpenCheck />} to="/app/expenses?paymentStatus=UNPAID" />
        <StatCard label="Surplus (YTD)" value={money(s.ytd?.surplus ?? 0)} hint={`Income ${money(s.ytd?.income ?? 0)} · Expense ${money(s.ytd?.expense ?? 0)}`} icon={<PiggyBank />} tone={(s.ytd?.surplus ?? 0) >= 0 ? 'success' : 'destructive'} />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Income vs expense (6 months)" loading={trend.isLoading} columns={[{ key: 'month', label: 'Month' }, { key: 'income', label: 'Income', format: money }, { key: 'expense', label: 'Expense', format: money }]} rows={trend.data ?? []}>
          <SimpleBarChart data={trend.data ?? []} xKey="month" series={[{ key: 'income', label: 'Income' }, { key: 'expense', label: 'Expense' }]} valueFormatter={(v) => formatCurrency(v, 'INR', { compact: true })} height={240} />
        </ChartCard>
        <Card>
          <CardHeader><CardTitle className="text-sm">Funds</CardTitle></CardHeader>
          <CardContent>{(s.funds ?? []).length ? <HorizontalBars data={(s.funds ?? []).map((f: any) => ({ label: f.name, value: f.balance }))} labelKey="label" valueKey="value" valueFormatter={money} /> : <p className="text-sm text-muted-foreground">No funds configured.</p>}<Button asChild variant="link" size="sm" className="mt-2 px-0"><Link to="/app/accounting/accounts?tab=funds">Manage funds <ArrowRight /></Link></Button></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Top expenses (YTD)</CardTitle></CardHeader>
          <CardContent>{(s.topExpenses ?? []).length ? <HorizontalBars data={(s.topExpenses ?? []).map((e: any) => ({ label: e.name, value: e.amount }))} labelKey="label" valueKey="value" valueFormatter={money} /> : <p className="text-sm text-muted-foreground">No expenses posted yet.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Income sources (YTD)</CardTitle></CardHeader>
          <CardContent>{(s.topIncome ?? []).length ? <HorizontalBars data={(s.topIncome ?? []).map((e: any) => ({ label: e.name, value: e.amount }))} labelKey="label" valueKey="value" valueFormatter={money} /> : <p className="text-sm text-muted-foreground">No income posted yet.</p>}{s.draftJournals ? <p className="mt-3 text-xs text-muted-foreground">{s.draftJournals} draft journal(s) waiting to be posted.</p> : null}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AccountingPage() {
  const [period, setPeriod] = React.useState({ from: toInputDate(dayjs().startOf('month').toDate()), to: toInputDate(new Date()) });
  const [asOf, setAsOf] = React.useState(toInputDate(new Date()));
  const [ledgerCode, setLedgerCode] = React.useState('');
  const range = { from: period.from ? new Date(period.from).toISOString() : undefined, to: period.to ? dayjs(period.to).endOf('day').toISOString() : undefined };
  const tb = useReport('trial-balance', { asOf: dayjs(asOf).endOf('day').toISOString() });
  const pl = useReport('income-expenditure', range);
  const bs = useReport('balance-sheet', { asOf: dayjs(asOf).endOf('day').toISOString() });
  const aging = useReport('receivables-aging', { asOf: dayjs(asOf).endOf('day').toISOString() });
  const dayBook = useReport('day-book', range);
  const accounts = useAccounts();
  const ledger = useGeneralLedger(ledgerCode, range);
  const exportReport = useExportReport();
  const exportBtn = (name: string, params: Record<string, unknown>) => <PermissionGate permission="accounting:export"><Button variant="outline" size="sm" loading={exportReport.isPending} onClick={() => exportReport.mutate({ name, params }, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> CSV</Button></PermissionGate>;
  return (
    <div>
      <PageHeader title="Accounting" description="Double-entry books: ledgers, funds, bank accounts and statutory reports." actions={<><Button asChild variant="outline"><Link to="/app/accounting/journals">Journals</Link></Button><Button asChild variant="outline"><Link to="/app/accounting/accounts">Chart of accounts</Link></Button><Button asChild variant="outline"><Link to="/app/accounting/bank">Bank & reconciliation</Link></Button></>} />
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="pl">Income & expenditure</TabsTrigger><TabsTrigger value="bs">Balance sheet</TabsTrigger><TabsTrigger value="tb">Trial balance</TabsTrigger><TabsTrigger value="ledger">General ledger</TabsTrigger><TabsTrigger value="aging">Receivables ageing</TabsTrigger><TabsTrigger value="daybook">Day book</TabsTrigger></TabsList>
        <TabsContent value="overview" className="mt-4"><Overview /></TabsContent>
        <TabsContent value="pl" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3"><PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />{exportBtn('income-expenditure', range)}</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><p className="mb-2 text-sm font-semibold">Income</p><ReportRows rows={pl.data?.income ?? []} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Amount', money: true, align: 'right' }]} footer={<TableRow className="font-semibold"><TableCell colSpan={2}>Total income</TableCell><TableCell className="text-right tabular">{money(pl.data?.totalIncome ?? 0)}</TableCell></TableRow>} /></div>
            <div><p className="mb-2 text-sm font-semibold">Expenditure</p><ReportRows rows={pl.data?.expense ?? []} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Amount', money: true, align: 'right' }]} footer={<TableRow className="font-semibold"><TableCell colSpan={2}>Total expenditure</TableCell><TableCell className="text-right tabular">{money(pl.data?.totalExpense ?? 0)}</TableCell></TableRow>} /></div>
          </div>
          <p className={`text-lg font-semibold ${(pl.data?.surplus ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>{(pl.data?.surplus ?? 0) >= 0 ? 'Surplus' : 'Deficit'}: {money(Math.abs(pl.data?.surplus ?? 0))}</p>
        </TabsContent>
        <TabsContent value="bs" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1"><Label htmlFor="bs-asof" className="text-xs">As of</Label><Input id="bs-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>{exportBtn('balance-sheet', { asOf })}</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><p className="mb-2 text-sm font-semibold">Assets</p><ReportRows rows={bs.data?.assets ?? []} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Balance', money: true, align: 'right' }]} footer={<TableRow className="font-semibold"><TableCell colSpan={2}>Total assets</TableCell><TableCell className="text-right tabular">{money(bs.data?.totalAssets ?? 0)}</TableCell></TableRow>} /></div>
            <div><p className="mb-2 text-sm font-semibold">Liabilities, funds & equity</p><ReportRows rows={[...(bs.data?.liabilities ?? []), ...(bs.data?.equity ?? []), { code: '', name: 'Accumulated surplus', amount: bs.data?.accumulatedSurplus ?? 0 }]} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Balance', money: true, align: 'right' }]} footer={<TableRow className="font-semibold"><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular">{money((bs.data?.totalLiabilities ?? 0) + (bs.data?.totalEquity ?? 0))}</TableCell></TableRow>} /></div>
          </div>
          {bs.data && bs.data.difference !== 0 ? <p className="text-sm text-destructive">Books are out of balance by {money(bs.data.difference)} — check unposted or manual entries.</p> : null}
        </TabsContent>
        <TabsContent value="tb" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1"><Label htmlFor="tb-asof" className="text-xs">As of</Label><Input id="tb-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>{exportBtn('trial-balance', { asOf })}</div>
          <ReportRows rows={tb.data?.rows ?? []} cols={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'type', label: 'Type' }, { key: 'debit', label: 'Debit', money: true, align: 'right' }, { key: 'credit', label: 'Credit', money: true, align: 'right' }]} footer={<TableRow className="font-semibold"><TableCell colSpan={3}>Totals</TableCell><TableCell className="text-right tabular">{money(tb.data?.totalDebit ?? 0)}</TableCell><TableCell className="text-right tabular">{money(tb.data?.totalCredit ?? 0)}</TableCell></TableRow>} />
        </TabsContent>
        <TabsContent value="ledger" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3"><div className="w-72 space-y-1"><Label className="text-xs">Account</Label><Combobox value={ledgerCode} onChange={(v) => setLedgerCode(v ?? '')} options={(accounts.data ?? []).map((a: any) => ({ value: a.code, label: `${a.code} · ${a.name}`, description: a.type }))} placeholder="Choose an account" /></div><PeriodPicker from={period.from} to={period.to} onChange={setPeriod} /></div>
          {ledgerCode && ledger.data ? (
            <>
              <p className="text-sm text-muted-foreground">Opening balance {money(ledger.data.openingBalance)} · closing balance <strong>{money(ledger.data.closingBalance)}</strong></p>
              <ReportRows rows={ledger.data.rows.map((r: any) => ({ ...r, id: `${r.entryId}-${r.debit}-${r.credit}`, date: formatDate(r.date), ref: r.refNumber ?? '' }))} cols={[{ key: 'date', label: 'Date' }, { key: 'entryNumber', label: 'Journal' }, { key: 'narration', label: 'Narration' }, { key: 'ref', label: 'Ref' }, { key: 'debit', label: 'Debit', money: true, align: 'right' }, { key: 'credit', label: 'Credit', money: true, align: 'right' }, { key: 'balance', label: 'Balance', money: true, align: 'right' }]} />
            </>
          ) : <p className="text-sm text-muted-foreground">Pick an account to see its ledger.</p>}
        </TabsContent>
        <TabsContent value="aging" className="mt-4 space-y-3">
          <div className="flex justify-end">{exportBtn('receivables-aging', { asOf })}</div>
          <ReportRows rows={aging.data?.rows ?? []} cols={[{ key: 'unitCode', label: 'Unit' }, ...(aging.data?.buckets ?? []).map((b: any) => ({ key: b.key, label: b.label, money: true, align: 'right' as const })), { key: 'total', label: 'Total', money: true, align: 'right' }]} footer={aging.data ? <TableRow className="font-semibold"><TableCell>Total</TableCell>{aging.data.buckets.map((b: any) => <TableCell key={b.key} className="text-right tabular">{money(aging.data.totals[b.key])}</TableCell>)}<TableCell className="text-right tabular">{money(aging.data.grandTotal)}</TableCell></TableRow> : undefined} />
        </TabsContent>
        <TabsContent value="daybook" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3"><PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />{exportBtn('day-book', range)}</div>
          <div className="space-y-2">
            {(dayBook.data ?? []).map((e: any) => (
              <Card key={e.id}><CardContent className="p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><Link to={`/app/accounting/journals/${e.id}`} className="font-medium text-primary hover:underline">{e.entryNumber}</Link> · {formatDate(e.date)} · {e.narration}</span><span className="tabular">{money(e.totalDebit)}</span></div><ul className="mt-1 text-xs text-muted-foreground">{e.lines.map((l: any) => <li key={l._id ?? l.id} className="flex justify-between"><span>{l.accountCode} {l.accountName}</span><span className="tabular">{l.debit ? `Dr ${money(l.debit)}` : `Cr ${money(l.credit)}`}</span></li>)}</ul></CardContent></Card>
            ))}
            {!dayBook.isLoading && !(dayBook.data ?? []).length ? <p className="text-sm text-muted-foreground">No postings in this period.</p> : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
