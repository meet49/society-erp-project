import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Priorities, SupportTicketSources, SupportTicketStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { usePlatformUsers, useReplyTicket, useSupportStats, useTicket, useTickets, useUpdateTicket } from '@/hooks/use-platform';
import { cn, formatDateTime, formatRelative, formatStatus } from '@/lib/utils';

function TicketThread({ id }: { id: string }) {
  const ticket = useTicket(id);
  const update = useUpdateTicket();
  const reply = useReplyTicket();
  const users = usePlatformUsers();
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const t = ticket.data;
  if (!t) return null;
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusBadge status={t.status} />
        <StatusBadge status={t.priority} />
        <Badge variant="outline">{formatStatus(t.source)}</Badge>
        <span>{t.name} · {t.email}{t.phone ? ` · ${t.phone}` : ''}</span>
        {t.societyId ? <span>· {t.societyId.name}</span> : null}
        {t.dueAt ? <span>· due {formatRelative(t.dueAt)}</span> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select value={t.status} onValueChange={(v) => update.mutate({ id, status: v }, { onSuccess: () => toast.success('Status updated') })}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.values(SupportTicketStatus).map((s) => <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={t.priority} onValueChange={(v) => update.mutate({ id, priority: v })}>
          <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
          <SelectContent>{Priorities.map((p) => <SelectItem key={p} value={p}>{formatStatus(p)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={t.assignedTo?.id ?? t.assignedTo?._id ?? 'none'} onValueChange={(v) => update.mutate({ id, assignedTo: v === 'none' ? null : v })}>
          <SelectTrigger aria-label="Assignee"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {(users.data?.data ?? []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3">
        {t.messages.map((m: any) => (
          <div key={m._id ?? m.createdAt} className={cn('max-w-[90%] rounded-lg p-3 text-sm', m.authorType === 'PLATFORM' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-card border', m.internal && 'ml-auto border-dashed border-warning bg-warning/10 text-foreground')}>
            {m.internal ? <p className="mb-1 text-[10px] font-semibold uppercase text-warning-foreground dark:text-warning">Internal note</p> : null}
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={cn('mt-1 text-[11px]', m.authorType === 'PLATFORM' && !m.internal ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{m.authorName ?? formatStatus(m.authorType)} · {formatDateTime(m.createdAt)}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Internal note (not visible to the requester)…' : 'Reply to the requester…'} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs"><Switch checked={internal} onCheckedChange={setInternal} /> Internal note</label>
          <Button disabled={!body.trim()} loading={reply.isPending} onClick={() => reply.mutate({ id, body, internal }, { onSuccess: () => { setBody(''); toast.success(internal ? 'Note added' : 'Reply sent'); } })}>{internal ? 'Add note' : 'Send reply'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function SupportInboxPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const list = useListState({ sort: '-lastActivityAt' });
  const tickets = useTickets(list.params);
  const stats = useSupportStats();
  const ticket = useTicket(id ?? '');
  const by = stats.data?.byStatus ?? {};
  return (
    <div>
      <PageHeader title="Support inbox" description="One queue for prospects, societies, society admins and members." />
      <StatGrid className="mb-6 lg:grid-cols-5">
        <StatCard label="Open" value={by.OPEN ?? 0} tone="primary" loading={stats.isLoading} />
        <StatCard label="In progress" value={by.IN_PROGRESS ?? 0} loading={stats.isLoading} />
        <StatCard label="Waiting on customer" value={by.WAITING ?? 0} loading={stats.isLoading} />
        <StatCard label="Overdue" value={stats.data?.overdue ?? 0} tone="destructive" loading={stats.isLoading} />
        <StatCard label="Resolved" value={by.RESOLVED ?? 0} tone="success" loading={stats.isLoading} />
      </StatGrid>
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search subject, number, email…" className="w-full sm:w-72" />
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={[{ value: 'OPEN_ALL', label: 'All open' }, ...Object.values(SupportTicketStatus).map((s) => ({ value: s, label: formatStatus(s) }))]} allLabel="Any status" />
        <FilterSelect value={list.filters.priority ?? ''} onChange={(v) => list.setFilter('priority', v)} options={Priorities.map((p) => ({ value: p, label: formatStatus(p) }))} allLabel="Any priority" />
        <FilterSelect value={list.filters.source ?? ''} onChange={(v) => list.setFilter('source', v)} options={SupportTicketSources.map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any source" />
        <FilterSelect value={list.filters.assignedTo ?? ''} onChange={(v) => list.setFilter('assignedTo', v)} options={[{ value: 'unassigned', label: 'Unassigned' }]} allLabel="Any assignee" />
      </FilterBar>
      <DataTable
        rows={tickets.data?.items}
        loading={tickets.isFetching}
        error={tickets.error}
        onRetry={() => tickets.refetch()}
        rowKey={(t: any) => t.id}
        onRowClick={(t: any) => navigate(`/admin/support/${t.id}`)}
        sort={list.sort}
        onSortChange={list.setSort}
        emptyTitle="Inbox zero"
        columns={[
          { key: 'ticket', header: 'Ticket', cell: (t: any) => (<div><p className="font-medium">{t.subject}</p><p className="text-xs text-muted-foreground">{t.ticketNumber} · {t.name}{t.societyId?.name ? ` · ${t.societyId.name}` : ''}</p></div>) },
          { key: 'source', header: 'Source', hideBelow: 'md', cell: (t: any) => formatStatus(t.source) },
          { key: 'priority', header: 'Priority', sortable: true, cell: (t: any) => <StatusBadge status={t.priority} /> },
          { key: 'status', header: 'Status', sortable: true, cell: (t: any) => <StatusBadge status={t.status} /> },
          { key: 'assigned', header: 'Assignee', hideBelow: 'lg', cell: (t: any) => t.assignedTo?.name ?? '—' },
          { key: 'lastActivityAt', header: 'Activity', sortable: true, cell: (t: any) => <span className={cn(t.lastMessageBy === 'REQUESTER' && t.status !== 'CLOSED' && 'font-semibold')}>{formatRelative(t.lastActivityAt)}</span> },
        ]}
        pagination={tickets.data ? { page: tickets.data.page, pages: tickets.data.pages, total: tickets.data.total, limit: tickets.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
      />
      <Sheet open={Boolean(id)} onOpenChange={(o) => !o && navigate('/admin/support')}>
        <SheetContent className="flex flex-col sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{ticket.data?.subject ?? 'Ticket'}</SheetTitle>
            <SheetDescription>{ticket.data?.ticketNumber}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1">{id ? <TicketThread id={id} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
