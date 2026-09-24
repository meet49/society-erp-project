import * as React from 'react';
import { toast } from 'sonner';
import { SlidersHorizontal, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatGrid } from '@/components/common/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useAccessibleModules, usePermissions } from '@/hooks/use-access';
import { useSaveSocietySetting, useSocietySetting } from '@/hooks/use-society';
import { WIDGETS, type WidgetDefinition } from '@/features/society/widgets';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

interface DashboardLayout { hidden: string[]; order: string[] }
const widgetTitle = (w: WidgetDefinition) => formatStatus(w.key.replace(/-/g, '_'));

/** Applies the society's saved layout: hidden widgets drop out, ordered ones come first in that order, the rest keep registration order. */
export function applyLayout(widgets: WidgetDefinition[], layout?: Partial<DashboardLayout> | null): WidgetDefinition[] {
  const hidden = new Set(layout?.hidden ?? []);
  const order = layout?.order ?? [];
  const rank = (w: WidgetDefinition) => { const i = order.indexOf(w.key); return i === -1 ? order.length + widgets.indexOf(w) : i; };
  return widgets.filter((w) => !hidden.has(w.key)).sort((a, b) => rank(a) - rank(b));
}

function CustomiseDialog({ open, onOpenChange, widgets, layout }: { open: boolean; onOpenChange: (o: boolean) => void; widgets: WidgetDefinition[]; layout: DashboardLayout }) {
  const save = useSaveSocietySetting();
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [order, setOrder] = React.useState<string[]>([]);
  React.useEffect(() => { if (open) { setHidden(layout.hidden); setOrder(applyLayout(widgets, { order: layout.order }).map((w) => w.key)); } }, [open, layout, widgets]);
  const move = (key: string, dir: -1 | 1) => { const i = order.indexOf(key); const j = i + dir; if (i < 0 || j < 0 || j >= order.length) return; const next = [...order]; [next[i], next[j]] = [next[j], next[i]]; setOrder(next); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Customise the dashboard</DialogTitle><DialogDescription>Applies to everyone in the society; each person still only sees the widgets their role allows.</DialogDescription></DialogHeader>
        <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
          {order.map((key, i) => { const w = widgets.find((x) => x.key === key); if (!w) return null; const off = hidden.includes(key); return (
            <li key={key} className={`flex items-center gap-2 px-3 py-2 text-sm ${off ? 'opacity-60' : ''}`}>
              <span className="flex flex-col"><Button size="sm" variant="ghost" className="h-5 px-1" disabled={i === 0} onClick={() => move(key, -1)} aria-label={`Move ${widgetTitle(w)} up`}><ArrowUp className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="h-5 px-1" disabled={i === order.length - 1} onClick={() => move(key, 1)} aria-label={`Move ${widgetTitle(w)} down`}><ArrowDown className="h-3 w-3" /></Button></span>
              <span className="min-w-0 flex-1">{widgetTitle(w)}<Badge variant="outline" className="ml-2">{formatStatus(w.size)}</Badge><span className="block text-xs text-muted-foreground">{formatStatus(w.module)}</span></span>
              <Button size="sm" variant={off ? 'outline' : 'ghost'} onClick={() => setHidden(off ? hidden.filter((k) => k !== key) : [...hidden, key])}>{off ? <><EyeOff /> Hidden</> : <><Eye /> Shown</>}</Button>
            </li>
          ); })}
        </ul>
        <DialogFooter><Button variant="ghost" onClick={() => { setHidden([]); setOrder(widgets.map((w) => w.key)); }}>Reset</Button><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate({ key: 'dashboard.widgets', value: { hidden, order } }, { onSuccess: () => { toast.success('Dashboard layout saved'); onOpenChange(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Save layout</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Widget-based dashboard: visibility follows module access + permissions, layout comes from `dashboard.widgets`. */
export default function SocietyDashboardPage() {
  const { context } = useAuth();
  const { hasModule } = useAccessibleModules();
  const { can } = usePermissions();
  const layoutQuery = useSocietySetting('dashboard.widgets');
  const layout: DashboardLayout = { hidden: layoutQuery.data?.hidden ?? [], order: layoutQuery.data?.order ?? [] };
  const [customising, setCustomising] = React.useState(false);
  const allowed = WIDGETS.filter((w) => hasModule(w.module) && can(w.permission));
  const visible = applyLayout(allowed, layout);
  const stats = visible.filter((w) => w.size === 'stat');
  const full = visible.filter((w) => w.size === 'full');
  const half = visible.filter((w) => w.size === 'half');
  return (
    <div>
      <PageHeader title={`Welcome, ${context?.user.name?.split(' ')[0] ?? ''}`} description={context?.society?.name} actions={can('society:manage_settings') ? <Button variant="outline" size="sm" onClick={() => setCustomising(true)}><SlidersHorizontal /> Customise</Button> : null} />
      {!visible.length ? <EmptyState title="Nothing to show yet" description={allowed.length ? 'Every widget is hidden for this society. Use Customise to bring some back.' : 'Your role does not have access to any dashboard widgets.'} /> : null}
      <div className="space-y-6">
        {full.map((w) => (
          <ErrorBoundary key={w.key}><w.component /></ErrorBoundary>
        ))}
        {stats.length ? (
          <StatGrid>
            {stats.map((w) => (
              <ErrorBoundary key={w.key}><w.component /></ErrorBoundary>
            ))}
          </StatGrid>
        ) : null}
        {half.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {half.map((w) => (
              <ErrorBoundary key={w.key}><w.component /></ErrorBoundary>
            ))}
          </div>
        ) : null}
      </div>
      {can('society:manage_settings') ? <CustomiseDialog open={customising} onOpenChange={setCustomising} widgets={allowed} layout={layout} /> : null}
    </div>
  );
}
