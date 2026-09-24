import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { usePublicSettings } from '@/hooks/use-public';
import { useAuth } from '@/hooks/use-auth';
import { landingPath } from '@/hooks/use-access';
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

const links = [
  { to: '/#features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/#security', label: 'Security' },
  { to: '/contact', label: 'Contact' },
];

export function PublicLayout() {
  const settings = usePublicSettings();
  const { context, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const cta = settings.data?.['landing.cta'] ?? {};
  const appLink = isAuthenticated ? landingPath(context?.landing, Boolean(context?.society), Boolean(context?.user.isPlatformAdmin)) : '/login';
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Brand settings={settings.data} />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('text-muted-foreground transition-colors hover:text-foreground', isActive && !l.to.includes('#') && 'text-foreground')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <Button asChild variant="ghost">
              <Link to={appLink}>{isAuthenticated ? 'Open app' : 'Login'}</Link>
            </Button>
            <Button asChild>
              <Link to={cta.primaryHref ?? '/signup'}>{cta.primaryLabel ?? 'Start free trial'}</Link>
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-72">
            <SheetTitle>Menu</SheetTitle>
            <nav className="mt-6 flex flex-col gap-3 text-base">
              {links.map((l) => (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              ))}
              <Link to={appLink} onClick={() => setOpen(false)}>
                {isAuthenticated ? 'Open app' : 'Login'}
              </Link>
              <Button asChild className="mt-2">
                <Link to={cta.primaryHref ?? '/signup'} onClick={() => setOpen(false)}>
                  {cta.primaryLabel ?? 'Start free trial'}
                </Link>
              </Button>
              <div className="pt-2">
                <ThemeToggle />
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter settings={settings.data} />
    </div>
  );
}

export function PublicFooter({ settings }: { settings?: Record<string, any> }) {
  const footer = settings?.['landing.footer'] ?? {};
  const contact = settings?.['landing.contact'] ?? {};
  const social = settings?.['landing.social'] ?? {};
  const socials = Object.entries(social).filter(([, v]) => v);
  return (
    <footer className="border-t bg-muted/30">
      <div className="container grid gap-8 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <Brand settings={settings} />
          <p className="text-sm text-muted-foreground">{footer.text}</p>
          {contact.email ? (
            <p className="text-sm text-muted-foreground">
              <a href={`mailto:${contact.email}`} className="hover:text-foreground">
                {contact.email}
              </a>
              {contact.phone ? <> · {contact.phone}</> : null}
            </p>
          ) : null}
          {socials.length ? (
            <div className="flex gap-3 text-sm">
              {socials.map(([k, v]) => (
                <a key={k} href={String(v)} target="_blank" rel="noreferrer" className="capitalize text-muted-foreground hover:text-foreground">
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
                  <Link to={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container py-4 text-xs text-muted-foreground">{footer.legal}</div>
      </div>
    </footer>
  );
}
