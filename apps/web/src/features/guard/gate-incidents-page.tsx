import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Siren, Send, History } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useIncidentTypes, useIncidents, useReportIncident, useSecurityRealtime } from '@/hooks/use-security';
import { cn, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { GatePicker, OfflineBanner, PhotoCapture, useSelectedGate } from './gate-shared';
import { IncidentSheet, SeverityBadge, SeverityPicker } from '@/features/security/incident-shared';

const blank = { title: '', typeKey: '', severity: 'MEDIUM', location: '', description: '', involvedName: '' };

/** Guard incident report: type + severity chips, a photo, two lines of text. Works offline through the queue. */
export default function GateIncidentsPage() {
  const [params, setParams] = useSearchParams();
  const types = useIncidentTypes();
  const report = useReportIncident();
  const mine = useIncidents({ limit: 10, sort: '-createdAt' });
  const [gateId] = useSelectedGate();
  const [form, setForm] = React.useState(blank);
  const [photo, setPhoto] = React.useState<string | null>(null);
  useSecurityRealtime();
  const selected = params.get('incident');
  const submit = () => {
    report.mutate({ ...form, description: form.description || undefined, location: form.location || undefined, gateId: gateId || undefined, photos: photo ? [photo] : undefined, involved: form.involvedName ? [{ name: form.involvedName, type: 'UNKNOWN' }] : undefined, occurredAt: new Date().toISOString() }, {
      onSuccess: (r: any) => { if (r.queued) toast.warning('Saved offline — it will reach the office when you are back online'); else toast.success(`${r.data?.incidentNumber ?? 'Incident'} reported`); setForm(blank); setPhoto(null); },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Report incident" actions={<GatePicker />} />
      <OfflineBanner />
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>What kind of incident?</Label><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{(types.data ?? []).map((t: any) => <button key={t.key} type="button" onClick={() => setForm({ ...form, typeKey: t.key })} className={cn('rounded-md border px-2 py-3 text-sm font-medium', form.typeKey === t.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{t.name}</button>)}</div></div>
        <div className="space-y-1.5"><Label>How serious?</Label><SeverityPicker value={form.severity} onChange={(severity) => setForm({ ...form, severity })} /></div>
        <div className="space-y-1.5"><Label htmlFor="gi-title">What happened? *</Label><Input id="gi-title" className="h-12" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Stranger climbing the back wall" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="gi-loc">Where</Label><Input id="gi-loc" className="h-12" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Basement 2" /></div>
          <div className="space-y-1.5"><Label htmlFor="gi-inv">Who / vehicle</Label><Input id="gi-inv" className="h-12" value={form.involvedName} onChange={(e) => setForm({ ...form, involvedName: e.target.value })} placeholder="Name or plate" /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="gi-desc">Details</Label><Textarea id="gi-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <PhotoCapture value={photo} onChange={setPhoto} label="Take a photo" />
        <Button size="lg" className="h-14 w-full text-base" loading={report.isPending} disabled={form.title.trim().length < 3 || !form.typeKey} onClick={submit}><Send /> Send report</Button>
        {form.severity === 'CRITICAL' ? <p className="rounded-md bg-destructive/10 p-2 text-center text-sm"><Siren className="mr-1 inline h-4 w-4" /> For a life-threatening situation also raise an SOS from the Emergency tab.</p> : null}
      </div>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" /> My recent reports</h2>
        {(mine.data?.items ?? []).length ? <ul className="space-y-2">{(mine.data?.items ?? []).map((i: any) => <li key={i.id}><button type="button" onClick={() => { params.set('incident', i.id); setParams(params, { replace: true }); }} className="flex w-full items-center gap-3 rounded-md border bg-card p-3 text-left text-sm"><span className="min-w-0 flex-1"><span className="font-medium">{i.title}</span><span className="block text-xs text-muted-foreground">{i.incidentNumber} · {formatStatus(i.typeKey)} · {formatRelative(i.occurredAt)}</span></span><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></button></li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing reported yet from this account.</p>}
      </section>
      <IncidentSheet id={selected} onClose={() => { params.delete('incident'); setParams(params, { replace: true }); }} compact />
    </div>
  );
}
