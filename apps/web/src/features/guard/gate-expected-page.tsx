import * as React from 'react';
import { toast } from 'sonner';
import { LogIn, CalendarClock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { useGateAction, useGateBoard, useGateRealtime } from '@/hooks/use-visitors';
import { OfflineBanner, RefreshButton, VisitorCard, useSelectedGate } from '@/features/guard/gate-shared';
import { getErrorMessage } from '@/lib/errors';

/** Pre-approved visitors due today, searchable by name / unit / vehicle. Works from the cached board when offline. */
export default function GateExpectedPage() {
  const board = useGateBoard();
  const action = useGateAction();
  const [gateId] = useSelectedGate();
  const [q, setQ] = React.useState('');
  useGateRealtime();
  const rows = (board.data?.expected ?? []).filter((v: any) => !q || [v.name, v.unitId?.code, v.vehicleNumber, v.phone, v.companyName].some((x) => String(x ?? '').toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <div className="flex items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5" /> Expected today</h1><RefreshButton onClick={() => board.refetch()} loading={board.isFetching} /></div>
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-12 pl-9" placeholder="Name, flat, vehicle…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expected visitors" /></div>
      {board.isLoading ? <CardSkeleton count={3} /> : rows.length ? <div className="space-y-2">{rows.map((v: any) => <VisitorCard key={v.id} v={v} actions={<Button size="sm" loading={action.isPending} onClick={() => action.mutate({ url: `/visitors/${v.id}/check-in`, body: { gateId: gateId || undefined }, label: `Check-in ${v.name}` }, { onSuccess: (r) => toast[r.queued ? 'warning' : 'success'](r.queued ? 'Saved offline — will sync' : `${v.name} checked in`), onError: (e) => toast.error(getErrorMessage(e)) })}><LogIn /> Check in</Button>} />)}</div> : <EmptyState compact title="No expected visitors" description={q ? 'Nothing matches your search.' : 'Residents have not pre-approved anyone for today.'} />}
    </div>
  );
}
