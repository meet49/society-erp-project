import { Link } from 'react-router-dom';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { registerWidgets } from '@/features/society/widgets';
import { MY_UNIT_SECTIONS } from '@/features/member/my-unit-page';
import { useAmenityStats, useBookings } from '@/hooks/use-amenities';
import { formatDate, formatTime } from '@/lib/utils';

function AmenityStatWidget() {
  const stats = useAmenityStats();
  return <StatCard label="Amenity bookings today" value={stats.data?.today ?? 0} hint={`${stats.data?.pendingApproval ?? 0} awaiting approval · ${stats.data?.pendingPayment ?? 0} awaiting payment`} icon={<CalendarDays />} tone={(stats.data?.pendingApproval ?? 0) > 0 ? 'warning' : 'default'} to="/app/amenities" loading={stats.isLoading} />;
}

function UpcomingBookingsWidget() {
  const bookings = useBookings({ limit: 6, upcoming: 'true', sort: 'startAt' });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Upcoming amenity bookings</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/app/amenities">All bookings <ArrowRight /></Link></Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {(bookings.data?.items ?? []).map((b: any) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><Link to={`/app/amenities/bookings/${b.id}`} className="font-medium hover:underline">{b.amenityId?.name}</Link><p className="truncate text-xs text-muted-foreground">{formatDate(b.startAt, 'ddd DD MMM')} {formatTime(b.startAt)} – {formatTime(b.endAt)} · {b.unitId?.code ?? '—'}</p></div>
              <StatusBadge status={b.status} />
            </li>
          ))}
          {!bookings.isLoading && !(bookings.data?.items ?? []).length ? <li className="py-3 text-muted-foreground">Nothing booked yet.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function MyUnitBookingsCard({ unit }: { unit: any }) {
  const bookings = useBookings({ limit: 3, upcoming: 'true', sort: 'startAt', unitId: unit.id });
  const items: any[] = bookings.data?.items ?? [];
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="text-sm">Upcoming bookings</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/app/my/amenities">Amenities <ArrowRight /></Link></Button></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {items.map((b) => <li key={b.id} className="flex items-center justify-between gap-3 py-2"><span><span className="font-medium">{b.amenityId?.name}</span><span className="block text-xs text-muted-foreground">{formatDate(b.startAt, 'ddd DD MMM')} · {formatTime(b.startAt)} – {formatTime(b.endAt)}</span></span><StatusBadge status={b.status} /></li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

registerWidgets([
  { key: 'amenities-today', module: 'amenities', permission: 'amenities:view_bookings', size: 'stat', component: AmenityStatWidget },
  { key: 'amenities-upcoming', module: 'amenities', permission: 'amenities:view_bookings', size: 'half', component: UpcomingBookingsWidget },
]);
MY_UNIT_SECTIONS.push({ key: 'amenities-upcoming', component: MyUnitBookingsCard });
