import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Play, RotateCcw, History } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { StatusBadge } from '@/components/common/status-badge';
import { FileUpload } from '@/components/common/file-upload';
import { CardSkeleton } from '@/components/common/loading-state';
import { DataTable, useListState } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCancelImport, useDownloadImportErrors, useDownloadTemplate, useImport, useImportRealtime, useImportTypes, useImports, useRunImport, useUploadImport, useValidateImport, type ImportTypeDef } from '@/hooks/use-import';
import { cn, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const NONE = '__none__';

function TypeStep({ types, onPick }: { types: ImportTypeDef[]; onPick: (t: ImportTypeDef) => void }) {
  const template = useDownloadTemplate();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {types.map((t) => (
        <div key={t.type} className="flex flex-col rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 font-medium"><FileSpreadsheet className="h-4 w-4 text-primary" /> {t.name}</p>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">Required: {t.fields.filter((f) => f.required).map((f) => f.label).join(', ')}</p>
          <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => onPick(t)}><Upload /> Import</Button><Button size="sm" variant="ghost" loading={template.isPending} onClick={() => template.mutate(t.type, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Template</Button></div>
        </div>
      ))}
      {!types.length ? <p className="text-sm text-muted-foreground">No import types are available for your role and the modules enabled.</p> : null}
    </div>
  );
}

function UploadStep({ type, onUploaded, onBack }: { type: ImportTypeDef; onUploaded: (job: any) => void; onBack: () => void }) {
  const upload = useUploadImport();
  const [files, setFiles] = React.useState<File[]>([]);
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">Upload a .csv or .xlsx with one row per {type.name.toLowerCase().replace(/s$/, '')}. The first row must be the column headings; you will map them in the next step. Up to 5,000 rows per file.</p>
      <FileUpload value={files} onChange={setFiles} accept=".csv,.xlsx" label="Drop the spreadsheet here or click to browse" />
      <div className="flex gap-2"><Button variant="ghost" onClick={onBack}>Back</Button><Button loading={upload.isPending} disabled={!files[0]} onClick={() => upload.mutate({ type: type.type, file: files[0] }, { onSuccess: (job) => { toast.success(`${job.totalRows} rows read`); onUploaded(job); }, onError: (e) => toast.error(getErrorMessage(e)) })}><Upload /> Upload and continue</Button></div>
    </div>
  );
}

function MappingStep({ job, onValidated }: { job: any; onValidated: (j: any) => void }) {
  const validate = useValidateImport();
  const [mapping, setMapping] = React.useState<Record<string, string>>(job.mapping ?? {});
  const [skipExisting, setSkipExisting] = React.useState(job.options?.skipExisting !== false);
  const [sendInvites, setSendInvites] = React.useState(Boolean(job.options?.sendInvites));
  const fields = job.definition.fields as { key: string; label: string; required?: boolean; hint?: string }[];
  const missing = fields.filter((f) => f.required && !mapping[f.key]);
  const headers: string[] = job.headers;
  const sample: string[][] = job.sampleRows ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Match your columns</p>
          <p className="text-xs text-muted-foreground">We guessed from the headings; fix anything that looks wrong. Unmapped optional fields are left blank.</p>
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.key} className="grid grid-cols-[1fr_1fr] items-center gap-2 text-sm">
                <Label className="flex flex-col"><span>{f.label}{f.required ? ' *' : ''}</span>{f.hint ? <span className="text-xs font-normal text-muted-foreground">{f.hint}</span> : null}</Label>
                <Select value={mapping[f.key] || NONE} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === NONE ? '' : v })}><SelectTrigger className={cn(f.required && !mapping[f.key] && 'border-destructive')}><SelectValue placeholder="Not mapped" /></SelectTrigger><SelectContent><SelectItem value={NONE}>— not in file —</SelectItem>{headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <p className="border-b px-3 py-2 text-sm font-medium">First rows of {job.fileName}</p>
            <Table><TableHeader><TableRow>{headers.map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader><TableBody>{sample.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className="max-w-40 truncate text-xs">{c}</TableCell>)}</TableRow>)}</TableBody></Table>
          </div>
          <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={skipExisting} onCheckedChange={(v) => setSkipExisting(Boolean(v))} /> Skip rows that already exist (instead of reporting them as errors)</label>
            {job.type === 'RESIDENTS' ? <label className="flex items-center gap-2"><Checkbox checked={sendInvites} onCheckedChange={(v) => setSendInvites(Boolean(v))} /> Create logins and email invitations to residents with an email address</label> : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button loading={validate.isPending} disabled={missing.length > 0} onClick={() => validate.mutate({ id: job.id, mapping, options: { skipExisting, sendInvites } }, { onSuccess: (j) => onValidated(j), onError: (e) => toast.error(getErrorMessage(e)) })}><CheckCircle2 /> Check the file</Button>{missing.length ? <span className="text-sm text-destructive">Map {missing.map((f) => f.label).join(', ')} to continue</span> : null}</div>
    </div>
  );
}

function ResultPanel({ job, onRestart }: { job: any; onRestart: () => void }) {
  const run = useRunImport();
  const cancel = useCancelImport();
  const errorsCsv = useDownloadImportErrors();
  const live = useImport(job.id, job.status === 'QUEUED' || job.status === 'RUNNING');
  const j = live.data ?? job;
  const isDone = j.status === 'COMPLETED' || j.status === 'FAILED' || j.status === 'CANCELLED';
  const running = j.status === 'QUEUED' || j.status === 'RUNNING';
  const errors: any[] = isDone ? j.errors ?? [] : j.validation?.errors ?? [];
  const pct = j.totalRows ? Math.round(((j.progress?.processed ?? 0) / j.totalRows) * 100) : 0;
  return (
    <div className="space-y-4">
      {j.status === 'VALIDATED' ? (
        <div className={cn('rounded-lg border p-4', j.validation.failed ? 'border-warning/50 bg-warning/5' : 'border-success/50 bg-success/5')}>
          <p className="flex items-center gap-2 font-medium">{j.validation.failed ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-success" />} {j.validation.ok} of {j.totalRows} rows are ready{j.validation.failed ? `, ${j.validation.failed} have problems` : ''}</p>
          <p className="mt-1 text-sm text-muted-foreground">Rows with problems are skipped; everything else is written through the same rules as manual entry (numbering, audit log, notifications). Nothing has been imported yet.</p>
          <div className="mt-3 flex flex-wrap gap-2"><Button loading={run.isPending} disabled={!j.validation.ok} onClick={() => run.mutate(j.id, { onSuccess: () => toast.success('Import started'), onError: (e) => toast.error(getErrorMessage(e)) })}><Play /> Import {j.validation.ok} rows</Button><Button variant="ghost" onClick={onRestart}><RotateCcw /> Start over</Button><Button variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(j.id, { onSuccess: onRestart, onError: (e) => toast.error(getErrorMessage(e)) })}>Discard</Button></div>
        </div>
      ) : null}
      {running ? <div className="rounded-lg border bg-card p-4"><p className="mb-2 text-sm font-medium">Importing… {j.progress?.processed ?? 0} of {j.totalRows}</p><Progress value={pct} /></div> : null}
      {isDone ? (
        <div className={cn('rounded-lg border p-4', j.status === 'COMPLETED' ? 'border-success/50 bg-success/5' : 'border-destructive/50 bg-destructive/5')}>
          <p className="flex items-center gap-2 font-medium"><StatusBadge status={j.status} /> {j.progress?.succeeded ?? 0} imported · {j.progress?.skipped ?? 0} skipped · {j.progress?.failed ?? 0} failed</p>
          {j.failureReason ? <p className="mt-1 text-sm text-destructive">{j.failureReason}</p> : null}
          <div className="mt-3 flex gap-2"><Button variant="outline" onClick={onRestart}><Upload /> Import another file</Button></div>
        </div>
      ) : null}
      {errors.length ? (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2"><p className="text-sm font-medium">Problems ({errors.length}{errors.length >= 200 ? '+' : ''})</p><Button size="sm" variant="ghost" loading={errorsCsv.isPending} onClick={() => errorsCsv.mutate(j.id, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Download all</Button></div>
          <div className="max-h-72 overflow-auto"><Table><TableHeader><TableRow><TableHead className="w-20">Row</TableHead><TableHead className="w-40">Column</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader><TableBody>{errors.slice(0, 200).map((e, i) => <TableRow key={i}><TableCell>{e.row}</TableCell><TableCell className="text-xs">{e.field ?? ''}</TableCell><TableCell className="text-sm">{e.message}</TableCell></TableRow>)}</TableBody></Table></div>
        </div>
      ) : null}
    </div>
  );
}

function HistoryTab({ onOpen }: { onOpen: (job: any) => void }) {
  const list = useListState({ limit: 20 });
  const jobs = useImports(list.params);
  return <DataTable rows={jobs.data?.items} loading={jobs.isFetching} error={jobs.error} onRetry={() => jobs.refetch()} rowKey={(j: any) => j.id} onRowClick={onOpen} emptyTitle="No imports yet" columns={[
    { key: 'file', header: 'File', cell: (j: any) => <span><span className="font-medium">{j.fileName}</span><span className="block text-xs text-muted-foreground">{formatStatus(j.type)} · {j.totalRows} rows</span></span> },
    { key: 'when', header: 'When', cell: (j: any) => <span>{formatDateTime(j.createdAt)}<span className="block text-xs text-muted-foreground">{j.createdBy?.name ?? ''}</span></span> },
    { key: 'result', header: 'Result', hideBelow: 'md', cell: (j: any) => j.status === 'COMPLETED' || j.status === 'FAILED' ? `${j.progress?.succeeded ?? 0} imported · ${j.progress?.skipped ?? 0} skipped · ${j.progress?.failed ?? 0} failed` : j.status === 'VALIDATED' ? `${j.validation?.ok ?? 0} ready · ${j.validation?.failed ?? 0} problems` : '—' },
    { key: 'status', header: 'Status', cell: (j: any) => <StatusBadge status={j.status} /> },
  ]} pagination={jobs.data ? { page: jobs.data.page, pages: jobs.data.pages, total: jobs.data.total, limit: jobs.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined} />;
}

/** Settings → Data import: pick a type, upload, map columns, dry-run, import in the background, review problems. */
export default function ImportPage() {
  const [params, setParams] = useSearchParams();
  const types = useImportTypes();
  const [type, setType] = React.useState<ImportTypeDef | null>(null);
  const [job, setJob] = React.useState<any | null>(null);
  const jobId = params.get('job');
  const opened = useImport(jobId ?? '');
  useImportRealtime();
  React.useEffect(() => { if (opened.data && jobId) { setJob(opened.data); setType((types.data ?? []).find((t) => t.type === opened.data.type) ?? null); } }, [opened.data, jobId, types.data]);
  const restart = () => { setJob(null); setType(null); params.delete('job'); setParams(params, { replace: true }); };
  const step = !type ? 1 : !job ? 2 : job.status === 'UPLOADED' ? 3 : 4;
  return (
    <div>
      <PageHeader title="Data import" description="Bring in units, residents, vehicles, staff, assets and stock from spreadsheets." />
      <SettingsNav />
      <ol className="mb-6 flex flex-wrap gap-2 text-xs">{['Choose what to import', 'Upload the file', 'Map columns & check', 'Import'].map((label, i) => <li key={label} className={cn('flex items-center gap-1 rounded-full border px-3 py-1', step === i + 1 ? 'border-primary bg-primary text-primary-foreground' : step > i + 1 ? 'border-success/50 text-success' : 'text-muted-foreground')}><span className="font-semibold">{i + 1}</span> {label}</li>)}</ol>
      {types.isLoading ? <CardSkeleton count={3} /> : step === 1 ? <TypeStep types={types.data ?? []} onPick={setType} /> : step === 2 ? <UploadStep type={type!} onUploaded={setJob} onBack={() => setType(null)} /> : (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline">{type?.name}</Badge><span className="text-muted-foreground">{job.fileName} · {job.totalRows} rows</span><Button size="sm" variant="ghost" onClick={restart}><RotateCcw /> Start over</Button></p>
          {step === 3 ? <MappingStep job={job} onValidated={setJob} /> : <ResultPanel job={job} onRestart={restart} />}
        </div>
      )}
      <section className="mt-10"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> Previous imports</h2><HistoryTab onOpen={(j) => { params.set('job', j.id); setParams(params, { replace: true }); }} /></section>
    </div>
  );
}
