import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useReceipt } from '@/hooks/use-payments';
import { formatCurrency, formatDate, formatDateTime, formatStatus } from '@/lib/utils';

function amountInWords(n: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const below1000 = (x: number): string => (x < 20 ? ones[x] : x < 100 ? `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}` : `${ones[Math.floor(x / 100)]} hundred${x % 100 ? ` ${below1000(x % 100)}` : ''}`);
  const whole = Math.floor(n);
  if (whole === 0) return 'zero';
  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000);
  const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1000);
  const rest = whole % 1000;
  if (crore) parts.push(`${below1000(crore)} crore`);
  if (lakh) parts.push(`${below1000(lakh)} lakh`);
  if (thousand) parts.push(`${below1000(thousand)} thousand`);
  if (rest) parts.push(below1000(rest));
  const paise = Math.round((n - whole) * 100);
  return `${parts.join(' ')}${paise ? ` and ${below1000(paise)} paise` : ''}`;
}

/** Printable payment receipt (society letterhead). Used by finance staff and by members for their own payments. */
export default function ReceiptPage({ mode = 'admin' }: { mode?: 'admin' | 'member' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const receipt = useReceipt(id);
  if (receipt.isLoading) return <PageSkeleton />;
  if (receipt.isError || !receipt.data) return <ErrorState error={receipt.error} onRetry={() => receipt.refetch()} />;
  const { payment: p, society, invoices } = receipt.data;
  const address = society?.address ?? {};
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2">Receipt {p.receiptNumber} <StatusBadge status={p.status} /></span>} description={`${formatCurrency(p.amount)} received on ${formatDate(p.receivedAt)} via ${formatStatus(p.method)}`} actions={<><Button variant="ghost" onClick={() => navigate(mode === 'member' ? '/app/my/payments' : '/app/payments')}><ArrowLeft /> Back</Button><Button onClick={() => window.print()}><Printer /> Print / PDF</Button></>} />
      <div className="mx-auto max-w-2xl rounded-lg border bg-card p-6 print:max-w-none print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">{society?.logoUrl ? <img src={society.logoUrl} alt="" className="h-12 w-12 rounded object-cover" /> : null}<div><p className="text-lg font-semibold">{society?.name}</p><p className="text-xs text-muted-foreground">{[address.line1, address.city, address.state, address.pincode].filter(Boolean).join(', ')}</p>{society?.contact?.phone || society?.contact?.email ? <p className="text-xs text-muted-foreground">{[society.contact?.phone, society.contact?.email].filter(Boolean).join(' · ')}</p> : null}</div></div>
          <div className="text-right"><p className="text-xs uppercase tracking-wide text-muted-foreground">Payment receipt</p><p className="text-lg font-semibold">{p.receiptNumber}</p><p className="text-xs text-muted-foreground">{formatDateTime(p.receivedAt)}</p></div>
        </div>
        <div className="grid gap-3 py-4 text-sm sm:grid-cols-2">
          <div><p className="text-xs uppercase text-muted-foreground">Received from</p><p className="font-medium">{p.payerName ?? p.residentId?.name ?? '—'}</p><p>Unit {p.unitId?.code}</p></div>
          <div className="sm:text-right"><p className="text-xs uppercase text-muted-foreground">Amount</p><p className="text-2xl font-semibold tabular">{formatCurrency(p.amount)}</p><p className="text-xs capitalize text-muted-foreground">Rupees {amountInWords(p.amount)} only</p></div>
          <div><p className="text-xs uppercase text-muted-foreground">Mode</p><p>{formatStatus(p.method)}{p.reference ? ` · ${p.reference}` : ''}{p.providerPaymentId ? ` · ${p.providerPaymentId}` : ''}</p></div>
          <div className="sm:text-right"><p className="text-xs uppercase text-muted-foreground">Recorded by</p><p>{p.recordedBy?.name ?? (p.provider !== 'manual' ? 'Online payment' : '—')}</p></div>
        </div>
        {p.allocations?.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Applied</TableHead><TableHead className="text-right">Invoice balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {p.allocations.map((a: any) => { const inv = invoices.find((i: any) => i.id === String(a.invoiceId)); return <TableRow key={String(a.invoiceId)}><TableCell className="font-medium">{a.invoiceNumber}</TableCell><TableCell>{inv?.period?.label ?? '—'}</TableCell><TableCell className="text-right tabular">{formatCurrency(a.amount)}</TableCell><TableCell className="text-right tabular">{inv ? formatCurrency(inv.balanceDue) : '—'}</TableCell></TableRow>; })}
              {p.unallocatedAmount ? <TableRow><TableCell colSpan={2}>Kept as advance against future invoices</TableCell><TableCell className="text-right tabular">{formatCurrency(p.unallocatedAmount)}</TableCell><TableCell /></TableRow> : null}
            </TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">Kept as advance: no open invoices at the time of payment.</p>}
        {p.refund?.at ? <p className="mt-4 rounded bg-destructive/10 p-2 text-xs text-destructive">Refund of {formatCurrency(p.refund.amount)} processed on {formatDate(p.refund.at)}: {p.refund.reason}</p> : null}
        <div className="mt-6 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span className="flex items-center gap-1">{p.signatureVerified ? <><ShieldCheck className="h-3.5 w-3.5" /> Gateway-verified online payment</> : 'Computer-generated receipt; no signature required.'}</span><span>Receipt {p.receiptNumber}</span></div>
      </div>
    </div>
  );
}

export function MemberReceiptPage() {
  return <ReceiptPage mode="member" />;
}
