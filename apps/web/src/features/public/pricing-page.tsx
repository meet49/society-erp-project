import { usePublicLanding } from '@/hooks/use-public';
import { PricingSection, FaqSection } from '@/features/public/sections';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/error-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Reveal } from '@/hooks/use-reveal';
import { useUiStore } from '@/stores/ui.store';
import { useT, type MessageKey } from '@/lib/i18n';
import { Check, Minus } from 'lucide-react';

const LIMIT_KEYS: Record<string, MessageKey> = { maxUnits: 'pricing.limit.maxUnits', maxResidents: 'pricing.limit.maxResidents', maxUsers: 'pricing.limit.maxUsers', maxStaff: 'pricing.limit.maxStaff', maxVehicles: 'pricing.limit.maxVehicles', maxDocuments: 'pricing.limit.maxDocuments', maxAdmins: 'pricing.limit.maxAdmins', maxStorageMb: 'pricing.limit.maxStorageMb' };

export default function PricingPage() {
  const locale = useUiStore((s) => s.locale);
  const landing = usePublicLanding('home', locale);
  const { t } = useT();
  if (landing.isLoading) {
    return (
      <div className="container grid gap-6 py-16 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-96 rounded-2xl" />
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
    <div lang={landing.data.locale}>
      <PricingSection section={pricingSection ? { ...pricingSection, title: pricingSection.title || t('nav.pricing') } : undefined} plans={plans} settings={settings} />
      <section className="container pb-20">
        <Reveal>
          <h2 className="display mb-8 text-center text-2xl font-semibold sm:text-3xl">{t('pricing.compare')}</h2>
          <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pricing.included')}</TableHead>
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
                    <TableCell className="font-medium">{LIMIT_KEYS[k] ? t(LIMIT_KEYS[k]) : k}</TableCell>
                    {plans.map((p) => (
                      <TableCell key={p.id} className="text-center tabular">
                        {p.limits?.[k] == null ? t('pricing.unlimited') : p.limits[k]!.toLocaleString('en-IN')}
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
        </Reveal>
      </section>
      {faq ? <FaqSection section={faq} /> : null}
    </div>
  );
}
