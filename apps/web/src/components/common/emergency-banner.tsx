import { Link } from 'react-router-dom';
import { Siren, Megaphone } from 'lucide-react';
import { useEmergencyActive, useSecurityRealtime } from '@/hooks/use-security';
import { useAccessibleModules, usePermissions } from '@/hooks/use-access';

/**
 * Sticky strip shown above every page while an SOS or emergency broadcast is live.
 * Responders see every SOS; residents see their own alert and broadcasts addressed to them.
 */
export function EmergencyBanner({ guard }: { guard?: boolean }) {
  const { hasModule } = useAccessibleModules();
  const { can } = usePermissions();
  const enabled = hasModule('emergency') && can('emergency:view');
  const active = useEmergencyActive(enabled);
  useSecurityRealtime();
  if (!enabled || !active.data) return null;
  const sos = active.data.sos ?? [];
  const broadcasts = active.data.broadcasts ?? [];
  if (!sos.length && !broadcasts.length) return null;
  const responder = can('emergency:respond') || can('emergency:manage');
  const to = guard ? '/guard/emergency' : responder ? '/app/emergency' : '/app/my/emergency';
  return (
    <Link to={to} className="flex items-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground" role="alert">
      {sos.length ? <Siren className="h-4 w-4 animate-pulse" /> : <Megaphone className="h-4 w-4" />}
      <span className="min-w-0 flex-1 truncate">
        {sos.length ? `${sos.length} live SOS${sos[0].location ? ` · ${sos[0].location}` : ''}${sos[0].unitId?.code ? ` (flat ${sos[0].unitId.code})` : ''}` : ''}
        {sos.length && broadcasts.length ? ' · ' : ''}
        {broadcasts.length ? `Emergency notice: ${broadcasts[0].title}` : ''}
      </span>
      <span className="text-xs underline">Open</span>
    </Link>
  );
}
