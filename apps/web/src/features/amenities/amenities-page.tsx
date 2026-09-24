import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, Download, CalendarDays, Clock, Inbox, Wallet, Undo2, Pencil, Trash2, Dumbbell, ShieldCheck } from 'lucide-react';
import { AmenityBookingStatus } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { HorizontalBars } from '@/components/common/charts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAmenities, useAmenityCalendar, useAmenityRealtime, useAmenitySettings, useAmenityStats, useAvailability, useBookings, useDeleteAmenity, useExportBookings, useSaveAmenitySettings } from '@/hooks/use-amenities';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { formatCurrency, formatStatus, formatTime } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AmenityDialog, BookingDialog, PaymentChip, hoursLabel, pricingLabel, whenLabel } from './booking-shared';

function ScheduleTab({ amenities }: { amenities: any[] }) {
  const navigate = useNavigate();
  const [amenityId, setAmenityId] = React.useState('');
  const [date, setDate] = React.useState(dayjs().format('YYYY-MM-DD'));
  React.useEffect(() => { if (!amenityId && amenities.length) setAmenityId(amenities[0].id); }, [amenities, amenityId]);
  const from = dayjs(date).startOf('day').toISOString();
  const to = dayjs(date).endOf('day').toISOString();
  const availability = useAvailability(amenityId, date);
  const calendar = useAmenityCalendar(amenityId, from, to);
  const slots: any[] = availability.data?.slots ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <div className="space-y-1.5"><Label htmlFor="sc-amenity">Amenity</Label><Select value={amenityId} onValueChange={setAmenityId}><SelectTrigger id="sc-amenity"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{amenities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="sc-date">Date</Label><Input id="sc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      {availability.data?.closed ? <p className="text-sm text-muted-foreground">{availability.data.reason}</p> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {slots.map((s) => (
            <div key={s.startAt} className={`rounded-md border p-2 text-xs ${s.booked >= s.capacity ? 'bg-primary/10 border-primary/40' : s.bookable ? 'bg-card' : 'bg-muted text-muted-foreground'}`}>
              <p className="font-medium">{formatTime(s.startAt)} – {formatTime(s.endAt)}</p>
              <p className="text-muted-foreground">{s.booked ? `${s.booked} of ${s.capacity} booked` : s.bookable ? 'Free' : s.reason}</p>
            </div>
          ))}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="text-sm">Bookings on {dayjs(date).format('ddd, DD MMM')}</CardTitle></CardHeader>
        <CardContent>
          {calendar.isLoading ? <CardSkeleton count={2} /> : !(calendar.data ?? []).length ? <p className="text-sm text-muted-foreground">No bookings on this day.</p> : (
            <ul className="divide-y text-sm">
              {(calendar.data ?? []).map((b: any) => (
                <li key={b.id} className="flex cursor-pointer items-center justify-between gap-3 py-2 hover:bg-muted/50" onClick={() => navigate(`/app/amenities/bookings/${b.id}`)}>
                  <span><span className="font-medium">{formatTime(b.startAt)} – {formatTime(b.endAt)}</span> · {b.unitCode ?? '—'}{b.bookingNumber ? <span className="text-muted-foreground"> · {b.bookingNumber}</span> : null}{b.purpose ? <span className="block text-xs text-muted-foreground">{b.purpose}</span> : null}</span>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const settings = useAmenitySettings();
  const save = useSaveAmenitySettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);
  if (!form) return <CardSkeleton count={2} />;
  const num = (k: string, label: string, hint?: string) => (
    <div className="space-y-1.5"><Label htmlFor={`as-${k}`}>{label}</Label><Input id={`as-${k}`} type="number" min={0} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Booking policy</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {num('slotMinutes', 'Default slot length (minutes)')}
          {num('maxAdvanceBookingDays', 'Book up to (days ahead)')}
          {num('minNoticeHours', 'Minimum notice (hours)')}
          {num('maxActiveBookingsPerUnit', 'Active bookings per unit (0 = unlimited)')}
          {num('cancellationHours', 'Free cancellation until (hours before)')}
          {num('lateCancellationRefundPercent', 'Refund on late cancellation (%)', 'Deposits are always returned.')}
          {num('paymentWindowHours', 'Payment window (hours)', 'Reserved slots are released if the invoice is not paid in time.')}
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={Boolean(form.blockIfDuesPending)} onCheckedChange={(v) => setForm({ ...form, blockIfDuesPending: v })} /> Block bookings while the unit has pending dues</label>
        <Button loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: () => toast.success('Booking policy saved'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save policy</Button>
      </CardContent>
    </Card>
  );
}

/** Admin / committee view: bookings pipeline, catalogue, schedule and policy. */
export default function AmenitiesPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const stats = useAmenityStats();
  const amenities = useAmenities({ includeInactive: 'true' });
  const settings = useAmenitySettings();
  const list = useListState({ limit: 20, sort: '-startAt' });
  const bookings = useBookings(list.params);
  const exportRows = useExportBookings();
  const remove = useDeleteAmenity();
  const units = useUnitOptions(can('amenities:book'));
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  const [booking, setBooking] = React.useState<any | null>(null);
  useAmenityRealtime();
  const active = (amenities.data ?? []).filter((a: any) => a.status !== 'INACTIVE');
  const deleteAmenity = async (a: any) => {
    if (!(await confirm({ title: `Delete ${a.name}?`, description: 'Past bookings are kept for records. Amenities with active bookings cannot be deleted.', confirmLabel: 'Delete', destructive: true }))) return;
    remove.mutate(a.id, { onSuccess: () => toast.success('Amenity deleted'), onError: (e) => toast.error(getErrorMessage(e)) });
  };
  return (
    <div>
      <PageHeader
        title="Amenities"
        description="Facilities, slot bookings, approvals, fees and refunds."
        actions={<>
          <PermissionGate permission="amenities:export"><Button variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(list.params, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
          <PermissionGate permission="amenities:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> New amenity</Button></SubscriptionGate></PermissionGate>
        </>}
      />
      <StatGrid className="mb-6">
        <StatCard label="Bookings today" value={stats.data?.today ?? 0} hint={`${stats.data?.upcoming ?? 0} confirmed upcoming`} icon={<CalendarDays />} loading={stats.isLoading} />
        <StatCard label="Awaiting approval" value={stats.data?.pendingApproval ?? 0} hint={`${stats.data?.pendingPayment ?? 0} awaiting payment`} icon={<Inbox />} tone={(stats.data?.pendingApproval ?? 0) > 0 ? 'warning' : 'default'} to="/app/approvals" loading={stats.isLoading} />
        <StatCard label="Collected (30 days)" value={formatCurrency(stats.data?.revenue30d ?? 0)} hint={`${stats.data?.paidBookings30d ?? 0} paid bookings · deposits ${formatCurrency(stats.data?.deposits30d ?? 0)}`} icon={<Wallet />} loading={stats.isLoading} />
        <StatCard label="Refunds to process" value={stats.data?.refundsDue ?? 0} hint="Cancellations and deposit returns" icon={<Undo2 />} tone={(stats.data?.refundsDue ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
      </StatGrid>
      <Tabs defaultValue="bookings">
        <TabsList className="mb-4">
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="catalogue">Amenities</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          {can('amenities:update') ? <TabsTrigger value="settings">Policy</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="bookings">
          <FilterBar onReset={list.reset}>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Booking no., purpose…" className="w-full sm:w-64" />
            <FilterSelect value={list.filters.amenityId ?? ''} onChange={(v) => list.setFilter('amenityId', v)} options={(amenities.data ?? []).map((a: any) => ({ value: a.id, label: a.name }))} allLabel="All amenities" />
            <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={Object.values(AmenityBookingStatus).map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Any status" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.upcoming === 'true'} onCheckedChange={(v) => list.setFilter('upcoming', v ? 'true' : '')} /> Upcoming only</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.pendingOnly === 'true'} onCheckedChange={(v) => list.setFilter('pendingOnly', v ? 'true' : '')} /> Needs action</label>
          </FilterBar>
          <DataTable
            rows={bookings.data?.items}
            loading={bookings.isFetching}
            error={bookings.error}
            onRetry={() => bookings.refetch()}
            rowKey={(b: any) => b.id}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={(b: any) => navigate(`/app/amenities/bookings/${b.id}`)}
            emptyTitle="No bookings yet"
            emptyDescription="Residents book from My Amenities; the committee can book on behalf of a unit from the Amenities tab."
            columns={[
              { key: 'bookingNumber', header: 'Booking', cell: (b: any) => <span><span className="font-medium">{b.bookingNumber}</span><span className="block text-xs text-muted-foreground">{b.amenityId?.name}</span></span> },
              { key: 'unit', header: 'Unit', cell: (b: any) => <span>{b.unitId?.code ?? '—'}<span className="block text-xs text-muted-foreground">{b.bookedBy?.name}</span></span> },
              { key: 'startAt', header: 'When', sortable: true, cell: (b: any) => whenLabel(b) },
              { key: 'guests', header: 'Guests', hideBelow: 'md', cell: (b: any) => b.guests || '—' },
              { key: 'total', header: 'Payment', sortable: true, hideBelow: 'sm', cell: (b: any) => <PaymentChip booking={b} /> },
              { key: 'status', header: 'Status', sortable: true, cell: (b: any) => <StatusBadge status={b.status} /> },
            ]}
            pagination={bookings.data ? { page: bookings.data.page, pages: bookings.data.pages, total: bookings.data.total, limit: bookings.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
          />
        </TabsContent>
        <TabsContent value="catalogue">
          {amenities.isLoading ? <CardSkeleton count={3} /> : !(amenities.data ?? []).length ? <EmptyState icon={<Dumbbell />} title="No amenities yet" description="Add the clubhouse, gym, courts or guest rooms and set their booking rules." action={can('amenities:create') ? <Button onClick={() => setEditing('new')}><Plus /> New amenity</Button> : undefined} /> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(amenities.data ?? []).map((a: any) => (
                <Card key={a.id} className={a.status === 'INACTIVE' ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base"><span className="truncate">{a.name}</span><StatusBadge status={a.status === 'MAINTENANCE' ? 'UNDER_MAINTENANCE' : a.status} /></CardTitle>
                    <p className="text-xs text-muted-foreground">{formatStatus(a.typeKey)}{a.location ? ` · ${a.location}` : ''}</p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {hoursLabel(a)}{a.bookingMode === 'SLOT' ? ` · ${a.schedule?.slotMinutes ?? settings.data?.slotMinutes ?? 60}-min slots` : ' · whole day'}</p>
                    <p className="flex items-center gap-2 text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> {pricingLabel(a)}</p>
                    <p className="flex flex-wrap gap-1.5"><Badge variant="outline">Capacity {a.capacity}</Badge>{a.maxGuests ? <Badge variant="outline">Up to {a.maxGuests} guests</Badge> : null}{a.requiresApproval ? <Badge variant="info"><ShieldCheck className="mr-1 h-3 w-3" />Approval needed</Badge> : null}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {can('amenities:book') && a.status === 'ACTIVE' ? <SubscriptionGate><Button size="sm" onClick={() => setBooking(a)}><CalendarDays /> Book for a unit</Button></SubscriptionGate> : null}
                      {can('amenities:update') ? <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Pencil /> Edit</Button> : null}
                      {can('amenities:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAmenity(a)}><Trash2 /></Button> : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {stats.data?.usage?.length ? <Card className="mt-6"><CardHeader><CardTitle className="text-sm">Most used (last 30 days)</CardTitle></CardHeader><CardContent><HorizontalBars data={stats.data.usage.map((u: any) => ({ label: u.name, value: u.bookings }))} labelKey="label" valueKey="value" /></CardContent></Card> : null}
        </TabsContent>
        <TabsContent value="schedule"><ScheduleTab amenities={active} /></TabsContent>
        {can('amenities:update') ? <TabsContent value="settings"><SettingsTab /></TabsContent> : null}
      </Tabs>
      <AmenityDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} amenity={editing === 'new' ? null : editing} />
      <BookingDialog open={Boolean(booking)} onOpenChange={(o) => { if (!o) setBooking(null); }} amenity={booking} unitOptions={units.data ?? []} settings={settings.data} onBooked={(b) => navigate(`/app/amenities/bookings/${b.id}`)} />
      {ConfirmElement}
    </div>
  );
}
