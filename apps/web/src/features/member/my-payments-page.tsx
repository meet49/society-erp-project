import { Link } from 'react-router-dom';
import { Receipt, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePayments } from '@/hooks/use-payments';
import { formatCurrency, formatDate, formatStatus } from '@/lib/utils';

/** Resident self-service: every payment made for the member's unit(s), with printable receipts. */
export default function MyPaymentsPage() {
  const list = useListState({ sort: '-receivedAt' });
  const payments = usePayments(list.params);
  return (
    <div>
      <PageHeader title="My payments" description="Receipts for online and office payments." actions={<Button asChild variant="outline"><Link to="/app/my/bills"><Receipt /> Bills</Link></Button>} />
      <DataTable
        rows={payments.data?.items}
        loading={payments.isFetching}
        error={payments.error}
        onRetry={() => payments.refetch()}
        rowKey={(p: any) => p.id}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="No payments yet"
        emptyDescription="Payments you make online or at the office appear here with a receipt."
        columns={[
          { key: 'receivedAt', header: 'Date', sortable: true, cell: (p: any) => formatDate(p.receivedAt) },
          { key: 'receiptNumber', header: 'Receipt', cell: (p: any) => <Link to={`/app/my/payments/${p.id}`} className="font-medium text-primary hover:underline">{p.receiptNumber}</Link> },
          { key: 'unit', header: 'Unit', hideBelow: 'sm', cell: (p: any) => p.unitId?.code },
          { key: 'method', header: 'Method', hideBelow: 'md', cell: (p: any) => <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-muted-foreground" />{formatStatus(p.method)}{p.signatureVerified ? <Badge variant="success">Online</Badge> : null}</span> },
          { key: 'amount', header: 'Amount', sortable: true, className: 'text-right', headerClassName: 'text-right', cell: (p: any) => <span className="tabular font-medium">{formatCurrency(p.amount)}</span> },
          { key: 'status', header: 'Status', cell: (p: any) => <StatusBadge status={p.status} /> },
        ]}
        pagination={payments.data ? { page: payments.data.page, pages: payments.data.pages, total: payments.data.total, limit: payments.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
    </div>
  );
}
