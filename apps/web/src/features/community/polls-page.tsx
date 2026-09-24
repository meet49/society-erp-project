import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Play, Square, Trash2, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { FilterBar, FilterSelect } from '@/components/common/search-input';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { ALL_AUDIENCE, useClosePoll, useCommunityRealtime, useCreatePoll, useDeletePoll, useOpenPoll, usePollResults, usePolls, type AudienceValue } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from './audience-picker';
import { PollCard } from './poll-card';

const blank = { question: '', description: '', options: ['', ''], audience: ALL_AUDIENCE as AudienceValue, anonymous: true, oneVotePerUnit: false, allowMultiple: false, showLiveResults: true, endAt: '' };

export function PollDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreatePoll();
  const [form, setForm] = React.useState<typeof blank>(blank);
  React.useEffect(() => { if (open) setForm(blank); }, [open]);
  const options = form.options.map((o) => o.trim()).filter(Boolean);
  const submit = (openNow: boolean) => create.mutate({ question: form.question, description: form.description || undefined, options, audience: form.audience, anonymous: form.anonymous, oneVotePerUnit: form.oneVotePerUnit, allowMultiple: form.allowMultiple, showLiveResults: form.showLiveResults, endAt: form.endAt ? new Date(form.endAt).toISOString() : null, openNow }, { onSuccess: () => { toast.success(openNow ? 'Poll is live' : 'Draft saved'); onOpenChange(false); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>New poll</DialogTitle><DialogDescription>One question, a few options. The audience is notified when the poll opens.</DialogDescription></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="pl-q">Question *</Label><Input id="pl-q" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="pl-d">Context</Label><Textarea id="pl-d" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Options *</Label>{form.options.map((o, i) => <Input key={i} value={o} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? e.target.value : x)) })} />)}<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setForm({ ...form, options: [...form.options, ''] })} disabled={form.options.length >= 12}><Plus /> Option</Button>{form.options.length > 2 ? <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, options: form.options.slice(0, -1) })}>Remove last</Button> : null}</div></div>
          </div>
          <div className="space-y-3">
            <AudiencePicker value={form.audience} onChange={(audience) => setForm({ ...form, audience })} />
            <div className="space-y-1.5"><Label htmlFor="pl-end">Closes on</Label><Input id="pl-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.anonymous} onCheckedChange={(v) => setForm({ ...form, anonymous: v })} /> Anonymous (nobody sees who voted what)</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.oneVotePerUnit} onCheckedChange={(v) => setForm({ ...form, oneVotePerUnit: v })} /> One vote per unit</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.allowMultiple} onCheckedChange={(v) => setForm({ ...form, allowMultiple: v })} /> Allow picking several options</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.showLiveResults} onCheckedChange={(v) => setForm({ ...form, showLiveResults: v })} /> Show results while open</label>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="outline" loading={create.isPending} disabled={form.question.trim().length < 3 || options.length < 2} onClick={() => submit(false)}>Save draft</Button><Button loading={create.isPending} disabled={form.question.trim().length < 3 || options.length < 2} onClick={() => submit(true)}><Play /> Open poll</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsSheet({ poll, onClose }: { poll: any | null; onClose: () => void }) {
  const results = usePollResults(poll?.id ?? '', Boolean(poll));
  const r = results.data;
  return (
    <Sheet open={Boolean(poll)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {poll ? <>
          <SheetHeader><SheetTitle>{poll.question}</SheetTitle><SheetDescription>{r ? `${r.total} votes · ${r.eligible} eligible · turnout ${r.turnout ?? '—'}%` : 'Loading…'}</SheetDescription></SheetHeader>
          <ul className="mt-4 space-y-3">{(r?.options ?? []).map((o: any) => <li key={o.key}><div className="flex justify-between text-sm"><span>{o.label}</span><span className="text-muted-foreground">{o.votes} · {o.percent}%</span></div><Progress value={o.percent} className="mt-1" /></li>)}</ul>
          {r?.voters ? <div className="mt-6"><h3 className="mb-2 text-sm font-semibold">Who voted</h3><ul className="divide-y text-sm">{r.voters.map((v: any, i: number) => <li key={i} className="flex justify-between py-1.5"><span>{v.name}{v.unitCode ? <span className="text-muted-foreground"> · {v.unitCode}</span> : null}</span><span className="text-muted-foreground">{v.optionKeys.map((k: string) => r.options.find((o: any) => o.key === k)?.label).join(', ')}</span></li>)}</ul></div> : r?.anonymous ? <p className="mt-4 text-xs text-muted-foreground">Anonymous poll: votes are never linked to people.</p> : null}
        </> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Committee view: create, open, close and analyse polls. */
export default function PollsPage() {
  const { can } = usePermissions();
  const [status, setStatus] = React.useState('');
  const polls = usePolls({ limit: 50, status: status || undefined });
  const openPoll = useOpenPoll();
  const closePoll = useClosePoll();
  const remove = useDeletePoll();
  const { confirm, ConfirmElement } = useConfirm();
  const [creating, setCreating] = React.useState(false);
  const [results, setResults] = React.useState<any | null>(null);
  useCommunityRealtime();
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const items: any[] = polls.data?.items ?? [];
  const actions = (p: any) => (
    <span className="flex flex-wrap gap-1">
      {p.status === 'DRAFT' ? <Button size="sm" onClick={() => openPoll.mutate({ id: p.id }, { onSuccess: () => toast.success('Poll opened'), onError: err })}><Play /> Open</Button> : null}
      {p.status === 'OPEN' ? <Button size="sm" variant="outline" onClick={async () => { if (await confirm({ title: 'Close this poll?', description: 'No more votes will be accepted.', confirmLabel: 'Close poll' })) closePoll.mutate(p.id, { onSuccess: () => toast.success('Poll closed'), onError: err }); }}><Square /> Close</Button> : null}
      {can('polls:results') && p.status !== 'DRAFT' ? <Button size="sm" variant="ghost" onClick={() => setResults(p)}><BarChart3 /> Results</Button> : null}
      {p.status === 'DRAFT' && can('polls:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(p.id, { onError: err }); }}><Trash2 /></Button> : null}
    </span>
  );
  return (
    <div>
      <PageHeader title="Polls" description="Quick decisions with one vote per person or per unit." actions={<PermissionGate permission="polls:create"><SubscriptionGate><Button onClick={() => setCreating(true)}><Plus /> New poll</Button></SubscriptionGate></PermissionGate>} />
      <FilterBar onReset={() => setStatus('')}><FilterSelect value={status} onChange={setStatus} options={['DRAFT', 'OPEN', 'CLOSED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" /></FilterBar>
      {polls.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<BarChart3 />} title="No polls yet" description="Ask the society a quick question and let residents vote from the app." /> : <div className="grid gap-4 lg:grid-cols-2">{items.map((p) => <PollCard key={p.id} poll={p} actions={actions(p)} />)}</div>}
      <p className="mt-4 text-xs text-muted-foreground">{items.some((p) => p.status === 'OPEN' && p.endAt) ? `Timed polls close automatically (next: ${formatDateTime(items.filter((p) => p.status === 'OPEN' && p.endAt).sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime())[0].endAt)}).` : ''}</p>
      <PollDialog open={creating} onOpenChange={setCreating} />
      <ResultsSheet poll={results} onClose={() => setResults(null)} />
      {ConfirmElement}
    </div>
  );
}
