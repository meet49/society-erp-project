import { History, LogIn, LogOut, UserPlus, XCircle, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { useGateRealtime, useGateTimeline } from '@/hooks/use-visitors';
import { OfflineBanner, RefreshButton } from '@/features/guard/gate-shared';
import { formatStatus, formatTime } from '@/lib/utils';

const ICON: Record<string, JSX.Element> = { CHECKED_IN: <LogIn className="h-4 w-4 text-success" />, CHECKED_OUT: <LogOut className="h-4 w-4 text-muted-foreground" />, PENDING: <UserPlus className="h-4 w-4 text-warning" />, DENIED: <XCircle className="h-4 w-4 text-destructive" />, EXPIRED: <XCircle className="h-4 w-4 text-muted-foreground" />, APPROVED: <CheckCircle2 className="h-4 w-4 text-primary" /> };

/** Today's gate activity, newest first. */
export default function GateTimelinePage() {
  const timeline = useGateTimeline();
  useGateRealtime();
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <div className="flex items-center justify-between gap-2"><h1 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" /> Today at the gate</h1><RefreshButton onClick={() => timeline.refetch()} loading={timeline.isFetching} /></div>
      {timeline.isLoading ? <CardSkeleton count={4} /> : (timeline.data ?? []).length ? (
        <ol className="space-y-2">
          {(timeline.data ?? []).map((v: any) => (
            <li key={v.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <span className="mt-0.5">{ICON[v.status] ?? <UserPlus className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{v.name} <span className="text-xs font-normal text-muted-foreground">· {formatStatus(v.categoryKey)} · Unit {v.unitId?.code ?? '—'}</span></p>
                <p className="text-xs text-muted-foreground">{v.checkOutAt ? `Out ${formatTime(v.checkOutAt)} · ` : ''}{v.checkInAt ? `In ${formatTime(v.checkInAt)}${v.checkInGateId?.name ? ` at ${v.checkInGateId.name}` : ''}` : `Registered ${formatTime(v.createdAt)}`}{v.vehicleNumber ? ` · ${v.vehicleNumber}` : ''}</p>
              </div>
              <StatusBadge status={v.status} />
            </li>
          ))}
        </ol>
      ) : <EmptyState compact title="Quiet so far" description="Check-ins and walk-ins from today will show up here." />}
    </div>
  );
}
