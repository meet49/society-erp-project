import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowRight, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { usePublicLanding, usePublicSettings } from '@/hooks/use-public';
import { useAuth } from '@/hooks/use-auth';
import { landingPath } from '@/hooks/use-access';
import { useUiStore } from '@/stores/ui.store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function Brand({ settings, className }: { settings?: Record<string, any>; className?: string }) {
  const name = settings?.['brand.name'] ?? 'Society ERP';
  const logo = settings?.['brand.logoUrl'];
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-semibold', className)}>
      {logo ? <img src={logo} alt={name} className="h-8 w-8 rounded-md object-contain" /> : <img src="/favicon.svg" alt="" className="h-8 w-8" />}
      <span>{name}</span>
    </Link>
  );
}

export function PublicLayout() {
  const settings = usePublicSettings();
  const locale = useUiStore((s) => s.locale);
  // Same query the landing page uses, so this is served from the cache; it gives the header the
  // hero's CTA in the visitor's language and the list of enabled languages.
  const landing = usePublicLanding('home', locale);
  const { context, isAuthenticated } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const globalCta = settings.data?.['landing.cta'] ?? {};
  const heroCta = landing.data?.sections.find((s) => s.type === 'HERO')?.cta;
  const ctaLabel = heroCta?.label || globalCta.primaryLabel || t('pricing.startTrial');
  const ctaHref = heroCta?.href || globalCta.primaryHref || '/signup';
  const enabledLocales: string[] | undefined = landing.data?.locales?.enabled ?? settings.data?.['landing.locales']?.enabled;
  const appLink = isAuthenticated ? landingPath(context?.landing, Boolean(context?.society), Boolean(context?.user.isPlatformAdmin)) : '/login';
  const links = [
    { to: '/#features', label: t('nav.features') },
    { to: '/pricing', label: t('nav.pricing') },
    { to: '/#security', label: t('nav.security') },
    { to: '/contact', label: t('nav.contact') },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className={cn('sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300', scrolled ? 'border-border bg-background/85 shadow-sm backdrop-blur-md' : 'border-transparent bg-transparent')}>
        <div className="container flex h-16 items-center justify-between gap-4">
          <Brand settings={settings.data} />
          <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', isActive && !l.to.includes('#') && 'bg-muted text-foreground')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-1.5 md:flex">
            <LanguageSwitcher enabled={enabledLocales} />
            <ThemeToggle />
            <Button asChild variant="ghost">
              <Link to={appLink}>{isAuthenticated ? t('nav.openApp') : t('nav.login')}</Link>
            </Button>
            <Button asChild className="group shadow-lg shadow-primary/25">
              <Link to={ctaHref}>
                {ctaLabel}
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-1 md:hidden">
            <LanguageSwitcher enabled={enabledLocales} />
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t('nav.menu')}>
              <Menu />
            </Button>
          </div>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-80">
            <SheetTitle>{t('nav.menu')}</SheetTitle>
            <nav className="mt-6 flex flex-col gap-1 text-base">
              {links.map((l) => (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 hover:bg-muted">
                  {l.label}
                </Link>
              ))}
              <Link to={appLink} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 hover:bg-muted">
                {isAuthenticated ? t('nav.openApp') : t('nav.login')}
              </Link>
              <Button asChild className="mt-3" size="lg">
                <Link to={ctaHref} onClick={() => setOpen(false)}>
                  {ctaLabel}
                  <ArrowRight />
                </Link>
              </Button>
              <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
                <span>{t('nav.theme')}</span>
                <ThemeToggle />
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter settings={settings.data} enabledLocales={enabledLocales} />
    </div>
  );
}

export function PublicFooter({ settings, enabledLocales }: { settings?: Record<string, any>; enabledLocales?: string[] }) {
  const footer = settings?.['landing.footer'] ?? {};
  const contact = settings?.['landing.contact'] ?? {};
  const social = settings?.['landing.social'] ?? {};
  const socials = Object.entries(social).filter(([, v]) => v);
  return (
    <footer className="relative overflow-hidden border-t bg-muted/30">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden />
      <div className="container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Brand settings={settings} />
          {footer.text ? <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{footer.text}</p> : null}
          {contact.email || contact.phone ? (
            <p className="text-sm text-muted-foreground">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="hover:text-foreground">
                  {contact.email}
                </a>
              ) : null}
              {contact.email && contact.phone ? ' · ' : null}
              {contact.phone ? <span>{contact.phone}</span> : null}
            </p>
          ) : null}
          {socials.length ? (
            <div className="flex flex-wrap gap-2">
              {socials.map(([k, v]) => (
                <a key={k} href={String(v)} target="_blank" rel="noreferrer" className="rounded-full border bg-background px-3 py-1 text-xs capitalize text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  {k}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {(footer.columns ?? []).map((col: any) => (
          <div key={col.title}>
            <h4 className="mb-3 text-sm font-semibold">{col.title}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {(col.links ?? []).map((l: any) => (
                <li key={l.href + l.label}>
                  <Link to={l.href} className="transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container flex flex-col items-center justify-between gap-3 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>{footer.legal}</p>
          <LanguageSwitcher enabled={enabledLocales} variant="outline" />
        </div>
      </div>
    </footer>
  );
}
