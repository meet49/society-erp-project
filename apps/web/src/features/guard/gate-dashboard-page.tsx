import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ScanLine, UserPlus, LogOut, LogIn, Package, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useGateAction, useGateBoard, useGateRealtime, useDeliveriesAtGate } from '@/hooks/use-visitors';
import { GatePicker, OfflineBanner, RefreshButton, VisitorCard, useSelectedGate } from '@/features/guard/gate-shared';
import { formatRelative } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Gate home: who is waiting for approval, who is expected, who is inside — with one-tap actions. */
export default function GateDashboardPage() {
  const board = useGateBoard();
  const atGate = useDeliveriesAtGate();
  const action = useGateAction();
  const [gateId] = useSelectedGate();
  const onDecision = React.useCallback((d: any) => { toast(d.status === 'APPROVED' ? `${d.visitorName} approved by ${d.unitCode ?? 'resident'}` : d.status === 'DENIED' ? `${d.visitorName} denied${d.reason ? `: ${d.reason}` : ''}` : `${d.visitorName}: ${d.reason ?? d.status}`, { duration: 8000 }); }, []);
  useGateRealtime(onDecision);
  const run = (url: string, body: Record<string, unknown>, label: string, done: string) => action.mutate({ url, body: { ...body, gateId: gateId || undefined }, label }, { onSuccess: (r) => toast[r.queued ? 'warning' : 'success'](r.queued ? `${label} saved offline — will sync` : done), onError: (e) => toast.error(getErrorMessage(e)) });
  if (board.isLoading) return <CardSkeleton count={3} />;
  if (board.isError) return <ErrorState error={board.error} onRetry={() => board.refetch()} />;
  const b = board.data;
  return (
    <div className="space-y-5">
      <OfflineBanner />
      <div className="flex items-center justify-between gap-2">
        <GatePicker />
        <RefreshButton onClick={() => { board.refetch(); atGate.refetch(); }} loading={board.isFetching} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-16 text-base"><Link to="/guard/scan"><ScanLine /> Scan pass</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-16 text-base"><Link to="/guard/walk-in"><UserPlus /> Walk-in</Link></Button>
      </div>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" /> Waiting for resident approval <Badge variant={b.pending.length ? 'warning' : 'muted'}>{b.pending.length}</Badge></h2>
        {b.pending.length ? <div className="space-y-2">{b.pending.map((v: any) => <VisitorCard key={v.id} v={v} actions={<span className="text-xs text-muted-foreground">Resident{v.hostUserId?.name ? ` ${v.hostUserId.name}` : ''} notified · you will see the decision here{b.config?.walkInApprovalTimeoutMinutes ? ` (times out in ${b.config.walkInApprovalTimeoutMinutes} min)` : ''}</span>} />)}</div> : <p className="text-sm text-muted-foreground">No walk-ins waiting.</p>}
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><LogIn className="h-4 w-4" /> Expected today <Badge variant="muted">{b.expected.length}</Badge></h2>
        {b.expected.length ? <div className="space-y-2">{b.expected.slice(0, 8).map((v: any) => <VisitorCard key={v.id} v={v} actions={<Button size="sm" loading={action.isPending} onClick={() => run(`/visitors/${v.id}/check-in`, {}, 'Check-in', `${v.name} checked in`)}><LogIn /> Check in</Button>} />)}{b.expected.length > 8 ? <Button asChild variant="link" size="sm"><Link to="/guard/expected">See all {b.expected.length}</Link></Button> : null}</div> : <p className="text-sm text-muted-foreground">No pre-approved visitors due today.</p>}
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><LogOut className="h-4 w-4" /> Inside now <Badge variant="muted">{b.inside.length}</Badge></h2>
        {b.inside.length ? <div className="space-y-2">{b.inside.map((v: any) => <VisitorCard key={v.id} v={v} actions={<Button size="sm" variant="outline" loading={action.isPending} onClick={() => run(`/visitors/${v.id}/check-out`, {}, 'Check-out', `${v.name} checked out`)}><LogOut /> Check out</Button>} />)}</div> : <EmptyState compact title="Nobody inside" description="Visitors you check in appear here until they leave." />}
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> Parcels at the gate <Badge variant="muted">{atGate.data?.length ?? 0}</Badge></h2>
        {(atGate.data ?? []).length ? <ul className="space-y-1 text-sm">{(atGate.data ?? []).slice(0, 5).map((d: any) => <li key={d.id} className="flex justify-between rounded border p-2"><span>{d.provider ?? 'Delivery'} · Unit {d.unitId?.code}</span><span className="text-xs text-muted-foreground">{formatRelative(d.arrivedAt)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Nothing held at the gate.</p>}
        <Button asChild variant="link" size="sm" className="px-0"><Link to="/guard/deliveries">Log a delivery</Link></Button>
      </section>
    </div>
  );
}
