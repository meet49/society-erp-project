import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePublicLanding } from '@/hooks/use-public';
import { RenderSection } from '@/features/public/sections';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/error-state';
import { useUiStore } from '@/stores/ui.store';

export default function LandingPage() {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const landing = usePublicLanding('home', locale);
  const location = useLocation();

  useEffect(() => {
    const seo = landing.data?.settings?.['landing.seo'];
    if (seo?.title) document.title = seo.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && seo?.description) meta.setAttribute('content', seo.description);
  }, [landing.data]);

  // The platform owner may have switched a language off since this visitor picked it. The API then
  // serves the default language; follow it so the switcher shows what is actually on screen.
  useEffect(() => {
    const data = landing.data;
    if (!data || landing.isPlaceholderData) return;
    if (data.locale !== locale && !data.locales.enabled.includes(locale)) setLocale(data.locale);
  }, [landing.data, landing.isPlaceholderData, locale, setLocale]);

  useEffect(() => {
    if (location.hash && landing.data) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, landing.data]);

  if (landing.isLoading) {
    return (
      <div className="container grid items-center gap-12 py-20 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="h-6 w-2/3" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-11 w-40" />
            <Skeleton className="h-11 w-36" />
          </div>
        </div>
        <Skeleton className="hidden h-80 rounded-2xl lg:block" />
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
  return (
    <div lang={landing.data.locale}>
      {landing.data.sections.map((s) => (
        <RenderSection key={s.id} section={s} landing={landing.data!} />
      ))}
    </div>
  );
}
