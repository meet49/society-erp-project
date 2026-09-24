import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Share2, Copy, CheckCircle2, XCircle, DoorOpen, Ban, Repeat } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { FilterSelect, FilterBar } from '@/components/common/search-input';
import { SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCancelVisitor, useDecideVisitor, usePreApproveVisitor, useVisitorPass, useVisitorRealtime, useVisitors } from '@/hooks/use-visitors';
import { useCategories } from '@/hooks/use-society';
import { useAuth } from '@/hooks/use-auth';
import { useHousehold } from '@/hooks/use-residents';
import { cn, formatDateTime, formatRelative, formatStatus, toInputDateTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Shareable pass: QR + passcode + copy / share text. */
export function PassCard({ id, onClose }: { id: string; onClose: () => void }) {
  const pass = useVisitorPass(id);
  const p = pass.data;
  const share = async () => {
    if (!p) return;
    if (navigator.share) await navigator.share({ title: 'Visitor pass', text: p.shareText }).catch(() => undefined);
    else { await navigator.clipboard.writeText(p.shareText); toast.success('Pass details copied'); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Visitor pass</DialogTitle><DialogDescription>Share the code with your visitor; the guard scans the QR or types the passcode.</DialogDescription></DialogHeader>
        {p ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-lg border bg-white p-3"><QRCodeSVG value={p.qrPayload} size={180} /></div>
            <p className="text-3xl font-semibold tracking-[0.3em]">{p.passcode}</p>
            <p className="text-sm">{p.name} · {formatStatus(p.categoryKey)} · Unit {p.unitCode}</p>
            <p className="text-xs text-muted-foreground">Valid {formatDateTime(p.validFrom)} → {formatDateTime(p.validUntil)}{p.recurring?.days?.length ? ` · ${p.recurring.days.map((d: number) => DAYS[d]).join(', ')}` : ''}</p>
            <div className="flex gap-2"><Button onClick={share}><Share2 /> Share</Button><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(p.passcode); toast.success('Passcode copied'); }}><Copy /> Copy code</Button></div>
          </div>
        ) : <CardSkeleton count={1} />}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreApproveDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const categories = useCategories('VISITOR_CATEGORY');
  const create = usePreApproveVisitor();
  const { context } = useAuth();
  const household = useHousehold();
  const unitIds = context?.resident?.unitIds ?? [];
  const [form, setForm] = React.useState({ name: '', phone: '', categoryKey: 'GUEST', companyName: '', vehicleNumber: '', guestCount: '1', purpose: '', unitId: unitIds[0] ?? '', expectedAt: toInputDateTime(new Date()), validHours: '', recurring: false, days: [] as number[], until: '' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Pre-approve a visitor</DialogTitle><DialogDescription>Your visitor gets a QR pass and passcode — no waiting at the gate.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pa-name">Visitor name *</Label><Input id="pa-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pa-phone">Phone</Label><Input id="pa-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Category</Label><div className="flex flex-wrap gap-2">{(categories.data ?? []).map((c: any) => <button key={c.key} type="button" onClick={() => setForm({ ...form, categoryKey: c.key })} className={cn('rounded-full border px-3 py-1 text-sm', form.categoryKey === c.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{c.name}</button>)}</div></div>
          {unitIds.length > 1 ? <div className="space-y-1.5"><Label>Unit</Label><Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(household.data?.units ?? []).filter((u: any) => unitIds.includes(u.id)).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.code}</SelectItem>)}</SelectContent></Select></div> : null}
          <div className="space-y-1.5"><Label htmlFor="pa-expected">Expected at</Label><Input id="pa-expected" type="datetime-local" value={form.expectedAt} onChange={(e) => setForm({ ...form, expectedAt: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pa-hours">Valid for (hours)</Label><Input id="pa-hours" type="number" min={1} max={720} value={form.validHours} onChange={(e) => setForm({ ...form, validHours: e.target.value })} placeholder="Society default" /></div>
          <div className="space-y-1.5"><Label htmlFor="pa-guests">Number of people</Label><Input id="pa-guests" type="number" min={1} max={50} value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pa-vehicle">Vehicle number</Label><Input id="pa-vehicle" className="uppercase" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1.5"><Label htmlFor="pa-company">Company / service</Label><Input id="pa-company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="pa-purpose">Purpose</Label><Textarea id="pa-purpose" rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.recurring} onCheckedChange={(v) => setForm({ ...form, recurring: v })} /><Repeat className="h-4 w-4" /> Recurring (maid, tutor, driver…)</label>
          {form.recurring ? <><div className="space-y-1.5"><Label>Days</Label><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <button key={d} type="button" onClick={() => setForm({ ...form, days: form.days.includes(i) ? form.days.filter((x) => x !== i) : [...form.days, i] })} className={cn('rounded-full border px-2.5 py-1 text-xs', form.days.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{d}</button>)}</div></div><div className="space-y-1.5"><Label htmlFor="pa-until">Until *</Label><Input id="pa-until" type="date" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} /></div></> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending} disabled={form.name.trim().length < 2 || (form.recurring && !form.until)} onClick={() => create.mutate({ name: form.name, phone: form.phone || undefined, categoryKey: form.categoryKey, companyName: form.companyName || undefined, vehicleNumber: form.vehicleNumber || undefined, guestCount: Number(form.guestCount) || 1, purpose: form.purpose || undefined, unitId: form.unitId || undefined, expectedAt: form.expectedAt ? new Date(form.expectedAt).toISOString() : undefined, validHours: form.validHours ? Number(form.validHours) : undefined, recurring: form.recurring && form.until ? { days: form.days, until: new Date(form.until).toISOString() } : undefined }, { onSuccess: (p) => { toast.success('Pass created'); onOpenChange(false); onCreated(p.id); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Create pass</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resident view: pending walk-ins to approve, active passes, history. */
export default function MyVisitorsPage() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = React.useState('');
  const visitors = useVisitors({ limit: 50, sort: '-createdAt', ...(status ? { status } : {}) });
  const decide = useDecideVisitor();
  const cancel = useCancelVisitor();
  const [creating, setCreating] = React.useState(false);
  const [passId, setPassId] = React.useState<string | null>(null);
  useVisitorRealtime();
  const approveId = params.get('approve');
  const items: any[] = visitors.data?.items ?? [];
  const pending = items.filter((v) => v.status === 'PENDING');
  React.useEffect(() => { if (approveId && pending.some((v) => v.id === approveId)) document.getElementById(`pending-${approveId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [approveId, pending]);
  const act = (id: string, decision: 'approve' | 'deny') => decide.mutate({ id, decision }, { onSuccess: () => { toast.success(decision === 'approve' ? 'Approved — the guard will let them in' : 'Denied'); if (approveId) { params.delete('approve'); setParams(params, { replace: true }); } }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div>
      <PageHeader title="My visitors" description="Pre-approve guests, respond to walk-ins at the gate and see who visited." actions={<SubscriptionGate><Button onClick={() => setCreating(true)}><Plus /> Pre-approve visitor</Button></SubscriptionGate>} />
      {pending.length ? (
        <div className="mb-6 space-y-2">
          {pending.map((v) => (
            <Card key={v.id} id={`pending-${v.id}`} className={cn('border-warning/60 bg-warning/5', approveId === v.id && 'ring-2 ring-warning')}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <DoorOpen className="h-8 w-8 shrink-0 text-warning" />
                <div className="min-w-0 flex-1"><p className="font-semibold">{v.name} is at the gate</p><p className="text-sm text-muted-foreground">{formatStatus(v.categoryKey)}{v.companyName ? ` · ${v.companyName}` : ''}{v.guestCount > 1 ? ` · ${v.guestCount} people` : ''}{v.purpose ? ` · ${v.purpose}` : ''} · {formatRelative(v.approvalRequestedAt ?? v.createdAt)}</p></div>
                <div className="flex gap-2"><Button loading={decide.isPending} onClick={() => act(v.id, 'approve')}><CheckCircle2 /> Allow</Button><Button variant="outline" loading={decide.isPending} onClick={() => act(v.id, 'deny')}><XCircle /> Deny</Button></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <FilterBar onReset={() => setStatus('')}>
        <FilterSelect value={status} onChange={setStatus} options={[{ value: 'APPROVED', label: 'Active passes' }, { value: 'CHECKED_IN', label: 'Inside now' }, { value: 'CHECKED_OUT', label: 'Visited' }, { value: 'EXPIRED', label: 'Expired' }, { value: 'DENIED', label: 'Denied' }]} allLabel="All" />
      </FilterBar>
      {visitors.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<DoorOpen />} title="No visitors yet" description="Pre-approve a guest and share the pass — they walk straight in." action={<Button onClick={() => setCreating(true)}><Plus /> Pre-approve visitor</Button>} /> : (
        <div className="space-y-2">
          {items.filter((v) => v.status !== 'PENDING').map((v) => (
            <Card key={v.id}><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 font-medium">{v.name} <Badge variant="outline">{formatStatus(v.categoryKey)}</Badge> <StatusBadge status={v.status} /></div><p className="text-xs text-muted-foreground">{v.status === 'CHECKED_IN' ? `Inside since ${formatDateTime(v.checkInAt)}` : v.status === 'CHECKED_OUT' ? `Visited ${formatDateTime(v.checkInAt)} → ${formatDateTime(v.checkOutAt)}` : v.status === 'APPROVED' ? `Valid till ${formatDateTime(v.validUntil)}` : formatRelative(v.createdAt)}{v.unitId?.code ? ` · ${v.unitId.code}` : ''}</p></div>
              <div className="flex gap-2">{v.status === 'APPROVED' && v.entryType === 'PRE_APPROVED' ? <><Button size="sm" variant="outline" onClick={() => setPassId(v.id)}><Share2 /> Pass</Button><Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(v.id, { onSuccess: () => toast.success('Pass cancelled'), onError: (e) => toast.error(getErrorMessage(e)) })}><Ban /> Cancel</Button></> : null}</div>
            </CardContent></Card>
          ))}
        </div>
      )}
      <PreApproveDialog open={creating} onOpenChange={setCreating} onCreated={setPassId} />
      {passId ? <PassCard id={passId} onClose={() => setPassId(null)} /> : null}
    </div>
  );
}
