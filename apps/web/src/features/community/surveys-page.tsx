import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Play, Square, Trash2, ClipboardList, Download, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { FilterBar, FilterSelect } from '@/components/common/search-input';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ALL_AUDIENCE, useCloseSurvey, useCommunityRealtime, useCreateSurvey, useDeleteSurvey, useExportSurvey, useOpenSurvey, useSurveyResults, useSurveys, type AudienceValue } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from './audience-picker';
import { QuestionInput, QuestionResult } from './survey-shared';

const blankQ = () => ({ type: 'SINGLE', label: '', options: [], required: true, max: 5 });
const blank = { title: '', description: '', questions: [blankQ()], audience: ALL_AUDIENCE as AudienceValue, anonymous: false, endAt: '' };

export function SurveyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateSurvey();
  const [form, setForm] = React.useState<typeof blank>(blank);
  React.useEffect(() => { if (open) setForm({ ...blank, questions: [blankQ()] }); }, [open]);
  const valid = form.title.trim().length >= 3 && form.questions.length > 0 && form.questions.every((q) => q.label.trim().length >= 2 && (!['SINGLE', 'MULTIPLE'].includes(q.type) || (q.options as string[]).length >= 2));
  const submit = (openNow: boolean) => create.mutate({ title: form.title, description: form.description || undefined, questions: form.questions, audience: form.audience, anonymous: form.anonymous, endAt: form.endAt ? new Date(form.endAt).toISOString() : null, openNow }, { onSuccess: () => { toast.success(openNow ? 'Survey is open' : 'Draft saved'); onOpenChange(false); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>New survey</DialogTitle><DialogDescription>Build the questions, choose who should answer, then open it. Responses can be edited until the survey closes.</DialogDescription></DialogHeader>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="space-y-1.5"><Label htmlFor="sv-title">Title *</Label><Input id="sv-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="sv-desc">Introduction</Label><Textarea id="sv-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-2"><Label>Questions *</Label>{form.questions.map((q, i) => <div key={i} className="flex gap-2"><div className="flex-1"><QuestionInput value={q} onChange={(nq) => setForm({ ...form, questions: form.questions.map((x, j) => (j === i ? nq : x)) })} /></div>{form.questions.length > 1 ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setForm({ ...form, questions: form.questions.filter((_, j) => j !== i) })}><Trash2 /></Button> : null}</div>)}<Button size="sm" variant="outline" onClick={() => setForm({ ...form, questions: [...form.questions, blankQ()] })} disabled={form.questions.length >= 40}><Plus /> Add question</Button></div>
          </div>
          <div className="space-y-3 lg:col-span-2">
            <AudiencePicker value={form.audience} onChange={(audience) => setForm({ ...form, audience })} />
            <div className="space-y-1.5"><Label htmlFor="sv-end">Closes on</Label><Input id="sv-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.anonymous} onCheckedChange={(v) => setForm({ ...form, anonymous: v })} /> Anonymous responses</label>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="outline" loading={create.isPending} disabled={!valid} onClick={() => submit(false)}>Save draft</Button><Button loading={create.isPending} disabled={!valid} onClick={() => submit(true)}><Play /> Open survey</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultsSheet({ survey, onClose }: { survey: any | null; onClose: () => void }) {
  const results = useSurveyResults(survey?.id ?? '', Boolean(survey));
  const exportRows = useExportSurvey();
  const r = results.data;
  return (
    <Sheet open={Boolean(survey)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {survey ? <>
          <SheetHeader><SheetTitle>{survey.title}</SheetTitle><SheetDescription>{r ? `${r.responseCount} responses · ${r.eligible} eligible · turnout ${r.turnout ?? '—'}%${r.anonymous ? ' · anonymous' : ''}` : 'Loading…'}</SheetDescription></SheetHeader>
          <div className="my-3 flex justify-end"><PermissionGate permission={['surveys:export', 'surveys:results']}><Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(survey.id, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export responses</Button></PermissionGate></div>
          <div className="space-y-3">{(r?.questions ?? []).map((q: any) => <QuestionResult key={q.key} q={q} />)}</div>
        </> : null}
      </SheetContent>
    </Sheet>
  );
}

/** Committee view: build, open, close and analyse surveys. */
export default function SurveysPage() {
  const { can } = usePermissions();
  const [status, setStatus] = React.useState('');
  const surveys = useSurveys({ limit: 50, status: status || undefined });
  const openSurvey = useOpenSurvey();
  const closeSurvey = useCloseSurvey();
  const remove = useDeleteSurvey();
  const { confirm, ConfirmElement } = useConfirm();
  const [creating, setCreating] = React.useState(false);
  const [results, setResults] = React.useState<any | null>(null);
  useCommunityRealtime();
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const items: any[] = surveys.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Surveys" description="Structured feedback from residents with exportable results." actions={<PermissionGate permission="surveys:create"><SubscriptionGate><Button onClick={() => setCreating(true)}><Plus /> New survey</Button></SubscriptionGate></PermissionGate>} />
      <FilterBar onReset={() => setStatus('')}><FilterSelect value={status} onChange={setStatus} options={['DRAFT', 'OPEN', 'CLOSED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" /></FilterBar>
      {surveys.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<ClipboardList />} title="No surveys yet" description="Build a questionnaire, target it and collect structured feedback." /> : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{s.title} <StatusBadge status={s.status} />{s.anonymous ? <Badge variant="outline">Anonymous</Badge> : null}</p>
                  <p className="text-xs text-muted-foreground">{s.audienceLabel} · {s.responseCount} of {s.eligibleCount || '—'} responded{s.endAt ? ` · ${s.status === 'CLOSED' ? 'closed' : 'closes'} ${formatRelative(s.endAt)} (${formatDateTime(s.endAt)})` : ''} · by {s.createdBy?.name ?? ''}</p>
                </div>
                <span className="flex flex-wrap gap-1">
                  {s.status === 'DRAFT' ? <Button size="sm" onClick={() => openSurvey.mutate({ id: s.id }, { onSuccess: () => toast.success('Survey opened'), onError: err })}><Play /> Open</Button> : null}
                  {s.status === 'OPEN' ? <Button size="sm" variant="outline" onClick={async () => { if (await confirm({ title: 'Close this survey?', description: 'No more responses will be accepted.', confirmLabel: 'Close survey' })) closeSurvey.mutate(s.id, { onSuccess: () => toast.success('Survey closed'), onError: err }); }}><Square /> Close</Button> : null}
                  {can('surveys:results') && s.status !== 'DRAFT' ? <Button size="sm" variant="ghost" onClick={() => setResults(s)}><BarChart3 /> Results</Button> : null}
                  {s.status === 'DRAFT' && can('surveys:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete this draft?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(s.id, { onError: err }); }}><Trash2 /></Button> : null}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <SurveyDialog open={creating} onOpenChange={setCreating} />
      <ResultsSheet survey={results} onClose={() => setResults(null)} />
      {ConfirmElement}
    </div>
  );
}
