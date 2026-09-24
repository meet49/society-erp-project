import { usePublicLanding } from '@/hooks/use-public';
import { PricingSection, FaqSection } from '@/features/public/sections';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/error-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, Minus } from 'lucide-react';

const LIMIT_LABELS: Record<string, string> = { maxUnits: 'Units', maxResidents: 'Residents', maxUsers: 'Users', maxStaff: 'Staff', maxVehicles: 'Vehicles', maxDocuments: 'Documents', maxAdmins: 'Admins', maxStorageMb: 'Storage (MB)' };

export default function PricingPage() {
  const landing = usePublicLanding('home');
  if (landing.isLoading) {
    return (
      <div className="container grid gap-6 py-16 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    );
  }
  if (landing.isError || !landing.data) {
    return (
      <div className="container py-16">
        <ErrorState error={landing.error} onRetry={() => landing.refetch()} />
      </div>
    );
  }
  const { plans, settings, sections } = landing.data;
  const pricingSection = sections.find((s) => s.type === 'PRICING');
  const faq = sections.find((s) => s.type === 'FAQ');
  const allModules = [...new Map(plans.flatMap((p) => p.modules).map((m) => [m.key, m])).values()];
  const limitKeys = [...new Set(plans.flatMap((p) => Object.keys(p.limits ?? {})))];
  return (
    <>
      <PricingSection section={pricingSection ? { ...pricingSection, title: pricingSection.title || 'Pricing' } : undefined} plans={plans} settings={settings} />
      <section className="container pb-16">
        <h2 className="mb-6 text-center text-xl font-semibold">Compare plans</h2>
        <div className="mx-auto max-w-5xl overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Included</TableHead>
                {plans.map((p) => (
                  <TableHead key={p.id} className="text-center">
                    {p.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {limitKeys.map((k) => (
                <TableRow key={k}>
                  <TableCell className="font-medium">{LIMIT_LABELS[k] ?? k}</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-center tabular">
                      {p.limits?.[k] == null ? 'Unlimited' : p.limits[k]!.toLocaleString('en-IN')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {allModules.map((m) => (
                <TableRow key={m.key}>
                  <TableCell>{m.name}</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-center">
                      {p.modules.some((x) => x.key === m.key) ? <Check className="mx-auto h-4 w-4 text-success" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      {faq ? <FaqSection section={faq} /> : null}
    </>
  );
}
