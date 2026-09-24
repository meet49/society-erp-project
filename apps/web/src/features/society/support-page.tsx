import * as React from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Priorities, SupportTicketStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PermissionGate } from '@/components/common/gates';
import { useCreateSupportTicket, useReplySupportTicket, useSocietySupportTicket, useSocietySupportTickets } from '@/hooks/use-society';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

function Thread({ id }: { id: string }) {
  const ticket = useSocietySupportTicket(id);
  const reply = useReplySupportTicket();
  const [body, setBody] = React.useState('');
  const t = ticket.data;
  if (!t) return null;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><StatusBadge status={t.status} /><StatusBadge status={t.priority} /><span>{t.ticketNumber} · opened {formatRelative(t.createdAt)}</span></div>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3">
        {t.messages.map((m: any) => (
          <div key={m._id ?? m.createdAt} className={cn('max-w-[90%] rounded-lg p-3 text-sm', m.authorType === 'PLATFORM' ? 'border bg-card' : 'ml-auto bg-primary text-primary-foreground')}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={cn('mt-1 text-[11px]', m.authorType === 'PLATFORM' ? 'text-muted-foreground' : 'text-primary-foreground/70')}>{m.authorType === 'PLATFORM' ? `Support · ${m.authorName ?? ''}` : m.authorName ?? 'You'} · {formatDateTime(m.createdAt)}</p>
          </div>
        ))}
      </div>
      {t.status !== 'CLOSED' ? (
        <div className="space-y-2">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
          <div className="flex justify-end"><Button disabled={!body.trim()} loading={reply.isPending} onClick={() => reply.mutate({ id, body }, { onSuccess: () => { setBody(''); toast.success('Reply sent'); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Send</Button></div>
        </div>
      ) : <p className="text-xs text-muted-foreground">This ticket is closed. Open a new ticket if you need more help.</p>}
    </div>
  );
}

export default function SocietySupportPage() {
  const list = useListState();
  const tickets = useSocietySupportTickets(list.params);
  const create = useCreateSupportTicket();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ subject: '', message: '', priority: 'NORMAL' });
  return (
    <div>
      <PageHeader title="Support" description={can('support:view') ? 'Tickets raised by your society with the platform team.' : 'Get help from the platform team.'} actions={<PermissionGate permission="support:create"><Button onClick={() => setOpen(true)}><Plus /> New ticket</Button></PermissionGate>} />
      <FilterBar onReset={list.reset}>
        <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(SupportTicketStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
      </FilterBar>
      <DataTable
        rows={tickets.data?.items}
        loading={tickets.isFetching}
        error={tickets.error}
        onRetry={() => tickets.refetch()}
        rowKey={(t: any) => t.id}
        onRowClick={(t: any) => setActive(t.id)}
        emptyTitle="No tickets yet"
        emptyDescription="Raise a ticket and the platform team will get back to you."
        columns={[
          { key: 'subject', header: 'Ticket', cell: (t: any) => (<div><p className="font-medium">{t.subject}</p><p className="text-xs text-muted-foreground">{t.ticketNumber}{t.requesterUserId?.name ? ` · ${t.requesterUserId.name}` : ''}</p></div>) },
          { key: 'priority', header: 'Priority', cell: (t: any) => <StatusBadge status={t.priority} /> },
          { key: 'status', header: 'Status', cell: (t: any) => <StatusBadge status={t.status} /> },
          { key: 'activity', header: 'Last activity', cell: (t: any) => formatRelative(t.lastActivityAt) },
        ]}
        pagination={tickets.data ? { page: tickets.data.page, pages: tickets.data.pages, total: tickets.data.total, limit: tickets.data.limit, onPageChange: list.setPage } : undefined}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New support ticket</DialogTitle><DialogDescription>Describe the problem; include steps to reproduce if it is a bug.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Priority</Label><Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Priorities.map((p) => <SelectItem key={p} value={p}>{formatStatus(p)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Message</Label><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={create.isPending} disabled={form.subject.trim().length < 3 || form.message.trim().length < 5} onClick={() => create.mutate(form, { onSuccess: (t) => { toast.success(`Ticket ${t.ticketNumber} created`); setOpen(false); setForm({ subject: '', message: '', priority: 'NORMAL' }); setActive(t.id); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="flex flex-col sm:max-w-xl">
          <SheetHeader><SheetTitle>Conversation</SheetTitle><SheetDescription>Replies from the platform team appear here and in your inbox.</SheetDescription></SheetHeader>
          <div className="mt-4 min-h-0 flex-1">{active ? <Thread id={active} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
