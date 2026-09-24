import * as React from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/common/icon';
import { UserAvatar } from '@/components/ui/avatar';
import { formatCurrency, cn } from '@/lib/utils';
import type { PublicLanding, PublicPlan, PublicSection } from '@/hooks/use-public';

function CtaLinks({ cta, size = 'lg' }: { cta: PublicSection['cta']; size?: 'lg' | 'default' }) {
  if (!cta?.label && !cta?.secondaryLabel) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {cta.label ? (
        <Button asChild size={size}>
          <Link to={cta.href ?? '/signup'}>{cta.label}</Link>
        </Button>
      ) : null}
      {cta.secondaryLabel ? (
        <Button asChild size={size} variant="outline">
          <Link to={cta.secondaryHref ?? '/contact'}>{cta.secondaryLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function SectionHeading({ title, subtitle, description, align = 'center' }: { title?: string; subtitle?: string; description?: string; align?: 'center' | 'left' }) {
  if (!title && !subtitle) return null;
  return (
    <div className={cn('mb-10 max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {title ? <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2> : null}
      {subtitle ? <p className="mt-3 text-muted-foreground">{subtitle}</p> : null}
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function HeroSection({ section }: { section: PublicSection }) {
  const badges: string[] = section.content?.badges ?? [];
  const stats: { label: string; value: string }[] = section.content?.stats ?? [];
  return (
    <section id={section.key} className="border-b bg-gradient-to-b from-accent/40 to-background">
      <div className="container grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2">
        <div className="space-y-6">
          {badges.length ? (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <Badge key={b} variant="secondary">
                  {b}
                </Badge>
              ))}
            </div>
          ) : null}
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{section.title}</h1>
          <p className="max-w-xl text-lg text-muted-foreground">{section.subtitle}</p>
          {section.description ? <p className="max-w-xl text-sm text-muted-foreground">{section.description}</p> : null}
          <CtaLinks cta={section.cta} />
          {stats.length ? (
            <dl className="grid grid-cols-3 gap-4 pt-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</dt>
                  <dd className="text-2xl font-semibold">{s.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <div className="hidden lg:block">
          {section.image ? (
            <img src={section.image} alt="" className="w-full rounded-xl border shadow-lg" />
          ) : (
            <div className="rounded-xl border bg-card p-4 shadow-lg">
              <div className="grid grid-cols-2 gap-3">
                {['Collections 94%', 'Open tickets 6', 'Visitors today 42', 'Dues ₹1.2L'].map((t, i) => (
                  <div key={t} className={cn('rounded-lg p-4', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                    <p className="text-xs opacity-80">{t.split(' ').slice(0, -1).join(' ')}</p>
                    <p className="mt-1 text-xl font-semibold">{t.split(' ').slice(-1)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {[70, 55, 85].map((w) => (
                  <div key={w} className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary/70" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ItemsGridSection({ section, columns = 3 }: { section: PublicSection; columns?: 2 | 3 | 4 }) {
  const items: { icon?: string; title: string; description?: string }[] = section.content?.items ?? [];
  return (
    <section id={section.key} className="container py-16">
      <SectionHeading title={section.title} subtitle={section.subtitle} description={section.description} />
      <div className={cn('grid gap-4', { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns])}>
        {items.map((it) => (
          <Card key={it.title}>
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <DynamicIcon name={it.icon} className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{it.title}</h3>
              {it.description ? <p className="mt-1 text-sm text-muted-foreground">{it.description}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ModulesSection({ section, modules }: { section: PublicSection; modules: PublicLanding['modules'] }) {
  const highlight: string[] = section.content?.highlight ?? [];
  const list = section.content?.showFromCatalog ? modules.filter((m) => (highlight.length ? highlight.includes(m.key) : true)) : (section.content?.items ?? []);
  return (
    <section id={section.key} className="border-y bg-muted/30 py-16">
      <div className="container">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((m: any) => (
            <div key={m.key ?? m.title} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <DynamicIcon name={m.icon} className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">{m.name ?? m.title}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StepsSection({ section }: { section: PublicSection }) {
  const steps: { step: number; title: string; description: string }[] = section.content?.steps ?? [];
  return (
    <section id={section.key} className="container py-16">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.step} className="relative rounded-lg border bg-card p-6">
            <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{s.step}</span>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PlanCard({ plan, annual, currencySymbol, discountLabel, cta }: { plan: PublicPlan; annual: boolean; currencySymbol?: string; discountLabel?: string; cta?: { label?: string; href?: string } }) {
  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  const perMonth = annual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
  const isSales = plan.ctaLabel?.toLowerCase().includes('sales');
  return (
    <Card className={cn('relative flex flex-col', plan.highlighted && 'border-primary shadow-lg ring-1 ring-primary')}>
      {plan.badge ? <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">{plan.badge}</Badge> : null}
      <CardContent className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <p className="mt-1 min-h-[40px] text-sm text-muted-foreground">{plan.description}</p>
        <div className="mt-4">
          <span className="text-3xl font-semibold">{currencySymbol ? `${currencySymbol}${perMonth.toLocaleString('en-IN')}` : formatCurrency(perMonth, plan.currency)}</span>
          <span className="text-sm text-muted-foreground"> / month</span>
          {annual ? (
            <p className="text-xs text-muted-foreground">
              Billed {currencySymbol ? `${currencySymbol}${price.toLocaleString('en-IN')}` : formatCurrency(price, plan.currency)} yearly{discountLabel ? ` · ${discountLabel}` : ''}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Billed monthly</p>
          )}
        </div>
        {plan.trialDays > 0 ? <p className="mt-2 text-xs font-medium text-success">{plan.trialDays}-day free trial</p> : null}
        <ul className="mt-5 space-y-2 text-sm">
          {plan.features.map((f) => (
            <li key={f.key} className={cn('flex items-start gap-2', !f.included && 'text-muted-foreground line-through')}>
              <Check className={cn('mt-0.5 h-4 w-4 shrink-0', f.included ? 'text-success' : 'text-muted-foreground')} />
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-2">
          <Button asChild className="w-full" variant={plan.highlighted ? 'default' : 'outline'}>
            <Link to={isSales ? '/contact?type=SALES&plan=' + plan.slug : `${cta?.href ?? '/signup'}?plan=${plan.slug}&cycle=${annual ? 'ANNUAL' : 'MONTHLY'}`}>{plan.ctaLabel || cta?.label || 'Start free trial'}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PricingSection({ section, plans, settings }: { section?: PublicSection; plans: PublicPlan[]; settings: Record<string, any> }) {
  const [annual, setAnnual] = React.useState(true);
  const pricing = settings['landing.pricing'] ?? {};
  const showToggle = section?.content?.showToggle ?? true;
  return (
    <section id={section?.key ?? 'pricing'} className="container py-16">
      <SectionHeading title={section?.title ?? 'Pricing'} subtitle={section?.subtitle} />
      {showToggle ? (
        <div className="mb-8 flex items-center justify-center gap-3 text-sm">
          <button type="button" className={cn('rounded-full px-3 py-1', !annual && 'bg-primary text-primary-foreground')} onClick={() => setAnnual(false)}>
            Monthly
          </button>
          <button type="button" className={cn('rounded-full px-3 py-1', annual && 'bg-primary text-primary-foreground')} onClick={() => setAnnual(true)}>
            Annual{pricing.showAnnualDiscount && pricing.annualDiscountLabel ? <span className="ml-1 text-xs opacity-80">({pricing.annualDiscountLabel})</span> : null}
          </button>
        </div>
      ) : null}
      <div className={cn('grid gap-6', plans.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2', 'mx-auto max-w-5xl')}>
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} annual={annual} currencySymbol={pricing.currencySymbol} discountLabel={pricing.showAnnualDiscount ? pricing.annualDiscountLabel : undefined} cta={settings['landing.cta'] ? { label: settings['landing.cta'].primaryLabel, href: settings['landing.cta'].primaryHref } : undefined} />
        ))}
      </div>
      {pricing.note ? <p className="mt-6 text-center text-xs text-muted-foreground">{pricing.note}</p> : null}
    </section>
  );
}

export function TestimonialsSection({ section }: { section: PublicSection }) {
  const items: { name: string; role?: string; quote: string; avatar?: string }[] = section.content?.items ?? [];
  if (!items.length) return null;
  return (
    <section id={section.key} className="border-y bg-muted/30 py-16">
      <div className="container">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((t) => (
            <Card key={t.name}>
              <CardContent className="p-5">
                <p className="text-sm leading-relaxed">“{t.quote}”</p>
                <div className="mt-4 flex items-center gap-3">
                  <UserAvatar name={t.name} src={t.avatar} />
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection({ section }: { section: PublicSection }) {
  const items: { question: string; answer: string }[] = section.content?.items ?? [];
  const [open, setOpen] = React.useState<number | null>(0);
  if (!items.length) return null;
  return (
    <section id={section.key} className="container py-16">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="mx-auto max-w-3xl divide-y rounded-lg border">
        {items.map((f, i) => (
          <div key={f.question}>
            <button type="button" className="flex w-full items-center justify-between px-5 py-4 text-left font-medium" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {f.question}
              <ChevronDown className={cn('h-4 w-4 transition-transform', open === i && 'rotate-180')} />
            </button>
            {open === i ? <p className="px-5 pb-4 text-sm text-muted-foreground">{f.answer}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CtaSection({ section }: { section: PublicSection }) {
  return (
    <section id={section.key} className="container py-16">
      <div className="rounded-2xl bg-sidebar px-6 py-12 text-center text-white sm:px-12">
        <h2 className="text-2xl font-semibold sm:text-3xl">{section.title}</h2>
        {section.subtitle ? <p className="mx-auto mt-3 max-w-xl text-sidebar-foreground/80">{section.subtitle}</p> : null}
        <div className="mt-6 flex justify-center">
          <CtaLinks cta={section.cta} />
        </div>
      </div>
    </section>
  );
}

export function CustomSection({ section }: { section: PublicSection }) {
  const items: any[] = section.content?.items ?? [];
  return (
    <section id={section.key} className="container py-16">
      <SectionHeading title={section.title} subtitle={section.subtitle} description={section.description} />
      {section.image ? <img src={section.image} alt="" className="mx-auto max-w-3xl rounded-xl border" /> : null}
      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                {it.icon ? <DynamicIcon name={it.icon} className="mb-2 h-5 w-5 text-primary" /> : null}
                <p className="font-semibold">{it.title ?? it.name}</p>
                <p className="text-sm text-muted-foreground">{it.description ?? it.quote ?? it.answer}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="mt-6 flex justify-center">
        <CtaLinks cta={section.cta} size="default" />
      </div>
    </section>
  );
}

export function RenderSection({ section, landing }: { section: PublicSection; landing: PublicLanding }) {
  switch (section.type) {
    case 'HERO':
      return <HeroSection section={section} />;
    case 'VALUE_PROPOSITION':
      return <ItemsGridSection section={section} columns={4} />;
    case 'FEATURES':
      return <ItemsGridSection section={section} columns={3} />;
    case 'SECURITY':
      return <ItemsGridSection section={section} columns={4} />;
    case 'MODULES':
      return <ModulesSection section={section} modules={landing.modules} />;
    case 'HOW_IT_WORKS':
      return <StepsSection section={section} />;
    case 'PRICING':
      return <PricingSection section={section} plans={landing.plans} settings={landing.settings} />;
    case 'TESTIMONIALS':
      return <TestimonialsSection section={section} />;
    case 'FAQ':
      return <FaqSection section={section} />;
    case 'CTA':
      return <CtaSection section={section} />;
    case 'FOOTER':
      return null; // rendered by the layout from settings
    default:
      return <CustomSection section={section} />;
  }
}
