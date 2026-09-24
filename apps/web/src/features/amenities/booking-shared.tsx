import * as React from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Combobox } from '@/components/common/combobox';
import { useAmenityTypes, useAvailability, useBookAmenity, useCreateAmenity, useUpdateAmenity } from '@/hooks/use-amenities';
import { cn, formatCurrency, formatDate, formatDateTime, formatStatus, formatTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export const HOLDING = ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Fee summary for an amenity card. */
export function pricingLabel(a: any): string {
  const p = a?.pricing ?? {};
  const base = p.mode === 'PER_SLOT' ? `${formatCurrency(p.amount)} per slot` : p.mode === 'PER_HOUR' ? `${formatCurrency(p.amount)} per hour` : p.mode === 'PER_BOOKING' ? `${formatCurrency(p.amount)} per booking` : 'Free';
  return p.deposit ? `${base} · ${formatCurrency(p.deposit)} refundable deposit` : base;
}

export function hoursLabel(a: any): string {
  const s = a?.schedule ?? {};
  const days: number[] = s.daysOpen ?? [];
  const dayText = days.length >= 7 || !days.length ? 'Every day' : days.length === 1 ? `${DAYS[days[0]]} only` : `${days.map((d) => DAYS[d]).join(', ')}`;
  return `${s.openTime ?? '06:00'} – ${s.closeTime ?? '22:00'} · ${dayText}`;
}

export function whenLabel(b: any): string {
  return `${formatDate(b.startAt, 'ddd, DD MMM YYYY')} · ${formatTime(b.startAt)} – ${formatTime(b.endAt)}`;
}

/** Money state of a booking: free / pay by / paid / refund due / refunded. */
export function PaymentChip({ booking }: { booking: any }) {
  const b = booking;
  switch (b.paymentStatus) {
    case 'NOT_REQUIRED': return <Badge variant="muted">Free</Badge>;
    case 'PENDING': return <Badge variant="warning">Pay {formatCurrency(b.total)}{b.paymentDueAt ? ` by ${formatDateTime(b.paymentDueAt)}` : ''}</Badge>;
    case 'PAID': return <Badge variant="success">Paid {formatCurrency(b.total)}</Badge>;
    case 'REFUND_DUE': return <Badge variant="warning">Refund due {formatCurrency(b.refund?.amount ?? 0)}</Badge>;
    case 'REFUNDED': return <Badge variant="muted">Refunded {formatCurrency(b.refund?.amount ?? 0)}</Badge>;
    case 'FORFEITED': return <Badge variant="destructive">No refund (late cancellation)</Badge>;
    case 'VOID': return <Badge variant="muted">Invoice cancelled</Badge>;
    default: return null;
  }
}

export function estimate(amenity: any, slots: number, slotMinutes: number): { amount: number; deposit: number; total: number } {
  const p = amenity?.pricing ?? {};
  const rate = Number(p.amount ?? 0);
  const amount = p.mode === 'PER_SLOT' ? rate * slots : p.mode === 'PER_HOUR' ? rate * ((slots * slotMinutes) / 60) : p.mode === 'PER_BOOKING' ? rate : 0;
  const deposit = Number(p.deposit ?? 0);
  return { amount, deposit, total: amount + deposit };
}

/** Date + slot grid driven by the server's availability (capacity, maintenance, notice and advance rules). */
export function SlotPicker({ amenity, date, onDateChange, startAt, onStartChange, slots, onSlotsChange, settings }: { amenity: any; date: string; onDateChange: (d: string) => void; startAt: string | null; onStartChange: (s: string | null) => void; slots: number; onSlotsChange: (n: number) => void; settings?: any }) {
  const availability = useAvailability(amenity?.id, date);
  const data = availability.data;
  const list: any[] = data?.slots ?? [];
  const fullDay = amenity?.bookingMode === 'FULL_DAY';
  const maxSlots = fullDay ? 1 : Number(data?.amenity?.maxSlotsPerBooking ?? amenity?.schedule?.maxSlotsPerBooking ?? 1);
  const advance = amenity?.schedule?.maxAdvanceDays ?? settings?.maxAdvanceBookingDays ?? 30;
  const startIndex = list.findIndex((s) => s.startAt === startAt);
  let consecutive = 0;
  for (let i = startIndex; startIndex >= 0 && i < list.length && list[i].bookable; i += 1) consecutive += 1;
  const maxSelectable = Math.max(1, Math.min(maxSlots, consecutive || 1));
  React.useEffect(() => {
    if (slots > maxSelectable) onSlotsChange(maxSelectable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSelectable]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="bk-date">Date</Label><Input id="bk-date" type="date" value={date} min={dayjs().format('YYYY-MM-DD')} max={dayjs().add(advance, 'day').format('YYYY-MM-DD')} onChange={(e) => { onDateChange(e.target.value); onStartChange(null); }} /></div>
        {!fullDay ? (
          <div className="space-y-1.5"><Label htmlFor="bk-slots">Duration</Label>
            <Select value={String(Math.min(slots, maxSelectable))} onValueChange={(v) => onSlotsChange(Number(v))}>
              <SelectTrigger id="bk-slots"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: maxSelectable }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n} × {data?.amenity?.slotMinutes ?? amenity?.schedule?.slotMinutes ?? settings?.slotMinutes ?? 60} min</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {availability.isLoading ? <p className="text-sm text-muted-foreground">Checking availability…</p> : data?.closed ? <p className="text-sm text-muted-foreground">{data.reason}</p> : !list.length ? <p className="text-sm text-muted-foreground">No slots on this day.</p> : (
        <div className={cn('grid gap-2', fullDay ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4')}>
          {list.map((s, i) => {
            const selected = startIndex >= 0 && i >= startIndex && i < startIndex + Math.min(slots, maxSelectable);
            return (
              <button key={s.startAt} type="button" disabled={!s.bookable} onClick={() => onStartChange(s.startAt)} title={s.reason ?? undefined} data-testid="slot" className={cn('rounded-md border px-2 py-2 text-left text-xs transition-colors', selected ? 'border-primary bg-primary text-primary-foreground' : s.bookable ? 'bg-card hover:border-primary' : 'cursor-not-allowed bg-muted text-muted-foreground')}>
                <span className="block font-medium">{fullDay ? `Whole day · ${formatTime(s.startAt)} – ${formatTime(s.endAt)}` : `${formatTime(s.startAt)} – ${formatTime(s.endAt)}`}</span>
                <span className="block truncate opacity-80">{s.bookable ? (s.capacity > 1 ? `${s.available} of ${s.capacity} free` : 'Available') : s.mine ? 'Your booking' : s.reason}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Book an amenity: residents book for their unit, staff pick the unit. */
export function BookingDialog({ open, onOpenChange, amenity, unitOptions, unitId: initialUnit, settings, onBooked }: { open: boolean; onOpenChange: (o: boolean) => void; amenity: any | null; unitOptions?: { value: string; label: string; description?: string }[]; unitId?: string; settings?: any; onBooked?: (booking: any) => void }) {
  const book = useBookAmenity();
  const [date, setDate] = React.useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [startAt, setStartAt] = React.useState<string | null>(null);
  const [slots, setSlots] = React.useState(1);
  const [guests, setGuests] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [unitId, setUnitId] = React.useState(initialUnit ?? '');
  React.useEffect(() => {
    if (open) { setStartAt(null); setSlots(1); setGuests(''); setPurpose(''); setUnitId(initialUnit ?? ''); }
  }, [open, initialUnit]);
  if (!amenity) return null;
  const slotMinutes = amenity.bookingMode === 'FULL_DAY' ? 0 : Number(amenity.schedule?.slotMinutes ?? settings?.slotMinutes ?? 60);
  const est = estimate(amenity, slots, slotMinutes);
  const submit = () => {
    if (!startAt) return toast.error('Pick a time slot first');
    book.mutate({ amenityId: amenity.id, unitId: unitId || undefined, startAt, slots, guests: guests ? Number(guests) : 0, purpose: purpose || undefined }, {
      onSuccess: (b) => { toast.success(b.status === 'CONFIRMED' ? 'Booked!' : b.status === 'PENDING_APPROVAL' ? 'Request sent for approval' : 'Slot reserved — pay to confirm'); onOpenChange(false); onBooked?.(b); },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Book {amenity.name}</DialogTitle>
          <DialogDescription>{[amenity.location, hoursLabel(amenity), pricingLabel(amenity)].filter(Boolean).join(' · ')}{amenity.requiresApproval ? ' · needs committee approval' : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {unitOptions?.length ? <div className="space-y-1.5"><Label>Unit</Label><Combobox value={unitId} onChange={(v) => setUnitId(v ?? '')} options={unitOptions} placeholder="Choose the unit" /></div> : null}
          <SlotPicker amenity={amenity} date={date} onDateChange={setDate} startAt={startAt} onStartChange={setStartAt} slots={slots} onSlotsChange={setSlots} settings={settings} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="bk-guests">Guests{amenity.maxGuests ? ` (max ${amenity.maxGuests})` : ''}</Label><Input id="bk-guests" type="number" min={0} max={amenity.maxGuests || undefined} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="0" /></div>
            <div className="space-y-1.5"><Label htmlFor="bk-purpose">Purpose</Label><Input id="bk-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Birthday, practice, get-together…" /></div>
          </div>
          {amenity.rules ? <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-line">{amenity.rules}</p> : null}
        </div>
        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm">{est.total > 0 ? <>Estimated <span className="font-semibold">{formatCurrency(est.total)}</span>{est.deposit ? <span className="text-muted-foreground"> (incl. {formatCurrency(est.deposit)} refundable deposit)</span> : null}</> : <span className="text-muted-foreground">No charge</span>}</p>
          <div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={book.isPending} disabled={!startAt} onClick={submit}>{amenity.requiresApproval ? 'Request booking' : est.total > 0 ? 'Reserve & pay' : 'Book'}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BLANK = { name: '', typeKey: 'OTHER', location: '', description: '', rules: '', capacity: '1', maxGuests: '0', bookingMode: 'SLOT', openTime: '06:00', closeTime: '22:00', slotMinutes: '', daysOpen: [0, 1, 2, 3, 4, 5, 6] as number[], maxSlotsPerBooking: '2', minNoticeHours: '', maxAdvanceDays: '', pricingMode: 'FREE', amount: '0', deposit: '0', requiresApproval: false, cancellationHours: '', status: 'ACTIVE' };

function fromAmenity(a: any): typeof BLANK {
  return {
    name: a.name ?? '', typeKey: a.typeKey ?? 'OTHER', location: a.location ?? '', description: a.description ?? '', rules: a.rules ?? '', capacity: String(a.capacity ?? 1), maxGuests: String(a.maxGuests ?? 0), bookingMode: a.bookingMode ?? 'SLOT',
    openTime: a.schedule?.openTime ?? '06:00', closeTime: a.schedule?.closeTime ?? '22:00', slotMinutes: a.schedule?.slotMinutes ? String(a.schedule.slotMinutes) : '', daysOpen: a.schedule?.daysOpen ?? [0, 1, 2, 3, 4, 5, 6], maxSlotsPerBooking: String(a.schedule?.maxSlotsPerBooking ?? 2), minNoticeHours: a.schedule?.minNoticeHours != null ? String(a.schedule.minNoticeHours) : '', maxAdvanceDays: a.schedule?.maxAdvanceDays ? String(a.schedule.maxAdvanceDays) : '',
    pricingMode: a.pricing?.mode ?? 'FREE', amount: String(a.pricing?.amount ?? 0), deposit: String(a.pricing?.deposit ?? 0), requiresApproval: Boolean(a.requiresApproval), cancellationHours: a.cancellationHours != null ? String(a.cancellationHours) : '', status: a.status ?? 'ACTIVE',
  };
}

/** Create / edit an amenity: schedule, capacity, pricing, approval and cancellation rules. */
export function AmenityDialog({ open, onOpenChange, amenity }: { open: boolean; onOpenChange: (o: boolean) => void; amenity?: any | null }) {
  const types = useAmenityTypes();
  const create = useCreateAmenity();
  const update = useUpdateAmenity();
  const [form, setForm] = React.useState<typeof BLANK>(BLANK);
  React.useEffect(() => { if (open) setForm(amenity ? fromAmenity(amenity) : BLANK); }, [open, amenity]);
  const set = <K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));
  const submit = () => {
    const payload: any = {
      name: form.name, typeKey: form.typeKey, location: form.location || undefined, description: form.description || undefined, rules: form.rules || undefined,
      capacity: Number(form.capacity) || 1, maxGuests: Number(form.maxGuests) || 0, bookingMode: form.bookingMode,
      schedule: { openTime: form.openTime, closeTime: form.closeTime, slotMinutes: num(form.slotMinutes), daysOpen: form.daysOpen, maxSlotsPerBooking: Number(form.maxSlotsPerBooking) || 1, minNoticeHours: num(form.minNoticeHours), maxAdvanceDays: num(form.maxAdvanceDays) },
      pricing: { mode: form.pricingMode, amount: Number(form.amount) || 0, deposit: Number(form.deposit) || 0 },
      requiresApproval: form.requiresApproval, cancellationHours: num(form.cancellationHours), status: form.status,
    };
    const done = { onSuccess: () => { toast.success(amenity ? 'Amenity updated' : 'Amenity created'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (amenity) update.mutate({ id: amenity.id, ...payload }, done);
    else create.mutate(payload, done);
  };
  const pending = create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{amenity ? `Edit ${amenity.name}` : 'New amenity'}</DialogTitle><DialogDescription>Everything here drives the booking rules: hours, slot length, capacity, fees, approval and cancellation policy.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="am-name">Name *</Label><Input id="am-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Community hall" /></div>
          <div className="space-y-1.5"><Label htmlFor="am-type">Type</Label>
            <Select value={form.typeKey} onValueChange={(v) => set('typeKey', v)}><SelectTrigger id="am-type"><SelectValue placeholder="Type" /></SelectTrigger><SelectContent>{(types.data ?? []).map((t: any) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}{!types.data?.length ? <SelectItem value="OTHER">Other</SelectItem> : null}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="am-location">Location</Label><Input id="am-location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Clubhouse, first floor" /></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="am-desc">Description</Label><Textarea id="am-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="am-rules">Rules shown to residents</Label><Textarea id="am-rules" rows={2} value={form.rules} onChange={(e) => set('rules', e.target.value)} placeholder="No loud music after 10 pm…" /></div>
          <div className="space-y-1.5"><Label htmlFor="am-mode">Booking mode</Label>
            <Select value={form.bookingMode} onValueChange={(v) => set('bookingMode', v)}><SelectTrigger id="am-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SLOT">Time slots</SelectItem><SelectItem value="FULL_DAY">Whole day</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="am-capacity">Capacity (bookings at once)</Label><Input id="am-capacity" type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-guests">Max guests (0 = no limit)</Label><Input id="am-guests" type="number" min={0} value={form.maxGuests} onChange={(e) => set('maxGuests', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-open">Opens</Label><Input id="am-open" type="time" value={form.openTime} onChange={(e) => set('openTime', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-close">Closes</Label><Input id="am-close" type="time" value={form.closeTime} onChange={(e) => set('closeTime', e.target.value)} /></div>
          {form.bookingMode === 'SLOT' ? <div className="space-y-1.5"><Label htmlFor="am-slot">Slot length (min, blank = society default)</Label><Input id="am-slot" type="number" min={15} step={15} value={form.slotMinutes} onChange={(e) => set('slotMinutes', e.target.value)} /></div> : <div />}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label>Open on</Label>
            <div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <button key={d} type="button" onClick={() => set('daysOpen', form.daysOpen.includes(i) ? form.daysOpen.filter((x) => x !== i) : [...form.daysOpen, i].sort())} className={cn('rounded-full border px-3 py-1 text-xs', form.daysOpen.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{d}</button>)}</div>
          </div>
          {form.bookingMode === 'SLOT' ? <div className="space-y-1.5"><Label htmlFor="am-maxslots">Max consecutive slots per booking</Label><Input id="am-maxslots" type="number" min={1} value={form.maxSlotsPerBooking} onChange={(e) => set('maxSlotsPerBooking', e.target.value)} /></div> : null}
          <div className="space-y-1.5"><Label htmlFor="am-notice">Minimum notice (hours, blank = default)</Label><Input id="am-notice" type="number" min={0} value={form.minNoticeHours} onChange={(e) => set('minNoticeHours', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-advance">Book up to (days ahead, blank = default)</Label><Input id="am-advance" type="number" min={1} value={form.maxAdvanceDays} onChange={(e) => set('maxAdvanceDays', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-pricing">Pricing</Label>
            <Select value={form.pricingMode} onValueChange={(v) => set('pricingMode', v)}><SelectTrigger id="am-pricing"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FREE">Free</SelectItem><SelectItem value="PER_SLOT">Per slot</SelectItem><SelectItem value="PER_HOUR">Per hour</SelectItem><SelectItem value="PER_BOOKING">Per booking</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="am-amount">Fee (₹)</Label><Input id="am-amount" type="number" min={0} value={form.amount} disabled={form.pricingMode === 'FREE'} onChange={(e) => set('amount', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-deposit">Refundable deposit (₹)</Label><Input id="am-deposit" type="number" min={0} value={form.deposit} onChange={(e) => set('deposit', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-cancel">Free cancellation until (hours before, blank = default)</Label><Input id="am-cancel" type="number" min={0} value={form.cancellationHours} onChange={(e) => set('cancellationHours', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="am-status">Status</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}><SelectTrigger id="am-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="MAINTENANCE">Under maintenance</SelectItem><SelectItem value="INACTIVE">Inactive (hidden)</SelectItem></SelectContent></Select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={form.requiresApproval} onCheckedChange={(v) => set('requiresApproval', v)} /> Bookings need approval</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={pending} disabled={form.name.trim().length < 2} onClick={submit}>{amenity ? 'Save changes' : 'Create amenity'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Audit-style timeline of a booking. */
export function BookingHistory({ booking }: { booking: any }) {
  const rows: any[] = booking?.history ?? [];
  if (!rows.length) return null;
  return (
    <ol className="space-y-2 text-sm">
      {rows.slice().reverse().map((h, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
          <span><span className="font-medium">{formatStatus(h.action)}</span>{h.to ? <span className="text-muted-foreground"> → {formatStatus(h.to)}</span> : null}{h.note ? <span className="block text-xs text-muted-foreground">{h.note}</span> : null}{h.userId?.name ? <span className="block text-xs text-muted-foreground">by {h.userId.name}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}
