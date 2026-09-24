import { Link } from 'react-router-dom';
import { BarChart3, Landmark, Wrench, Shield, Users, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { CardSkeleton } from '@/components/common/loading-state';
import { EmptyState } from '@/components/common/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useReportCatalogue } from '@/hooks/use-reports';

const GROUPS: { key: string; label: string; icon: React.ReactNode; blurb: string }[] = [
  { key: 'FINANCE', label: 'Finance', icon: <Landmark className="h-4 w-4" />, blurb: 'Billing, collections, spend and the ledger.' },
  { key: 'OPERATIONS', label: 'Operations', icon: <Wrench className="h-4 w-4" />, blurb: 'Helpdesk, staff, contracts, assets and the store.' },
  { key: 'SECURITY', label: 'Security', icon: <Shield className="h-4 w-4" />, blurb: 'Who came in, what happened at the gate.' },
  { key: 'COMMUNITY', label: 'Community', icon: <Users className="h-4 w-4" />, blurb: 'Occupancy and amenity use.' },
];

/** Report catalogue: only reports whose module is enabled and the caller may see are listed by the server. */
export default function ReportsPage() {
  const catalogue = useReportCatalogue();
  const reports = catalogue.data ?? [];
  return (
    <div>
      <PageHeader title="Reports" description="Ready-made views across every module. Open one, pick the period, export the table." />
      {catalogue.isLoading ? <CardSkeleton count={4} /> : !reports.length ? <EmptyState icon={<BarChart3 />} title="No reports available" description="Reports follow the modules enabled for your society and your role's permissions." /> : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const items = reports.filter((r) => r.group === g.key);
            if (!items.length) return null;
            return (
              <section key={g.key}>
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">{g.icon} {g.label} <Badge variant="muted">{items.length}</Badge></h2>
                <p className="mb-3 text-xs text-muted-foreground">{g.blurb}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((r) => (
                    <Link key={r.key} to={`/app/reports/${r.key}`} className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40">
                      <Card className="border-0 bg-transparent shadow-none"><CardContent className="p-0">
                        <p className="flex items-center justify-between font-medium">{r.name}<ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></p>
                        <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{r.params.includes('period') ? 'By period' : r.params.includes('month') ? 'By month' : r.params.includes('asOf') ? 'As of a date' : r.params.includes('months') ? 'Months ahead / back' : 'Snapshot'}{r.chart ? ' · chart + table' : ' · table'}</p>
                      </CardContent></Card>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
