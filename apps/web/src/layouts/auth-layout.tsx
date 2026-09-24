import { Outlet } from 'react-router-dom';
import { Brand } from '@/layouts/public-layout';
import { usePublicSettings } from '@/hooks/use-public';
import { ThemeToggle } from '@/components/common/theme-toggle';

export function AuthLayout() {
  const settings = usePublicSettings();
  const tagline = settings.data?.['brand.tagline'];
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Brand settings={settings.data} className="text-white" />
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight text-white">{tagline ?? 'The configurable operating system for housing societies'}</h2>
          <p className="max-w-md text-sm text-sidebar-foreground/80">Billing, payments, accounting, visitors, complaints, amenities and governance, configured by your committee without a developer.</p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">{settings.data?.['landing.footer']?.legal}</p>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <div className="lg:hidden">
            <Brand settings={settings.data} />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
