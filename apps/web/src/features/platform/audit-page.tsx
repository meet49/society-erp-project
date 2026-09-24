import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { usePlatformAudit } from '@/hooks/use-platform';
import { formatDateTime, formatStatus } from '@/lib/utils';

export function AuditDetailDialog({ entry, onClose }: { entry: any | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(entry)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{entry?.action}</DialogTitle></DialogHeader>
        {entry ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{formatDateTime(entry.createdAt)} · {entry.actorName ?? entry.actorType} {entry.actorEmail ? `(${entry.actorEmail})` : ''} · {entry.resource} {entry.resourceId ?? ''}</p>
            <p className="text-xs text-muted-foreground">Request {entry.requestId ?? '—'} · IP {entry.ip ?? '—'}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Before</p><pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(entry.oldValue ?? null, null, 2)}</pre></div>
              <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">After</p><pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(entry.newValue ?? null, null, 2)}</pre></div>
            </div>
            {entry.metadata ? <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Metadata</p><pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{JSON.stringify(entry.metadata, null, 2)}</pre></div> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function auditColumns(onOpen: (e: any) => void) {
  return [
    { key: 'createdAt', header: 'When', sortable: true, cell: (a: any) => <span className="whitespace-nowrap text-xs">{formatDateTime(a.createdAt)}</span> },
    { key: 'actor', header: 'Actor', cell: (a: any) => (<div><p className="text-sm">{a.actorName ?? formatStatus(a.actorType)}</p><p className="text-xs text-muted-foreground">{a.actorEmail ?? ''}</p></div>) },
    { key: 'action', header: 'Action', sortable: true, cell: (a: any) => <button type="button" className="text-left" onClick={() => onOpen(a)}><code className="text-xs text-primary hover:underline">{a.action}</code></button> },
    { key: 'resource', header: 'Resource', sortable: true, hideBelow: 'md' as const, cell: (a: any) => <span className="text-xs">{a.resource}{a.resourceId ? <span className="text-muted-foreground"> · {String(a.resourceId).slice(-8)}</span> : null}</span> },
    { key: 'type', header: 'Type', hideBelow: 'lg' as const, cell: (a: any) => <Badge variant="outline">{formatStatus(a.actorType)}</Badge> },
  ];
}

export default function PlatformAuditPage() {
  const list = useListState({ sort: '-createdAt' });
  const audit = usePlatformAudit(list.params);
  const [entry, setEntry] = React.useState<any | null>(null);
  return (
    <div>
      <PageHeader title="Audit logs" description="Platform-wide trail of logins, plan/subscription changes, settings and society administration. Secrets are never stored." />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.filters.action ?? ''} onChange={(v) => list.setFilter('action', v)} placeholder="Action prefix, e.g. plan." className="w-full sm:w-64" />
        <FilterSelect value={list.filters.actorType ?? ''} onChange={(v) => list.setFilter('actorType', v)} options={['USER', 'PLATFORM_ADMIN', 'SYSTEM', 'ANONYMOUS'].map((t) => ({ value: t, label: formatStatus(t) }))} allLabel="Any actor" />
        <FilterSelect value={list.filters.resource ?? ''} onChange={(v) => list.setFilter('resource', v)} options={['Society', 'Subscription', 'Plan', 'User', 'Role', 'Module', 'FeatureFlag', 'PlatformSetting', 'LandingSection', 'Lead', 'SupportTicket', 'Unit', 'Invitation'].map((r) => ({ value: r, label: r }))} allLabel="Any resource" />
      </FilterBar>
      <DataTable rows={audit.data?.items} loading={audit.isFetching} error={audit.error} onRetry={() => audit.refetch()} rowKey={(a: any) => a.id} dense sort={list.sort} onSortChange={list.setSort} columns={auditColumns(setEntry)} pagination={audit.data ? { page: audit.data.page, pages: audit.data.pages, total: audit.data.total, limit: audit.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined} />
      <AuditDetailDialog entry={entry} onClose={() => setEntry(null)} />
    </div>
  );
}
