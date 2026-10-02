import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Check, ChevronDown, LayoutDashboard, QrCode, Quote, Receipt, Settings, ShieldCheck, Sparkles, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicIcon } from '@/components/common/icon';
import { UserAvatar } from '@/components/ui/avatar';
import { Reveal, useCountUp, useReveal } from '@/hooks/use-reveal';
import { useT } from '@/lib/i18n';
import { formatCurrency, cn } from '@/lib/utils';
import type { PublicLanding, PublicPlan, PublicSection } from '@/hooks/use-public';

/*
 * Every section renders what the CMS stores (title, subtitle, items, CTAs…) in the visitor's
 * language; the only strings written here are UI chrome, which come from the i18n dictionaries.
 * Decoration (aurora, skyline, dashboard mockup) is illustration, not content.
 */

function CtaLinks({ cta, size = 'lg', tone = 'default', className }: { cta: PublicSection['cta']; size?: 'lg' | 'default'; tone?: 'default' | 'inverse'; className?: string }) {
  if (!cta?.label && !cta?.secondaryLabel) return null;
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {cta.label ? (
        <Button asChild size={size} className={cn('group shadow-lg shadow-primary/25', tone === 'inverse' && 'bg-white text-primary shadow-black/10 hover:bg-white/90')}>
          <Link to={cta.href || '/signup'}>
            {cta.label}
            <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Button>
      ) : null}
      {cta.secondaryLabel ? (
        <Button asChild size={size} variant="outline" className={cn('bg-background/60 backdrop-blur', tone === 'inverse' && 'border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white')}>
          <Link to={cta.secondaryHref || '/contact'}>{cta.secondaryLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function SectionHeading({ title, subtitle, description, align = 'center', tone = 'default' }: { title?: string; subtitle?: string; description?: string; align?: 'center' | 'left'; tone?: 'default' | 'inverse' }) {
  if (!title && !subtitle) return null;
  return (
    <Reveal className={cn('mb-12 max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <span className={cn('mb-5 block h-1 w-12 rounded-full bg-gradient-to-r from-primary to-sky-400', align === 'center' && 'mx-auto')} aria-hidden />
      {title ? <h2 className={cn('display text-3xl font-semibold sm:text-4xl', tone === 'inverse' && 'text-white')}>{title}</h2> : null}
      {subtitle ? <p className={cn('mt-4 text-lg', tone === 'inverse' ? 'text-white/70' : 'text-muted-foreground')}>{subtitle}</p> : null}
      {description ? <p className={cn('mt-2 text-sm', tone === 'inverse' ? 'text-white/60' : 'text-muted-foreground')}>{description}</p> : null}
    </Reveal>
  );
}

// ------------------------------------------------------------------------------------------ hero

function Stat({ label, value, active }: { label: string; value: string; active: boolean }) {
  const shown = useCountUp(value, active);
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-shine text-3xl font-semibold tabular sm:text-4xl">{shown}</dd>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
    </div>
  );
}

/** A society dashboard drawn in DOM, so it follows the theme and language instead of being a screenshot. */
function HeroMockup() {
  const { t } = useT();
  const bars = [42, 55, 48, 66, 72, 81, 94];
  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto w-full max-w-[600px] lg:max-w-none">
      <div className="animate-pop overflow-hidden rounded-2xl border bg-card/90 shadow-2xl shadow-primary/15 backdrop-blur [animation-delay:150ms]">
        <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate text-xs font-medium text-muted-foreground">{t('hero.mock.title')}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-success">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            {t('hero.mock.month')}
          </span>
        </div>
        <div className="grid grid-cols-[48px_1fr]">
          <div className="flex flex-col items-center gap-3 border-r bg-muted/30 py-4">
            {[LayoutDashboard, Receipt, Wallet, Users, Bell, Settings].map((Icon, i) => (
              <span key={i} className={cn('flex h-8 w-8 items-center justify-center rounded-lg', i === 0 ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" />
              </span>
            ))}
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 flex items-center gap-3 rounded-xl bg-gradient-to-br from-primary to-[hsl(260_70%_55%)] p-3 text-white sm:col-span-1 sm:flex-col sm:items-start">
                <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0 -rotate-90" aria-hidden>
                  <circle cx="24" cy="24" r={r} className="stroke-white/25" strokeWidth="5" fill="none" />
                  <circle cx="24" cy="24" r={r} className="ring-draw stroke-white" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - 0.94)} style={{ '--circ': circ } as React.CSSProperties} />
                </svg>
                <div>
                  <p className="text-[11px] text-white/80">{t('hero.mock.collections')}</p>
                  <p className="text-lg font-semibold tabular">94%</p>
                </div>
              </div>
              <Kpi label={t('hero.mock.openTickets')} value="6" />
              <Kpi label={t('hero.mock.visitors')} value="42" />
              <Kpi label={t('hero.mock.dues')} value="₹1.2L" />
            </div>
            <div className="rounded-xl border p-3">
              <p className="mb-3 text-xs text-muted-foreground">{t('hero.mock.trend')}</p>
              <div className="flex h-24 items-end gap-2">
                {bars.map((h, i) => (
                  <span key={i} className={cn('bar-grow flex-1 rounded-t-md', i === bars.length - 1 ? 'bg-primary' : 'bg-primary/25')} style={{ height: `${h}%`, animationDelay: `${300 + i * 90}ms` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="animate-float absolute -right-3 -top-6 hidden w-60 rounded-xl border bg-card p-3 shadow-xl shadow-black/10 sm:block lg:-right-8" style={{ animationDelay: '0.8s' }}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t('hero.mock.paymentReceived')}</p>
            <p className="truncate text-xs text-muted-foreground">{t('hero.mock.paymentDetail')}</p>
          </div>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{t('hero.mock.justNow')}</span>
        </div>
      </div>
      <div className="animate-float absolute -bottom-6 -left-3 hidden w-60 rounded-xl border bg-card p-3 shadow-xl shadow-black/10 sm:block lg:-left-8">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <QrCode className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t('hero.mock.visitorApproved')}</p>
            <p className="truncate text-xs text-muted-foreground">{t('hero.mock.visitorDetail')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** [x, height, width] of each silhouette block; a low-contrast skyline anchoring the hero to its subject. */
const BUILDINGS: [number, number, number][] = [
  [0, 54, 58], [64, 96, 46], [116, 70, 60], [182, 128, 44], [232, 84, 64], [302, 150, 50], [358, 66, 56], [420, 112, 48], [474, 58, 66], [546, 140, 44], [596, 92, 60], [662, 74, 50],
  [718, 124, 46], [770, 86, 62], [838, 150, 44], [888, 104, 56], [950, 62, 60], [1016, 116, 46], [1068, 80, 58], [1132, 96, 68],
];

function Skyline() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full text-primary sm:h-28" viewBox="0 0 1200 150" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {BUILDINGS.map(([x, h, w], i) => (
        <g key={i} className="fill-current" opacity={0.05 + (i % 3) * 0.025}>
          <rect x={x} y={150 - h} width={w} height={h} rx="2" />
          {h > 90 ? <rect x={x + w / 2 - 6} y={150 - h - 10} width="12" height="10" rx="1" /> : null}
        </g>
      ))}
      <rect x="0" y="149" width="1200" height="1" className="fill-current" opacity="0.15" />
    </svg>
  );
}

function ModuleMarquee({ modules }: { modules: PublicLanding['modules'] }) {
  const { t } = useT();
  const items = [...modules, ...modules]; // two copies so the loop is seamless at -50%
  return (
    <div className="container relative z-10 pb-14 sm:pb-20">
      <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t('marquee.label')}</p>
      <div className="marquee-mask overflow-hidden">
        <ul className="animate-marquee flex w-max gap-3" style={{ '--marquee-duration': `${Math.max(30, modules.length * 3)}s` } as React.CSSProperties} aria-hidden>
          {items.map((m, i) => (
            <li key={`${m.key}-${i}`} className="flex items-center gap-2 whitespace-nowrap rounded-full border bg-background/70 px-3.5 py-1.5 text-sm backdrop-blur">
              <DynamicIcon name={m.icon} className="h-4 w-4 text-primary" />
              {m.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function HeroSection({ section, landing }: { section: PublicSection; landing?: PublicLanding }) {
  const badges: string[] = section.content?.badges ?? [];
  const stats: { label: string; value: string }[] = section.content?.stats ?? [];
  const { ref, revealed } = useReveal<HTMLDListElement>();
  return (
    <section id={section.key} className="relative overflow-hidden border-b">
      <div className="aurora" aria-hidden>
        <i />
      </div>
      <div className="grid-dots absolute inset-0" aria-hidden />
      <div className="container relative z-10 grid items-center gap-14 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24 lg:pt-24">
        <div className="space-y-7">
          {badges.length ? (
            <Reveal className="flex flex-wrap gap-2">
              {badges.map((b, i) => (
                <span key={b} className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                  {i === 0 ? <Sparkles className="h-3.5 w-3.5 text-primary" /> : <Check className="h-3.5 w-3.5 text-success" />}
                  {b}
                </span>
              ))}
            </Reveal>
          ) : null}
          <Reveal delay={80}>
            <h1 className="display text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">{section.title}</h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">{section.subtitle}</p>
          </Reveal>
          {section.description ? (
            <Reveal delay={220}>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground/90">{section.description}</p>
            </Reveal>
          ) : null}
          <Reveal delay={280}>
            <CtaLinks cta={section.cta} />
          </Reveal>
          {stats.length ? (
            <dl ref={ref} className="reveal grid grid-cols-3 gap-6 border-t pt-6" data-revealed={revealed ? '' : undefined} style={{ transitionDelay: '340ms' }}>
              {stats.map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} active={revealed} />
              ))}
            </dl>
          ) : null}
        </div>
        <div className="relative lg:pl-6">{section.image ? <img src={section.image} alt="" className="animate-pop w-full rounded-2xl border shadow-2xl shadow-primary/15" /> : <HeroMockup />}</div>
      </div>
      {landing?.modules?.length ? <ModuleMarquee modules={landing.modules} /> : null}
      <Skyline />
    </section>
  );
}

// ------------------------------------------------------------------------------------------ cards

export function ItemsGridSection({ section, columns = 3 }: { section: PublicSection; columns?: 2 | 3 | 4 }) {
  const items: { icon?: string; title: string; description?: string }[] = section.content?.items ?? [];
  return (
    <section id={section.key} className="container py-20 sm:py-24">
      <SectionHeading title={section.title} subtitle={section.subtitle} description={section.description} />
      <div className={cn('grid gap-5', { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns])}>
        {items.map((it, i) => (
          <Reveal key={it.title ?? i} delay={i * 70}>
            <div className="card-hover group h-full rounded-2xl border bg-card p-6">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-sky-400/15 text-primary ring-1 ring-primary/15 transition-all duration-300 group-hover:from-primary group-hover:to-sky-500 group-hover:text-white group-hover:ring-transparent">
                <DynamicIcon name={it.icon} className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold">{it.title}</h3>
              {it.description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.description}</p> : null}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function SecuritySection({ section }: { section: PublicSection }) {
  const items: { icon?: string; title: string; description?: string }[] = section.content?.items ?? [];
  return (
    <section id={section.key} className="relative overflow-hidden bg-sidebar py-20 text-sidebar-foreground sm:py-24">
      <div className="grid-lines absolute inset-0" aria-hidden />
      <div className="absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/30 blur-[110px]" aria-hidden />
      <ShieldCheck className="absolute -right-12 -top-8 h-80 w-80 text-white/[0.04]" strokeWidth={1} aria-hidden />
      <div className="container relative">
        <SectionHeading title={section.title} subtitle={section.subtitle} tone="inverse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <Reveal key={it.title ?? i} delay={i * 70}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-colors duration-300 hover:border-primary/60 hover:bg-white/[0.08]">
                <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <DynamicIcon name={it.icon} className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-white">{it.title}</h3>
                {it.description ? <p className="mt-2 text-sm leading-relaxed text-white/65">{it.description}</p> : null}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ModulesSection({ section, modules }: { section: PublicSection; modules: PublicLanding['modules'] }) {
  const highlight: string[] = section.content?.highlight ?? [];
  const list = section.content?.showFromCatalog ? modules.filter((m) => (highlight.length ? highlight.includes(m.key) : true)) : (section.content?.items ?? []);
  return (
    <section id={section.key} className="border-y bg-muted/30 py-20 sm:py-24">
      <div className="container">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((m: any, i: number) => (
            <Reveal key={m.key ?? m.title} delay={i * 40}>
              <div className="card-hover flex h-full items-start gap-3 rounded-xl border bg-card p-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DynamicIcon name={m.icon} className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{m.name ?? m.title}</p>
                  {m.description ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{m.description}</p> : null}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StepsSection({ section }: { section: PublicSection }) {
  const { t } = useT();
  const steps: { step: number; title: string; description: string }[] = section.content?.steps ?? [];
  return (
    <section id={section.key} className="container py-20 sm:py-24">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
        {steps.length > 1 ? <div className="absolute left-[16.6%] right-[16.6%] top-7 hidden border-t-2 border-dashed border-primary/30 md:block" aria-hidden /> : null}
        {steps.map((s, i) => (
          <Reveal as="li" key={s.step} delay={i * 120} className="relative text-center">
            <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-sky-500 text-xl font-semibold text-white shadow-lg shadow-primary/30 ring-8 ring-background">{s.step}</div>
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{t('steps.step', { n: s.step })}</p>
            <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{s.description}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------------------------------ pricing

export function PlanCard({ plan, annual, currencySymbol, discountLabel, cta }: { plan: PublicPlan; annual: boolean; currencySymbol?: string; discountLabel?: string; cta?: { label?: string; href?: string } }) {
  const { t } = useT();
  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  const perMonth = annual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
  const fmt = (n: number) => (currencySymbol ? `${currencySymbol}${n.toLocaleString('en-IN')}` : formatCurrency(n, plan.currency));
  const isSales = plan.ctaLabel?.toLowerCase().includes('sales');
  return (
    <div className={cn('card-hover relative flex h-full flex-col rounded-2xl border bg-card p-6', plan.highlighted && 'gradient-border border-transparent shadow-xl shadow-primary/15 lg:-my-3 lg:py-9')}>
      {plan.badge ? <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-sky-500 shadow">{plan.badge}</Badge> : null}
      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-1 min-h-[40px] text-sm text-muted-foreground">{plan.description}</p>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tabular tracking-tight">{fmt(perMonth)}</span>
        <span className="text-sm text-muted-foreground">{t('pricing.perMonth')}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{annual ? `${t('pricing.billedYearly', { price: fmt(price) })}${discountLabel ? ` · ${discountLabel}` : ''}` : t('pricing.billedMonthly')}</p>
      {plan.trialDays > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success">
          <Sparkles className="h-3.5 w-3.5" />
          {t('pricing.trial', { days: plan.trialDays })}
        </p>
      ) : null}
      <ul className="mt-6 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f.key} className={cn('flex items-start gap-2.5', !f.included && 'text-muted-foreground line-through')}>
            <span className={cn('mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full', f.included ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
              <Check className="h-3 w-3" />
            </span>
            <span>{f.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8 pt-2">
        <Button asChild className={cn('w-full', plan.highlighted && 'shadow-lg shadow-primary/25')} size="lg" variant={plan.highlighted ? 'default' : 'outline'}>
          <Link to={isSales ? '/contact?type=SALES&plan=' + plan.slug : `${cta?.href ?? '/signup'}?plan=${plan.slug}&cycle=${annual ? 'ANNUAL' : 'MONTHLY'}`}>{plan.ctaLabel || cta?.label || t('pricing.startTrial')}</Link>
        </Button>
      </div>
    </div>
  );
}

export function PricingSection({ section, plans, settings }: { section?: PublicSection; plans: PublicPlan[]; settings: Record<string, any> }) {
  const { t } = useT();
  const [annual, setAnnual] = React.useState(true);
  const pricing = settings['landing.pricing'] ?? {};
  const showToggle = section?.content?.showToggle ?? true;
  return (
    <section id={section?.key ?? 'pricing'} className="container py-20 sm:py-24">
      <SectionHeading title={section?.title ?? t('nav.pricing')} subtitle={section?.subtitle} />
      {showToggle ? (
        <Reveal className="mb-12 flex justify-center">
          <div className="relative grid grid-cols-2 rounded-full border bg-muted/60 p-1 text-sm font-medium" role="tablist">
            <span className={cn('absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow transition-transform duration-300 ease-out', annual && 'translate-x-full')} aria-hidden />
            <button type="button" role="tab" aria-selected={!annual} className={cn('relative z-10 rounded-full px-5 py-1.5 transition-colors', annual && 'text-muted-foreground')} onClick={() => setAnnual(false)}>
              {t('pricing.monthly')}
            </button>
            <button type="button" role="tab" aria-selected={annual} className={cn('relative z-10 flex items-center justify-center gap-1.5 rounded-full px-5 py-1.5 transition-colors', !annual && 'text-muted-foreground')} onClick={() => setAnnual(true)}>
              {t('pricing.annual')}
              {pricing.showAnnualDiscount && pricing.annualDiscountLabel ? <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">{pricing.annualDiscountLabel}</span> : null}
            </button>
          </div>
        </Reveal>
      ) : null}
      <div className={cn('mx-auto grid max-w-5xl items-stretch gap-6', plans.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
        {plans.map((p, i) => (
          <Reveal key={p.id} delay={i * 90} className="h-full">
            <PlanCard plan={p} annual={annual} currencySymbol={pricing.currencySymbol} discountLabel={pricing.showAnnualDiscount ? pricing.annualDiscountLabel : undefined} cta={settings['landing.cta'] ? { label: settings['landing.cta'].primaryLabel, href: settings['landing.cta'].primaryHref } : undefined} />
          </Reveal>
        ))}
      </div>
      {pricing.note ? <p className="mt-8 text-center text-xs text-muted-foreground">{pricing.note}</p> : null}
    </section>
  );
}

// ------------------------------------------------------------------------------------------ social proof, faq, cta

export function TestimonialsSection({ section }: { section: PublicSection }) {
  const items: { name: string; role?: string; quote: string; avatar?: string }[] = section.content?.items ?? [];
  if (!items.length) return null;
  return (
    <section id={section.key} className="border-y bg-muted/30 py-20 sm:py-24">
      <div className="container">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <div className="grid gap-5 md:grid-cols-3">
          {items.map((item, i) => (
            <Reveal key={item.name} delay={i * 90}>
              <figure className="card-hover relative flex h-full flex-col rounded-2xl border bg-card p-6">
                <Quote className="absolute right-5 top-5 h-9 w-9 text-primary/15" aria-hidden />
                <blockquote className="flex-1 text-[15px] leading-relaxed">“{item.quote}”</blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t pt-4">
                  <UserAvatar name={item.name} src={item.avatar} />
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    {item.role ? <p className="text-xs text-muted-foreground">{item.role}</p> : null}
                  </div>
                </figcaption>
              </figure>
            </Reveal>
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
    <section id={section.key} className="container py-20 sm:py-24">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <Reveal className="mx-auto max-w-3xl divide-y overflow-hidden rounded-2xl border bg-card">
        {items.map((f, i) => {
          const isOpen = open === i;
          const id = `faq-${section.key}-${i}`;
          return (
            <div key={f.question}>
              <button type="button" id={`${id}-btn`} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-medium transition-colors hover:bg-muted/40" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} aria-controls={id}>
                {f.question}
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300', isOpen && 'rotate-180 border-primary bg-primary text-primary-foreground')}>
                  <ChevronDown className="h-4 w-4" />
                </span>
              </button>
              <div id={id} role="region" aria-labelledby={`${id}-btn`} aria-hidden={!isOpen} className="faq-panel" data-open={isOpen ? '' : undefined}>
                <div>
                  <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
                </div>
              </div>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}

export function CtaSection({ section }: { section: PublicSection }) {
  return (
    <section id={section.key} className="container py-20 sm:py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[hsl(260_70%_55%)] to-[hsl(199_89%_50%)] px-6 py-16 text-center text-white shadow-2xl shadow-primary/30 sm:px-12 sm:py-20">
          <div className="grid-lines absolute inset-0" aria-hidden />
          <div className="animate-float absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" aria-hidden />
          <div className="animate-float absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" style={{ animationDelay: '2s' }} aria-hidden />
          <h2 className="display relative text-3xl font-semibold sm:text-4xl lg:text-5xl">{section.title}</h2>
          {section.subtitle ? <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/80">{section.subtitle}</p> : null}
          <div className="relative mt-9 flex justify-center">
            <CtaLinks cta={section.cta} tone="inverse" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function CustomSection({ section }: { section: PublicSection }) {
  const items: any[] = section.content?.items ?? [];
  return (
    <section id={section.key} className="container py-20 sm:py-24">
      <SectionHeading title={section.title} subtitle={section.subtitle} description={section.description} />
      {section.image ? (
        <Reveal>
          <img src={section.image} alt="" className="mx-auto max-w-3xl rounded-2xl border shadow-lg" />
        </Reveal>
      ) : null}
      {items.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="card-hover h-full rounded-2xl border bg-card p-6">
                {it.icon ? <DynamicIcon name={it.icon} className="mb-3 h-5 w-5 text-primary" /> : null}
                <p className="font-semibold">{it.title ?? it.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{it.description ?? it.quote ?? it.answer}</p>
              </div>
            </Reveal>
          ))}
        </div>
      ) : null}
      <div className="mt-8 flex justify-center">
        <CtaLinks cta={section.cta} size="default" />
      </div>
    </section>
  );
}

export function RenderSection({ section, landing }: { section: PublicSection; landing: PublicLanding }) {
  switch (section.type) {
    case 'HERO':
      return <HeroSection section={section} landing={landing} />;
    case 'VALUE_PROPOSITION':
      return <ItemsGridSection section={section} columns={4} />;
    case 'FEATURES':
      return <ItemsGridSection section={section} columns={3} />;
    case 'SECURITY':
      return <SecuritySection section={section} />;
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
