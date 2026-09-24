import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DynamicIcon } from '@/components/common/icon';
import { TableSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useSocietyModules, useToggleModule } from '@/hooks/use-society';
import { getErrorMessage } from '@/lib/errors';
import { formatStatus } from '@/lib/utils';

const CATEGORY_ORDER = ['CORE', 'COMMUNITY', 'FINANCE', 'OPERATIONS', 'COMMUNICATION', 'GOVERNANCE', 'REPORTS', 'SUPPORT'];

export default function ModulesSettingsPage() {
  const modules = useSocietyModules();
  const toggle = useToggleModule();
  if (modules.isError) return <ErrorState error={modules.error} onRetry={() => modules.refetch()} />;
  const list = modules.data?.data ?? [];
  const plan = modules.data?.meta.plan;
  return (
    <div>
      <PageHeader title="Modules" description={`Enable the modules your society uses. Disabling a module hides it and blocks its API, but never deletes data. Plan: ${plan?.name ?? '—'}.`} actions={<Button asChild variant="outline"><Link to="/app/settings/subscription">Upgrade plan</Link></Button>} />
      <SettingsNav />
      {modules.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="space-y-6">
          {CATEGORY_ORDER.filter((c) => list.some((m: any) => m.category === c)).map((cat) => (
            <section key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatStatus(cat)}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.filter((m: any) => m.category === cat).map((m: any) => {
                  const reason = !m.globallyActive ? 'Temporarily unavailable on the platform' : !m.inPlan ? 'Not included in your plan' : m.featureFlagBlocked ? 'Not enabled on the platform yet' : !m.dependenciesMet ? `Requires ${m.missingDependencies.join(', ')}` : m.isCore ? 'Always on' : m.enabledBySociety ? 'Enabled' : 'Disabled';
                  return (
                    <Card key={m.key} className={!m.accessible && !m.isCore ? 'opacity-90' : ''}>
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted"><DynamicIcon name={m.icon} className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{m.name}</p>
                            {m.isCore ? <Badge variant="muted">Core</Badge> : null}
                            {!m.inPlan ? <Badge variant="warning">Upgrade</Badge> : null}
                            {m.status === 'BETA' ? <Badge variant="info">Beta</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{reason}{m.dependencies?.length ? ` · depends on ${m.dependencies.join(', ')}` : ''}</p>
                        </div>
                        {!m.inPlan && !m.isCore ? (
                          <Button asChild size="sm" variant="outline"><Link to="/app/settings/subscription">Upgrade</Link></Button>
                        ) : (
                          <Switch checked={m.enabledBySociety} disabled={m.isCore || !m.globallyActive || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ key: m.key, enabled: v }, { onSuccess: () => toast.success(`${m.name} ${v ? 'enabled' : 'disabled'}`), onError: (e) => toast.error(getErrorMessage(e)) })} aria-label={`Toggle ${m.name}`} />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
