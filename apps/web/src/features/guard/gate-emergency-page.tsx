import * as React from 'react';
import { Siren, Phone, Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { useEmergencyActive, useSecurityRealtime } from '@/hooks/use-security';
import { usePermissions } from '@/hooks/use-access';
import { useAuth } from '@/hooks/use-auth';
import { GatePicker, OfflineBanner } from './gate-shared';
import { AlertCard, ContactsList, SosButton } from '@/features/emergency/emergency-shared';

/** Guard emergency screen: live SOS list with one-tap "I'm responding", raise SOS from the gate, numbers to call. */
export default function GateEmergencyPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const active = useEmergencyActive();
  const onSos = React.useCallback((a: any) => { try { navigator.vibrate?.([300, 100, 300, 100, 300]); } catch { /* ignore */ } void a; }, []);
  useSecurityRealtime({ onSos });
  const sos = active.data?.sos ?? [];
  const broadcasts = active.data?.broadcasts ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title="Emergency" actions={<GatePicker />} />
      <OfflineBanner />
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Siren className="h-4 w-4" /> Live SOS <Badge variant={sos.length ? 'destructive' : 'muted'}>{sos.length}</Badge></h2>
        {sos.length ? <div className="space-y-3">{sos.map((a: any) => <AlertCard key={a.id} alert={a} canRespond={can('emergency:respond')} ownUserId={user?.id} />)}</div> : <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">No SOS right now.</p>}
      </section>
      {broadcasts.length ? <section><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Megaphone className="h-4 w-4" /> Emergency notices</h2><div className="space-y-2">{broadcasts.map((b: any) => <AlertCard key={b.id} alert={b} compact />)}</div></section> : null}
      {can('emergency:sos') ? <section className="flex flex-col items-center gap-2 py-2"><SosButton location="Main gate" className="h-32 w-32" /><p className="text-center text-xs text-muted-foreground">Raise an SOS from the gate: fire, medical, intruder.</p></section> : null}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Phone className="h-4 w-4" /> Numbers to call</h2>
        <ContactsList compact />
      </section>
    </div>
  );
}
