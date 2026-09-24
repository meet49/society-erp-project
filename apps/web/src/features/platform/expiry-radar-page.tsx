import * as React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useExpiryRadar } from '@/hooks/use-platform';
import { SubscriptionActions } from '@/features/platform/subscription-actions';
import { cn, formatDate } from '@/lib/utils';

const TONE: Record<string, string> = { expired: 'border-destructive/50', today: 'border-destructive/50', '1-3': 'border-warning/60', '4-7': 'border-warning/40' };

export default function ExpiryRadarPage() {
  const radar = useExpiryRadar();
  const [active, setActive] = React.useState<string | null>(null);
  if (radar.isError) return <ErrorState error={radar.error} onRetry={() => radar.refetch()} />;
  const buckets = radar.data ?? [];
  const selected = buckets.find((b: any) => b.key === active) ?? buckets.find((b: any) => b.count > 0) ?? buckets[0];
  return (
    <div>
      <PageHeader title="Expiry radar" description="Subscriptions grouped by days until renewal. Thresholds are configurable in Platform settings → subscription." breadcrumbs={[{ label: 'Subscriptions', to: '/admin/subscriptions' }, { label: 'Expiry radar' }]} />
      {radar.isLoading ? (
        <CardSkeleton count={6} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {buckets.map((b: any) => (
            <button key={b.key} type="button" onClick={() => setActive(b.key)} className={cn('rounded-lg border bg-card p-4 text-left transition-shadow hover:shadow-md', TONE[b.key], selected?.key === b.key && 'ring-2 ring-primary')} aria-pressed={selected?.key === b.key}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{b.count}</p>
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">{selected.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {selected.items.length === 0 ? (
              <EmptyState title="Nothing in this bucket" compact className="border-0" />
            ) : (
              <ul className="divide-y">
                {selected.items.map((s: any) => (
                  <li key={s._id ?? s.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/admin/societies/${s.societyId?._id ?? s.societyId?.id}`} className="font-medium hover:underline">
                          {s.societyId?.name ?? 'Society'}
                        </Link>
                        <StatusBadge status={s.status} />
                        <Badge variant="secondary">{s.planId?.name}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Renews {formatDate(s.renewalDate)} · {s.daysRemaining < 0 ? `${Math.abs(s.daysRemaining)} days overdue` : `${s.daysRemaining} days left`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {s.societyId?.contact?.email ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`mailto:${s.societyId.contact.email}`}>
                            <Mail /> Email
                          </a>
                        </Button>
                      ) : null}
                      {s.societyId?.contact?.phone ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`tel:${s.societyId.contact.phone}`}>
                            <Phone /> Call
                          </a>
                        </Button>
                      ) : null}
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/admin/societies/${s.societyId?._id ?? s.societyId?.id}?tab=subscription`}>View</Link>
                      </Button>
                      <SubscriptionActions compact subscription={{ id: s._id ?? s.id, status: s.status, planId: s.planId, billingCycle: s.billingCycle, amount: s.amount, currency: s.currency }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
