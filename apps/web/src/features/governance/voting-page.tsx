import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Play, Square, Trash2, BarChart3, XCircle } from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ALL_AUDIENCE, type AudienceValue } from '@/hooks/use-community';
import { useCancelVoting, useCloseVoting, useCreateVoting, useDeleteVoting, useGovernanceRealtime, useOpenVoting, useVotingResults, useVotings } from '@/hooks/use-governance';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from '@/features/community/audience-picker';
import { BallotCard } from './ballot-card';

const blank = { title: '', description: '', type: 'RESOLUTION', candidates: [{ label: '', unitCode: '', statement: '' }, { label: '', unitCode: '', statement: '' }], seats: '1', audience: ALL_AUDIENCE as AudienceValue, oneVotePerUnit: true, anonymous: true, passThresholdPercent: '50', quorumPercent: '0', endAt: '' };

export function VotingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateVoting();
  const [form, setForm] = React.useState<typeof blank>(blank);
  React.useEffect(() => { if (open) setForm({ ...blank, candidates: [{ label: '', unitCode: '', statement: '' }, { label: '', unitCode: '', statement: '' }] }); }, [open]);
  const election = form.type === 'ELECTION';
  const candidates = form.candidates.filter((c) => c.label.trim());
  const valid = form.title.trim().length >= 3 && (!election || candidates.length >= 2);
  const submit = (openNow: boolean) => create.mutate({ title: form.title, description: form.description || undefined, type: form.type, audience: form.audience, candidates: election ? candidates.map((c) => ({ label: c.label, unitCode: c.unitCode || undefined, statement: c.statement || undefined })) : undefined, seats: Number(form.seats) || 1, oneVotePerUnit: form.oneVotePerUnit, anonymous: form.anonymous, passThresholdPercent: Number(form.passThresholdPercent), quorumPercent: Number(form.quorumPercent) || 0, endAt: form.endAt ? new Date(form.endAt).toISOString() : null, openNow }, { onSuccess: () => { toast.success(openNow ? 'Voting is open' : 'Draft saved'); onOpenChange(false); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>New vote</DialogTitle><DialogDescription>A resolution is decided for / against; an election seats the top candidates. Results are frozen when voting closes.</DialogDescription></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="flex gap-1.5">{(['RESOLUTION', 'ELECTION'] as const).map((t) => <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={cn('rounded-full border px-3 py-1 text-xs', form.type === t ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{t === 'RESOLUTION' ? 'Resolution' : 'Election'}</button>)}</div>
            <div className="space-y-1.5"><Label htmlFor="vt-title">Title *</Label><Input id="vt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={election ? 'Election of the managing committee' : 'Approve rooftop solar installation'} /></div>
            <div className="space-y-1.5"><Label htmlFor="vt-desc">Details</Label><Textarea id="vt-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            {election ? <div className="space-y-2"><Label>Candidates *</Label>{form.candidates.map((c, i) => <div key={i} className="grid gap-2 sm:grid-cols-6"><Input className="sm:col-span-2" value={c.label} placeholder={`Candidate ${i + 1}`} aria-label={`Candidate ${i + 1}`} onChange={(e) => setForm({ ...form, candidates: form.candidates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /><Input value={c.unitCode} placeholder="Unit" aria-label="Unit" onChange={(e) => setForm({ ...form, candidates: form.candidates.map((x, j) => (j === i ? { ...x, unitCode: e.target.value } : x)) })} /><Input className="sm:col-span-3" value={c.statement} placeholder="Short statement" aria-label="Statement" onChange={(e) => setForm({ ...form, candidates: form.candidates.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)) })} /></div>)}<div className="flex items-center gap-3"><Button size="sm" variant="outline" onClick={() => setForm({ ...form, candidates: [...form.candidates, { label: '', unitCode: '', statement: '' }] })}><Plus /> Candidate</Button><Label htmlFor="vt-seats" className="text-xs">Seats</Label><Input id="vt-seats" type="number" min={1} className="w-20" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></div></div> : null}
          </div>
          <div className="space-y-3 lg:col-span-2">
            <AudiencePicker value={form.audience} onChange={(audience) => setForm({ ...form, audience })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="vt-end">Closes on</Label><Input id="vt-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="vt-quorum">Quorum %</Label><Input id="vt-quorum" type="number" min={0} max={100} value={form.quorumPercent} onChange={(e) => setForm({ ...form, quorumPercent: e.target.value })} /></div>
              {!election ? <div className="space-y-1.5"><Label htmlFor="vt-threshold">Passes above %</Label><Input id="vt-threshold" type="number" min={0} max={100} value={form.passThresholdPercent} onChange={(e) => setForm({ ...form, passThresholdPercent: e.target.value })} /></div> : null}
            </div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.oneVotePerUnit} onCheckedChange={(v) => setForm({ ...form, oneVotePerUnit: v })} /> One ballot per unit</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.anonymous} onCheckedChange={(v) => setForm({ ...form, anonymous: v })} /> Secret ballot</label>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="outline" loading={create.isPending} disabled={!valid} onClick={() => submit(false)}>Save draft</Button><Button loading={create.isPending} disabled={!valid} onClick={() => submit(true)}><Play /> Open voting</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsSheet({ voting, onClose }: { voting: any | null; onClose: () => void }) {
  const results = useVotingResults(voting?.id ?? '', Boolean(voting));
  const r = results.data;
  return (
    <Sheet open={Boolean(voting)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {voting ? <>
          <SheetHeader><SheetTitle>{voting.title}</SheetTitle><SheetDescription>{r ? `${r.total} ballots · ${r.eligible} eligible · turnout ${r.turnoutPercent ?? '—'}%${r.quorumPercent ? ` · quorum ${r.quorumMet ? 'met' : 'not met'}` : ''}` : 'Loading…'}</SheetDescription></SheetHeader>
          {r?.outcome ? <p className="mt-3 rounded-md bg-muted p-2 text-sm font-medium">Outcome: {formatStatus(r.outcome)}{r.type === 'RESOLUTION' ? ` (passes above ${r.passThresholdPercent}% of for / against votes)` : ''}</p> : null}
          <ul className="mt-4 space-y-3">{(r?.options ?? []).map((o: any) => <li key={o.key}><div className="flex justify-between text-sm"><span>{o.winner ? '🏆 ' : ''}{o.label}{o.unitCode ? <span className="text-muted-foreground"> · {o.unitCode}</span> : null}</span><span className="text-muted-foreground">{o.votes} · {o.percent}%</span></div><Progress value={o.percent} className="mt-1" tone={o.winner ? 'success' : 'primary'} /></li>)}</ul>
          {r?.ballots ? <div className="mt-6"><h3 className="mb-2 text-sm font-semibold">Ballots</h3><ul className="divide-y text-sm">{r.ballots.map((b: any, i: number) => <li key={i} className="flex justify-between py-1.5"><span>{b.name}{b.unitCode ? <span className="text-muted-foreground"> · {b.unitCode}</span> : null}</span><span className="text-muted-foreground">{b.choices.map((k: string) => r.options.find((o: any) => o.key === k)?.label).join(', ')}</span></li>)}</ul></div> : r?.anonymous ? <p className="mt-4 text-xs text-muted-foreground">Secret ballot: choices are never linked to voters.</p> : null}
        </> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Committee view: resolutions and elections. */
export default function VotingPage() {
  const { can } = usePermissions();
  const [status, setStatus] = React.useState('');
  const [type, setType] = React.useState('');
  const votings = useVotings({ limit: 50, status: status || undefined, type: type || undefined });
  const openVoting = useOpenVoting();
  const closeVoting = useCloseVoting();
  const cancelVoting = useCancelVoting();
  const remove = useDeleteVoting();
  const { confirm, ConfirmElement } = useConfirm();
  const [creating, setCreating] = React.useState(false);
  const [results, setResults] = React.useState<any | null>(null);
  useGovernanceRealtime();
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const items: any[] = votings.data?.items ?? [];
  const actions = (v: any) => (
    <span className="flex flex-wrap gap-1">
      {v.status === 'DRAFT' ? <Button size="sm" onClick={() => openVoting.mutate({ id: v.id }, { onSuccess: () => toast.success('Voting opened'), onError: err })}><Play /> Open</Button> : null}
      {v.status === 'OPEN' && can('voting:close') ? <Button size="sm" variant="outline" onClick={async () => { if (await confirm({ title: 'Close voting?', description: 'Results are computed and announced to the audience.', confirmLabel: 'Close & announce' })) closeVoting.mutate(v.id, { onSuccess: () => toast.success('Voting closed'), onError: err }); }}><Square /> Close</Button> : null}
      {can('voting:results') && v.status !== 'DRAFT' ? <Button size="sm" variant="ghost" onClick={() => setResults(v)}><BarChart3 /> Results</Button> : null}
      {['DRAFT', 'OPEN'].includes(v.status) && can('voting:close') ? <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: 'Cancel this vote?', destructive: true, confirmLabel: 'Cancel vote' })) cancelVoting.mutate(v.id, { onError: err }); }}><XCircle /></Button> : null}
      {v.status === 'DRAFT' && can('voting:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(v.id, { onError: err }); }}><Trash2 /></Button> : null}
    </span>
  );
  return (
    <div>
      <PageHeader title="Voting & elections" description="Formal resolutions and committee elections with one ballot per unit." actions={<PermissionGate permission="voting:create"><SubscriptionGate><Button onClick={() => setCreating(true)}><Plus /> New vote</Button></SubscriptionGate></PermissionGate>} />
      <FilterBar onReset={() => { setStatus(''); setType(''); }}>
        <FilterSelect value={type} onChange={setType} options={[{ value: 'RESOLUTION', label: 'Resolutions' }, { value: 'ELECTION', label: 'Elections' }]} allLabel="All votes" />
        <FilterSelect value={status} onChange={setStatus} options={['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
      </FilterBar>
      {votings.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<BarChart3 />} title="No votes yet" description="Put a resolution to the members or run a committee election." /> : <div className="grid gap-4 lg:grid-cols-2">{items.map((v) => <BallotCard key={v.id} voting={v} actions={actions(v)} />)}</div>}
      <VotingDialog open={creating} onOpenChange={setCreating} />
      <ResultsSheet voting={results} onClose={() => setResults(null)} />
      {ConfirmElement}
    </div>
  );
}
