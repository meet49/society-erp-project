import { Phone, Megaphone, History } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { useEmergencyActive, useEmergencyAlerts, useSecurityRealtime } from '@/hooks/use-security';
import { usePermissions } from '@/hooks/use-access';
import { useAuth } from '@/hooks/use-auth';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { AlertCard, ContactsList, SosButton } from '@/features/emergency/emergency-shared';

/** Resident emergency screen: one big SOS button, live notices, numbers to call, my past alerts. */
export default function MyEmergencyPage() {
  const { can } = usePermissions();
  const { user, context } = useAuth();
  const active = useEmergencyActive();
  const history = useEmergencyAlerts({ kind: 'SOS', limit: 5 });
  useSecurityRealtime();
  const mySos = (active.data?.sos ?? []).filter((a: any) => a.raisedBy?.id === user?.id);
  const broadcasts = active.data?.broadcasts ?? [];
  return (
    <div>
      <PageHeader title="Emergency" description="Help is one tap away. Guards and the committee are alerted with your name and flat." />
      {broadcasts.length ? <section className="mb-6 space-y-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Megaphone className="h-4 w-4" /> Emergency notices</h2>{broadcasts.map((b: any) => <AlertCard key={b.id} alert={b} compact />)}</section> : null}
      <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-4">
          {mySos.length ? <div className="w-full max-w-md space-y-3">{mySos.map((a: any) => <AlertCard key={a.id} alert={a} ownUserId={user?.id} />)}</div> : can('emergency:sos') ? <SosButton unitId={context?.resident?.primaryUnitId ?? null} /> : <p className="text-sm text-muted-foreground">SOS is not enabled for your account.</p>}
          {!mySos.length && can('emergency:sos') ? <p className="max-w-xs text-center text-xs text-muted-foreground">Sends your name, flat and location to responders immediately. If you are offline, call the numbers instead.</p> : null}
        </div>
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4" /> Numbers to call</h2>
          <ContactsList />
        </section>
      </div>
      {(history.data?.items ?? []).length ? <section className="mt-8"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><History className="h-4 w-4" /> My past alerts</h2><ul className="divide-y rounded-lg border bg-card text-sm">{(history.data?.items ?? []).map((a: any) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span>{formatStatus(a.category)} SOS · {a.alertNumber}<span className="block text-xs text-muted-foreground">{formatDateTime(a.createdAt)}{a.acknowledgedBy?.name ? ` · ${a.acknowledgedBy.name} responded` : ''}</span></span><StatusBadge status={a.status} /></li>)}</ul></section> : null}
    </div>
  );
}
