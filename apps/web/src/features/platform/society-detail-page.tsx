import * as React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, KeyRound, Ban, CheckCircle2, Archive } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { KeyValue } from '@/components/common/key-value';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable, useListState } from '@/components/common/data-table';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/icon';
import { useResetSocietyAdminPassword, useSetSocietyStatus, useSocietyActivity, useSocietyDetail, useSocietyModulesPlatform, useSocietyUsersPlatform, useToggleSocietyModulePlatform } from '@/hooks/use-platform';
import { SubscriptionActions } from '@/features/platform/subscription-actions';
import { formatCurrency, formatDate, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export default function SocietyDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const detail = useSocietyDetail(id);
  const modules = useSocietyModulesPlatform(id);
  const toggle = useToggleSocietyModulePlatform(id);
  const setStatus = useSetSocietyStatus(id);
  const resetPw = useResetSocietyAdminPassword(id);
  const usersList = useListState();
  const users = useSocietyUsersPlatform(id, usersList.params);
  const activityList = useListState();
  const activity = useSocietyActivity(id, activityList.params);
  const { confirm, ConfirmElement } = useConfirm();
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);

  if (detail.isLoading) return <PageSkeleton />;
  if (detail.isError || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const { society, subscription, admin, stats, limits, adminCount } = detail.data;
  const plan = subscription?.planId;

  const changeStatus = async (status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') => {
    const ok = await confirm({ title: `${formatStatus(status)} ${society.name}?`, description: status === 'SUSPENDED' ? 'All society users will be blocked immediately until the society is reactivated.' : status === 'ARCHIVED' ? 'The society becomes read-only for the platform and disappears from society logins. Data is retained.' : 'Users regain access immediately.', destructive: status !== 'ACTIVE', confirmLabel: formatStatus(status) });
    if (ok) setStatus.mutate({ status }, { onSuccess: () => toast.success(`Society ${status.toLowerCase()}`) });
  };

  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title={society.name}
        description={`${society.address?.city ?? ''} · ${formatStatus(society.type)} · joined ${formatDate(society.createdAt)}`}
        breadcrumbs={[{ label: 'Societies', to: '/admin/societies' }, { label: society.name }]}
        actions={
          <>
            <StatusBadge status={society.status} />
            {subscription ? <SubscriptionActions subscription={{ id: subscription.id, status: subscription.status, planId: subscription.planId, billingCycle: subscription.billingCycle, amount: subscription.amount, currency: subscription.currency }} /> : null}
            {society.status === 'ACTIVE' ? (
              <Button variant="outline" onClick={() => changeStatus('SUSPENDED')}>
                <Ban /> Suspend
              </Button>
            ) : (
              <Button variant="outline" onClick={() => changeStatus('ACTIVE')}>
                <CheckCircle2 /> Reactivate
              </Button>
            )}
            {society.status !== 'ARCHIVED' ? (
              <Button variant="ghost" onClick={() => changeStatus('ARCHIVED')}>
                <Archive /> Archive
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs value={params.get('tab') ?? 'overview'} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          {['overview', 'subscription', 'modules', 'users', 'usage', 'activity'].map((t) => (
            <TabsTrigger key={t} value={t}>
              {formatStatus(t)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Society</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue columns={2} items={[{ label: 'Slug', value: society.slug }, { label: 'Registration', value: society.registrationNumber || '—' }, { label: 'Address', value: [society.address?.line1, society.address?.city, society.address?.state, society.address?.pincode].filter(Boolean).join(', ') || '—', span: 2 }, { label: 'Contact', value: `${society.contact?.email ?? '—'} · ${society.contact?.phone ?? '—'}`, span: 2 }, { label: 'Timezone / currency', value: `${society.timezone} · ${society.currency}` }, { label: 'Onboarding', value: society.onboarding?.completed ? 'Completed' : `Step ${society.onboarding?.step ?? 1}` }, { label: 'Units', value: stats.units }, { label: 'Residents', value: stats.residents }, { label: 'Users', value: `${stats.users} (${adminCount} admin)` }, { label: 'Source', value: formatStatus(society.source) }]} />
              {society.suspendReason ? <p className="mt-3 text-sm text-destructive">Suspended: {society.suspendReason}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Primary administrator</CardTitle>
              <CardDescription>Reset access when a committee loses its credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <KeyValue columns={1} items={[{ label: 'Name', value: admin?.name ?? '—' }, { label: 'Email', value: admin?.email ?? '—' }, { label: 'Phone', value: admin?.phone ?? '—' }, { label: 'Last login', value: admin?.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'Never' }]} />
              {tempPassword ? (
                <div className="rounded-md border bg-muted p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Temporary password (shown once)</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="font-mono">{tempPassword}</code>
                    <Button variant="ghost" size="icon-sm" onClick={() => { void navigator.clipboard.writeText(tempPassword); toast.success('Copied'); }} aria-label="Copy">
                      <Copy />
                    </Button>
                  </div>
                </div>
              ) : null}
              <Button variant="outline" size="sm" loading={resetPw.isPending} onClick={async () => { if (await confirm({ title: 'Reset the administrator password?', description: 'All their sessions are signed out and a temporary password is generated.', destructive: true, confirmLabel: 'Reset' })) resetPw.mutate(undefined, { onSuccess: (d) => setTempPassword(d.tempPassword), onError: (e) => toast.error(getErrorMessage(e)) }); }}>
                <KeyRound /> Reset admin password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              {subscription ? (
                <KeyValue columns={3} items={[{ label: 'Status', value: <StatusBadge status={subscription.status} /> }, { label: 'Plan', value: plan?.name ?? '—' }, { label: 'Billing cycle', value: formatStatus(subscription.billingCycle) }, { label: 'Amount', value: formatCurrency(subscription.amount, subscription.currency) }, { label: 'Started', value: formatDate(subscription.startDate) }, { label: 'Renewal', value: formatDate(subscription.renewalDate) }, { label: 'Trial ends', value: formatDate(subscription.trialEndDate) }, { label: 'Grace ends', value: formatDate(subscription.gracePeriodEndsAt) }, { label: 'Payment', value: formatStatus(subscription.paymentStatus) }]} />
              ) : (
                <p className="text-sm text-muted-foreground">No subscription.</p>
              )}
              {subscription?.history?.length ? (
                <div className="mt-6">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">History</p>
                  <ul className="space-y-1 text-sm">
                    {[...subscription.history].reverse().map((h: any, i: number) => (
                      <li key={i} className="flex items-center gap-3">
                        <span className="w-36 shrink-0 text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
                        <StatusBadge status={h.status} />
                        <span className="text-muted-foreground">{h.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Modules</CardTitle>
              <CardDescription>Platform override of the society's module toggles. Plan availability comes from the plan.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(modules.data ?? []).map((m: any) => (
                  <li key={m.key} className="flex items-center gap-3 py-2.5">
                    <DynamicIcon name={m.icon} className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {m.name} {m.isCore ? <Badge variant="muted" className="ml-1">Core</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{!m.globallyActive ? 'Globally inactive' : !m.inPlan ? 'Not in plan' : m.featureFlagBlocked ? 'Feature flag off' : !m.dependenciesMet ? `Needs ${m.missingDependencies.join(', ')}` : m.accessible ? 'Available' : 'Disabled by society'}</p>
                    </div>
                    <Switch checked={m.enabledBySociety} disabled={m.isCore || !m.inPlan || !m.globallyActive || toggle.isPending} onCheckedChange={(v) => toggle.mutate({ key: m.key, enabled: v }, { onError: (e) => toast.error(getErrorMessage(e)) })} aria-label={`Toggle ${m.name}`} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <DataTable
            rows={users.data?.items}
            loading={users.isFetching}
            error={users.error}
            rowKey={(m: any) => m.id}
            columns={[
              { key: 'user', header: 'User', cell: (m: any) => (
                  <div>
                    <p className="font-medium">{m.user?.name}</p>
                    <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                  </div>
                ) },
              { key: 'roles', header: 'Roles', cell: (m: any) => <div className="flex flex-wrap gap-1">{(m.roles ?? []).map((r: any) => <Badge key={r.id ?? r._id} variant="secondary">{r.name}</Badge>)}</div> },
              { key: 'status', header: 'Status', cell: (m: any) => <StatusBadge status={m.status} /> },
              { key: 'last', header: 'Last login', hideBelow: 'md', cell: (m: any) => (m.user?.lastLoginAt ? formatDateTime(m.user.lastLoginAt) : 'Never') },
            ]}
            pagination={users.data ? { page: users.data.page, pages: users.data.pages, total: users.data.total, limit: users.data.limit, onPageChange: usersList.setPage } : undefined}
          />
        </TabsContent>

        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Plan limits & usage</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {(limits ?? []).map((l: any) => (
                <div key={l.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{l.label}</span>
                    <span className="tabular text-muted-foreground">
                      {l.used} / {l.limit == null ? '∞' : l.limit}
                    </span>
                  </div>
                  <Progress value={l.used} max={l.limit ?? Math.max(l.used, 1)} tone={l.limit != null && l.used >= l.limit ? 'destructive' : l.limit != null && l.used / l.limit > 0.8 ? 'warning' : 'primary'} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <DataTable
            rows={activity.data?.items}
            loading={activity.isFetching}
            error={activity.error}
            rowKey={(a: any) => a.id}
            dense
            columns={[
              { key: 'when', header: 'When', cell: (a: any) => <span className="text-xs">{formatDateTime(a.createdAt)}</span> },
              { key: 'actor', header: 'Actor', cell: (a: any) => a.actorName ?? a.actorType },
              { key: 'action', header: 'Action', cell: (a: any) => <code className="text-xs">{a.action}</code> },
              { key: 'resource', header: 'Resource', hideBelow: 'md', cell: (a: any) => `${a.resource}${a.resourceId ? ` · ${String(a.resourceId).slice(-6)}` : ''}` },
            ]}
            pagination={activity.data ? { page: activity.data.page, pages: activity.data.pages, total: activity.data.total, limit: activity.data.limit, onPageChange: activityList.setPage } : undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
