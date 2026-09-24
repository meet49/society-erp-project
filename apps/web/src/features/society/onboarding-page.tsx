import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { SocietyTypes } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSkeleton } from '@/components/common/loading-state';
import { useInviteUser, useRoles, useSaveSocietySetting, useSocietyModules, useSocietyProfile, useSocietySetting, useToggleModule, useUpdateOnboarding, useUpdateSocietyProfile } from '@/hooks/use-society';
import { useBuildings, useBulkCreateUnits, useCreateBuilding } from '@/hooks/use-units';
import { cn, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const STEPS = ['Society profile', 'Buildings', 'Units', 'Billing', 'Modules', 'Roles', 'Users', 'Notifications', 'Finish'];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const profile = useSocietyProfile();
  const onboarding = useUpdateOnboarding();
  const [step, setStep] = React.useState<number | null>(null);
  React.useEffect(() => { if (profile.data && step === null) setStep(Math.min(profile.data.onboarding?.step ?? 1, STEPS.length)); }, [profile.data, step]);
  if (profile.isLoading || step === null) return <PageSkeleton />;
  const go = (next: number, skipped?: boolean) => {
    onboarding.mutate({ step: next, skippedStep: skipped ? step : undefined });
    setStep(next);
  };
  const finish = () => onboarding.mutate({ completed: true, step: STEPS.length }, { onSuccess: () => { toast.success('Setup complete. Welcome aboard!'); navigate('/app'); } });
  return (
    <div>
      <PageHeader title="Society setup" description="Nine quick steps. You can skip anything optional and return later from Settings." />
      <ol className="mb-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setStep(i + 1)} className={cn('flex items-center gap-1 rounded-full border px-3 py-1', step === i + 1 ? 'border-primary bg-primary text-primary-foreground' : i + 1 < step ? 'border-success/40 bg-success/10 text-success' : 'text-muted-foreground')}>
              {i + 1 < step ? <Check className="h-3 w-3" /> : <span>{i + 1}.</span>} {s}
            </button>
          </li>
        ))}
      </ol>
      <Card>
        <CardContent className="p-6">
          {step === 1 ? <ProfileStep onNext={() => go(2)} /> : null}
          {step === 2 ? <BuildingsStep onNext={() => go(3)} onSkip={() => go(3, true)} /> : null}
          {step === 3 ? <UnitsStep onNext={() => go(4)} onSkip={() => go(4, true)} /> : null}
          {step === 4 ? <BillingStep onNext={() => go(5)} onSkip={() => go(5, true)} /> : null}
          {step === 5 ? <ModulesStep onNext={() => go(6)} onSkip={() => go(6, true)} /> : null}
          {step === 6 ? <RolesStep onNext={() => go(7)} /> : null}
          {step === 7 ? <UsersStep onNext={() => go(8)} onSkip={() => go(8, true)} /> : null}
          {step === 8 ? <NotificationsStep onNext={() => go(9)} onSkip={() => go(9, true)} /> : null}
          {step === 9 ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-7 w-7" /></div>
              <h2 className="text-lg font-semibold">You're all set</h2>
              <p className="text-sm text-muted-foreground">Import residents from a spreadsheet, configure charge heads and invite your committee whenever you are ready.</p>
              <Button onClick={finish} loading={onboarding.isPending}>Go to dashboard</Button>
            </div>
          ) : null}
          {step > 1 && step < 9 ? <Button variant="ghost" size="sm" className="mt-4" onClick={() => setStep(step - 1)}><ChevronLeft /> Back</Button> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function StepActions({ onNext, onSkip, nextLabel = 'Continue', loading }: { onNext: () => void; onSkip?: () => void; nextLabel?: string; loading?: boolean }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      {onSkip ? <Button variant="ghost" onClick={onSkip}>Skip for now</Button> : null}
      <Button onClick={onNext} loading={loading}>{nextLabel} <ChevronRight /></Button>
    </div>
  );
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const profile = useSocietyProfile();
  const update = useUpdateSocietyProfile();
  const p = profile.data;
  const [form, setForm] = React.useState({ name: p?.name ?? '', type: p?.type ?? 'APARTMENT', line1: p?.address?.line1 ?? '', city: p?.address?.city ?? '', state: p?.address?.state ?? '', pincode: p?.address?.pincode ?? '', email: p?.contact?.email ?? '', phone: p?.contact?.phone ?? '', registrationNumber: p?.registrationNumber ?? '' });
  return (
    <div>
      <h2 className="text-lg font-semibold">Society profile</h2>
      <p className="mb-4 text-sm text-muted-foreground">Basic details shown to residents and printed on invoices.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SocietyTypes.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Registration number</Label><Input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>PIN code</Label><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Office email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Office phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <StepActions loading={update.isPending} onNext={() => update.mutate({ name: form.name, type: form.type, registrationNumber: form.registrationNumber, address: { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode }, contact: { email: form.email, phone: form.phone } }, { onSuccess: onNext, onError: (e) => toast.error(getErrorMessage(e)) })} />
    </div>
  );
}

function BuildingsStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const buildings = useBuildings();
  const create = useCreateBuilding();
  const [form, setForm] = React.useState({ name: '', code: '', type: 'TOWER', floors: '' });
  return (
    <div>
      <h2 className="text-lg font-semibold">Buildings, towers & wings</h2>
      <p className="mb-4 text-sm text-muted-foreground">Add your structure. Villas or row houses? Add one block and continue.</p>
      <div className="mb-4 flex flex-wrap gap-2">{(buildings.data ?? []).map((b: any) => <Badge key={b.id} variant="secondary">{b.name} ({b.code}) · {b.floors} floors</Badge>)}</div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tower A" /></div>
        <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="A" /></div>
        <div className="space-y-1.5"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['TOWER', 'BUILDING', 'WING', 'BLOCK', 'PHASE', 'STREET'].map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Floors</Label><Input type="number" min={0} value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })} /></div>
      </div>
      <Button className="mt-3" variant="outline" size="sm" loading={create.isPending} disabled={!form.name || !form.code} onClick={() => create.mutate({ name: form.name, code: form.code, type: form.type, floors: Number(form.floors) || 0 }, { onSuccess: () => { toast.success('Building added'); setForm({ name: '', code: '', type: form.type, floors: '' }); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Add building</Button>
      <StepActions onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

function UnitsStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const buildings = useBuildings();
  const bulk = useBulkCreateUnits();
  const [form, setForm] = React.useState({ buildingId: '', floorFrom: '1', floorTo: '', unitsPerFloor: '4', numberPattern: '{floor}{seq2}', type: 'FLAT', areaSqft: '' });
  const [results, setResults] = React.useState<string[]>([]);
  React.useEffect(() => { if (buildings.data?.length && !form.buildingId) setForm((f) => ({ ...f, buildingId: buildings.data![0].id, floorTo: String(buildings.data![0].floors || 1) })); }, [buildings.data, form.buildingId]);
  return (
    <div>
      <h2 className="text-lg font-semibold">Generate units</h2>
      <p className="mb-4 text-sm text-muted-foreground">Create units per floor with a numbering pattern. Tokens: {'{floor}'} {'{seq}'} {'{seq2}'} (two-digit). Example: 3 floors × 4 units with {'{floor}{seq2}'} → 101…304.</p>
      {!buildings.data?.length ? <p className="text-sm text-warning-foreground dark:text-warning">Add a building first (previous step) or skip and import units later.</p> : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Building</Label><Select value={form.buildingId} onValueChange={(v) => setForm({ ...form, buildingId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{buildings.data.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="ob-floorFrom">Floor from</Label><Input id="ob-floorFrom" type="number" value={form.floorFrom} onChange={(e) => setForm({ ...form, floorFrom: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-floorTo">Floor to</Label><Input id="ob-floorTo" type="number" value={form.floorTo} onChange={(e) => setForm({ ...form, floorTo: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-unitsPerFloor">Units per floor</Label><Input id="ob-unitsPerFloor" type="number" value={form.unitsPerFloor} onChange={(e) => setForm({ ...form, unitsPerFloor: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="ob-pattern">Number pattern</Label><Input id="ob-pattern" value={form.numberPattern} onChange={(e) => setForm({ ...form, numberPattern: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Unit type</Label><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value.toUpperCase() })} /></div>
          <div className="space-y-1.5"><Label>Area (sq ft, optional)</Label><Input type="number" value={form.areaSqft} onChange={(e) => setForm({ ...form, areaSqft: e.target.value })} /></div>
        </div>
      )}
      {buildings.data?.length ? <Button className="mt-3" variant="outline" size="sm" loading={bulk.isPending} onClick={() => bulk.mutate({ buildingId: form.buildingId, floorFrom: Number(form.floorFrom), floorTo: Number(form.floorTo), unitsPerFloor: Number(form.unitsPerFloor), numberPattern: form.numberPattern, type: form.type, areaSqft: form.areaSqft ? Number(form.areaSqft) : undefined }, { onSuccess: (r) => { setResults((x) => [...x, `${r.created} units created${r.skipped.length ? `, ${r.skipped.length} skipped (already exist)` : ''}`]); toast.success(`${r.created} units created`); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Generate units</Button> : null}
      {results.length ? <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{results.map((r, i) => <li key={i}>• {r}</li>)}</ul> : null}
      <StepActions onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

function BillingStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const setting = useSocietySetting('billing.config');
  const save = useSaveSocietySetting();
  const [form, setForm] = React.useState<any>(null);
  const v = form ?? setting.data ?? {};
  return (
    <div>
      <h2 className="text-lg font-semibold">Billing basics</h2>
      <p className="mb-4 text-sm text-muted-foreground">Cycle, due date and late-payment rules. Charge heads (maintenance, water, sinking fund…) are configured in Billing → Setup.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Billing cycle</Label><Select value={v.cycle ?? 'MONTHLY'} onValueChange={(c) => setForm({ ...v, cycle: c })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL'].map((c) => <SelectItem key={c} value={c}>{formatStatus(c)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Due day of period</Label><Input type="number" min={1} max={28} value={v.dueDay ?? 10} onChange={(e) => setForm({ ...v, dueDay: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label>Grace period (days)</Label><Input type="number" min={0} value={v.gracePeriodDays ?? 5} onChange={(e) => setForm({ ...v, gracePeriodDays: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label>Late fee type</Label><Select value={v.penalty?.type ?? 'FLAT'} onValueChange={(t) => setForm({ ...v, penalty: { ...(v.penalty ?? {}), type: t } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FLAT">Flat amount</SelectItem><SelectItem value="PERCENT">Percent of dues</SelectItem><SelectItem value="INTEREST_PA">Interest % per annum</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Late fee value</Label><Input type="number" min={0} value={v.penalty?.value ?? 0} onChange={(e) => setForm({ ...v, penalty: { ...(v.penalty ?? {}), value: Number(e.target.value) } })} /></div>
        <div className="space-y-1.5"><Label>Invoice prefix</Label><Input value={v.invoicePrefix ?? 'INV'} onChange={(e) => setForm({ ...v, invoicePrefix: e.target.value.toUpperCase() })} /></div>
      </div>
      <StepActions loading={save.isPending} onSkip={onSkip} onNext={() => save.mutate({ key: 'billing.config', value: v }, { onSuccess: onNext, onError: (e) => toast.error(getErrorMessage(e)) })} />
    </div>
  );
}

function ModulesStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const modules = useSocietyModules();
  const toggle = useToggleModule();
  const list = (modules.data?.data ?? []).filter((m: any) => !m.isCore && m.inPlan);
  return (
    <div>
      <h2 className="text-lg font-semibold">Modules</h2>
      <p className="mb-4 text-sm text-muted-foreground">Everything in your plan starts enabled. Switch off what you do not need; you can change this anytime.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((m: any) => (
          <label key={m.key} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span><span className="font-medium">{m.name}</span><span className="block text-xs text-muted-foreground">{m.description}</span></span>
            <Switch checked={m.enabledBySociety} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate({ key: m.key, enabled: v }, { onError: (e) => toast.error(getErrorMessage(e)) })} />
          </label>
        ))}
      </div>
      <StepActions onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

function RolesStep({ onNext }: { onNext: () => void }) {
  const roles = useRoles();
  return (
    <div>
      <h2 className="text-lg font-semibold">Roles</h2>
      <p className="mb-4 text-sm text-muted-foreground">These default roles are ready to use. Customise them or add roles like Treasurer or Facility Manager from Settings → Roles.</p>
      <div className="grid gap-2 sm:grid-cols-2">{(roles.data ?? []).map((r: any) => <div key={r.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.description}</p></div>)}</div>
      <StepActions onNext={onNext} />
    </div>
  );
}

function UsersStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const roles = useRoles();
  const invite = useInviteUser();
  const [form, setForm] = React.useState({ email: '', name: '', roleIds: [] as string[] });
  const [sent, setSent] = React.useState<string[]>([]);
  return (
    <div>
      <h2 className="text-lg font-semibold">Invite your committee</h2>
      <p className="mb-4 text-sm text-muted-foreground">Send invitations now; residents can be imported in bulk later.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      </div>
      <div className="mt-3 grid gap-1 sm:grid-cols-3">{(roles.data ?? []).map((r: any) => <label key={r.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.roleIds.includes(r.id)} onCheckedChange={(v) => setForm({ ...form, roleIds: v ? [...form.roleIds, r.id] : form.roleIds.filter((x) => x !== r.id) })} /> {r.name}</label>)}</div>
      <Button className="mt-3" variant="outline" size="sm" loading={invite.isPending} disabled={!form.email || !form.roleIds.length} onClick={() => invite.mutate({ email: form.email, name: form.name || undefined, roleIds: form.roleIds }, { onSuccess: () => { setSent((s) => [...s, form.email]); setForm({ email: '', name: '', roleIds: [] }); toast.success('Invitation sent'); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Send invitation</Button>
      {sent.length ? <p className="mt-2 text-xs text-muted-foreground">Invited: {sent.join(', ')}</p> : null}
      <StepActions onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

function NotificationsStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const setting = useSocietySetting('notifications.channels');
  const save = useSaveSocietySetting();
  const [form, setForm] = React.useState<any>(null);
  const v = form ?? setting.data ?? {};
  return (
    <div>
      <h2 className="text-lg font-semibold">Notification channels</h2>
      <p className="mb-4 text-sm text-muted-foreground">How residents and committee members are notified. Fine-tune per event later in Settings → Notifications.</p>
      <div className="grid gap-2 sm:grid-cols-2">{[['EMAIL', 'Email'], ['WHATSAPP', 'WhatsApp'], ['PUSH', 'Push notifications']].map(([k, label]) => <label key={k} className="flex items-center justify-between rounded-md border p-3 text-sm"><span>{label}</span><Switch checked={Boolean(v[k])} onCheckedChange={(on) => setForm({ ...v, [k]: on })} /></label>)}</div>
      <StepActions loading={save.isPending} onSkip={onSkip} onNext={() => save.mutate({ key: 'notifications.channels', value: v }, { onSuccess: onNext })} />
    </div>
  );
}
