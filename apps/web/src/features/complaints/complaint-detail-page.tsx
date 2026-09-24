import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, UserCheck, CheckCheck, Lock, RotateCcw, Play, Send, Star, Pencil, EyeOff } from 'lucide-react';
import { Priorities } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { KeyValue } from '@/components/common/key-value';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { useAssignComplaint, useCommentComplaint, useComplaint, useComplaintStatus, useRateComplaint, useUpdateComplaint } from '@/hooks/use-complaints';
import { useSocietyUsers } from '@/hooks/use-society';
import { useVendorOptions } from '@/hooks/use-expenses';
import { useAuth } from '@/hooks/use-auth';
import { useAccessibleModules, usePermissions } from '@/hooks/use-access';
import { PRIORITY_TONE, SlaChip } from '@/features/complaints/complaints-page';
import { cn, formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const OPEN = ['OPEN', 'IN_PROGRESS', 'REOPENED'];

export default function ComplaintDetailPage({ mode = 'admin' }: { mode?: 'admin' | 'member' }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const complaint = useComplaint(id);
  const { context } = useAuth();
  const { can } = usePermissions();
  const { hasModule } = useAccessibleModules();
  const assign = useAssignComplaint();
  const status = useComplaintStatus();
  const comment = useCommentComplaint();
  const rate = useRateComplaint();
  const update = useUpdateComplaint();
  const users = useSocietyUsers({ limit: 100, status: 'ACTIVE' });
  const vendors = useVendorOptions(mode === 'admin' && hasModule('vendors'));
  const [assigning, setAssigning] = React.useState(false);
  const [assignForm, setAssignForm] = React.useState({ assignedTo: '', assignedVendorId: '', note: '' });
  const [statusDialog, setStatusDialog] = React.useState<{ status: string; label: string } | null>(null);
  const [note, setNote] = React.useState('');
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const [rating, setRating] = React.useState({ score: 0, comment: '' });
  if (complaint.isLoading) return <PageSkeleton />;
  if (complaint.isError || !complaint.data) return <ErrorState error={complaint.error} onRetry={() => complaint.refetch()} />;
  const c = complaint.data;
  const isRaiser = String(c.raisedBy?.id ?? c.raisedBy) === context?.user.id;
  const isMember = mode === 'member' || !can('complaints:view');
  const back = isMember ? '/app/my/complaints' : '/app/complaints';
  const changeStatus = (s: string, n?: string) => status.mutate({ id, status: s, note: n }, { onSuccess: () => { toast.success(`Ticket ${formatStatus(s).toLowerCase()}`); setStatusDialog(null); setNote(''); }, onError: (e) => toast.error(getErrorMessage(e)) });
  const staffOptions = (users.data?.items ?? []).map((u: any) => ({ value: u.user?.id ?? u.userId ?? u.id, label: u.user?.name ?? u.name, description: (u.roles ?? []).map((r: any) => r.name).join(', ') }));
  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{c.ticketNumber} <StatusBadge status={c.status} /> <SlaChip complaint={c} />{c.escalationLevel ? <Badge variant="destructive">Escalated L{c.escalationLevel}</Badge> : null}</span>}
        description={`${formatStatus(c.categoryKey)} · ${c.unitId?.code ? `Unit ${c.unitId.code}` : 'Common area'} · raised by ${c.raisedBy?.name ?? ''} ${formatRelative(c.createdAt)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(back)}><ArrowLeft /> Back</Button>
            <SubscriptionGate>
              {!isMember ? (
                <>
                  {OPEN.includes(c.status) ? <PermissionGate permission="complaints:assign"><Button variant="outline" onClick={() => { setAssignForm({ assignedTo: c.assignedTo?.id ?? '', assignedVendorId: c.assignedVendorId?.id ?? '', note: '' }); setAssigning(true); }}><UserCheck /> {c.assignedTo ? 'Reassign' : 'Assign'}</Button></PermissionGate> : null}
                  {c.status === 'OPEN' ? <PermissionGate permission={['complaints:update', 'complaints:resolve']}><Button variant="outline" onClick={() => changeStatus('IN_PROGRESS')}><Play /> Start work</Button></PermissionGate> : null}
                  {OPEN.includes(c.status) ? <PermissionGate permission="complaints:resolve"><Button onClick={() => setStatusDialog({ status: 'RESOLVED', label: 'Resolve' })}><CheckCheck /> Resolve</Button></PermissionGate> : null}
                  {c.status === 'RESOLVED' ? <PermissionGate permission={['complaints:close', 'complaints:resolve']}><Button variant="outline" onClick={() => changeStatus('CLOSED')}><Lock /> Close</Button></PermissionGate> : null}
                  {['RESOLVED', 'CLOSED'].includes(c.status) ? <PermissionGate permission={['complaints:update', 'complaints:resolve']}><Button variant="ghost" onClick={() => setStatusDialog({ status: 'REOPENED', label: 'Reopen' })}><RotateCcw /> Reopen</Button></PermissionGate> : null}
                </>
              ) : isRaiser ? (
                <>
                  {c.status === 'RESOLVED' ? <Button onClick={() => changeStatus('CLOSED')}><Lock /> Confirm resolved</Button> : null}
                  {['RESOLVED', 'CLOSED'].includes(c.status) ? <Button variant="outline" onClick={() => setStatusDialog({ status: 'REOPENED', label: 'Reopen' })}><RotateCcw /> Not fixed, reopen</Button> : null}
                </>
              ) : null}
            </SubscriptionGate>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">{c.title}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {c.description ? <p className="whitespace-pre-line text-sm">{c.description}</p> : <p className="text-sm text-muted-foreground">No further details.</p>}
              <KeyValue columns={3} items={[{ label: 'Priority', value: <span className={cn(PRIORITY_TONE[c.priority])}>{formatStatus(c.priority)}</span> }, { label: 'Location', value: c.location ?? '—' }, { label: 'Assigned to', value: c.assignedTo?.name ?? (c.assignedVendorId?.name ? `Vendor: ${c.assignedVendorId.name}` : '—') }, { label: 'Response due', value: c.sla?.responseDueAt ? formatDateTime(c.sla.responseDueAt) : '—' }, { label: 'First response', value: c.sla?.firstResponseAt ? formatDateTime(c.sla.firstResponseAt) : '—' }, { label: 'Resolution due', value: c.sla?.resolutionDueAt ? formatDateTime(c.sla.resolutionDueAt) : '—' }, ...(c.resolvedAt ? [{ label: 'Resolved', value: `${formatDateTime(c.resolvedAt)}${c.resolvedBy?.name ? ` · ${c.resolvedBy.name}` : ''}` }, { label: 'Resolution note', value: c.resolutionNote ?? '—', span: 2 }] : []), ...(c.rating?.score ? [{ label: 'Rating', value: <span className="flex items-center gap-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={cn('h-4 w-4', i < c.rating.score ? 'fill-warning text-warning' : 'text-muted-foreground/40')} />)}{c.rating.comment ? <span className="ml-2 text-xs text-muted-foreground">“{c.rating.comment}”</span> : null}</span>, span: 3 }] : [])]} />
              {!isMember ? <PermissionGate permission="complaints:update"><div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm"><Label className="text-xs">Priority</Label><Select value={c.priority} onValueChange={(v) => update.mutate({ id, priority: v }, { onSuccess: () => toast.success('Priority updated (SLA recalculated)'), onError: (e) => toast.error(getErrorMessage(e)) })}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{Priorities.map((p) => <SelectItem key={p} value={p}>{formatStatus(p)}</SelectItem>)}</SelectContent></Select><label className="flex items-center gap-2"><Switch checked={Boolean(c.isPublic)} onCheckedChange={(v) => update.mutate({ id, isPublic: v })} /> Visible to all residents</label></div></PermissionGate> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Conversation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {(c.comments ?? []).map((m: any) => (
                  <li key={m._id ?? m.id} className={cn('flex gap-3', m.internal && 'rounded-md border border-dashed bg-muted/40 p-2')}>
                    <UserAvatar name={m.userId?.name ?? '?'} className="h-8 w-8" />
                    <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{m.userId?.name ?? 'User'}</span> <span className="text-xs text-muted-foreground">{formatRelative(m.at)}</span>{m.internal ? <Badge variant="muted" className="ml-2"><EyeOff className="mr-1 h-3 w-3" /> Internal</Badge> : null}</p><p className="whitespace-pre-line text-sm">{m.body}</p></div>
                  </li>
                ))}
                {!(c.comments ?? []).length ? <li className="text-sm text-muted-foreground">No replies yet.</li> : null}
              </ul>
              <SubscriptionGate>
                <PermissionGate permission={['complaints:comment', 'complaints:view_own']}>
                  <div className="space-y-2 border-t pt-3">
                    <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={isMember ? 'Add more details or ask for an update…' : 'Reply to the resident or leave an internal note…'} aria-label="Reply" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {!isMember ? <label className="flex items-center gap-2 text-sm"><Switch checked={internal} onCheckedChange={setInternal} /> Internal note (hidden from resident)</label> : <span />}
                      <Button size="sm" loading={comment.isPending} disabled={!body.trim()} onClick={() => comment.mutate({ id, body, internal }, { onSuccess: () => { setBody(''); toast.success(internal ? 'Note added' : 'Reply sent'); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Send /> {internal ? 'Add note' : 'Send'}</Button>
                    </div>
                  </div>
                </PermissionGate>
              </SubscriptionGate>
            </CardContent>
          </Card>
          {isRaiser && ['RESOLVED', 'CLOSED'].includes(c.status) && !c.rating?.score ? (
            <Card>
              <CardHeader><CardTitle className="text-sm">How was it handled?</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star`} onClick={() => setRating({ ...rating, score: n })}><Star className={cn('h-7 w-7', n <= rating.score ? 'fill-warning text-warning' : 'text-muted-foreground/40')} /></button>)}</div>
                <Textarea rows={2} value={rating.comment} onChange={(e) => setRating({ ...rating, comment: e.target.value })} placeholder="Optional comment" aria-label="Rating comment" />
                <Button size="sm" disabled={!rating.score} loading={rate.isPending} onClick={() => rate.mutate({ id, score: rating.score, comment: rating.comment || undefined }, { onSuccess: () => toast.success('Thanks for the feedback'), onError: (e) => toast.error(getErrorMessage(e)) })}>Submit rating</Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {[...(c.history ?? [])].reverse().map((h: any, i: number) => (
                <li key={i} className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p>{h.action === 'status_changed' ? <>Status <StatusBadge status={h.from} /> → <StatusBadge status={h.to} /></> : h.action === 'assigned' ? 'Assigned' : h.action === 'escalated' ? `Escalated to level ${h.to}` : h.action === 'priority_changed' ? `Priority ${formatStatus(h.from)} → ${formatStatus(h.to)}` : formatStatus(h.action)}{h.note ? <span className="block text-xs text-muted-foreground">{h.note}</span> : null}</p><p className="text-xs text-muted-foreground">{formatDateTime(h.at)}{h.userId?.name ? ` · ${h.userId.name}` : ''}</p></div></li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      <Dialog open={assigning} onOpenChange={setAssigning}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign {c.ticketNumber}</DialogTitle><DialogDescription>Pick a team member and/or an external vendor. The ticket moves to “in progress”.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5"><Label>Team member</Label><Combobox value={assignForm.assignedTo} onChange={(v) => setAssignForm({ ...assignForm, assignedTo: v ?? '' })} options={staffOptions} placeholder="Select user" /></div>
            {hasModule('vendors') ? <div className="space-y-1.5"><Label>Vendor</Label><Combobox value={assignForm.assignedVendorId} onChange={(v) => setAssignForm({ ...assignForm, assignedVendorId: v ?? '' })} options={(vendors.data ?? []).map((v: any) => ({ value: v.id, label: v.name }))} placeholder="Optional" /></div> : null}
            <div className="space-y-1.5"><Label htmlFor="as-note">Note</Label><Textarea id="as-note" rows={2} value={assignForm.note} onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssigning(false)}>Cancel</Button><Button loading={assign.isPending} disabled={!assignForm.assignedTo && !assignForm.assignedVendorId} onClick={() => assign.mutate({ id, assignedTo: assignForm.assignedTo || null, assignedVendorId: assignForm.assignedVendorId || null, note: assignForm.note || undefined }, { onSuccess: () => { toast.success('Assigned'); setAssigning(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(statusDialog)} onOpenChange={(o) => { if (!o) setStatusDialog(null); }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{statusDialog?.label} {c.ticketNumber}</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="st-note">{statusDialog?.status === 'RESOLVED' ? 'What was done?' : 'Reason'}</Label><Textarea id="st-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusDialog(null)}>Cancel</Button><Button loading={status.isPending} onClick={() => statusDialog && changeStatus(statusDialog.status, note || undefined)}>{statusDialog?.label}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {!isMember && OPEN.includes(c.status) && !c.assignedTo ? <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground"><Pencil className="h-3 w-3" /> Tip: assign the ticket so the SLA clock has an owner.</p> : null}
    </div>
  );
}

export function MemberComplaintPage() {
  return <ComplaintDetailPage mode="member" />;
}
