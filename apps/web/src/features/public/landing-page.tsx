import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePublicLanding } from '@/hooks/use-public';
import { RenderSection } from '@/features/public/sections';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/common/error-state';

export default function LandingPage() {
  const landing = usePublicLanding('home');
  const location = useLocation();

  useEffect(() => {
    const seo = landing.data?.settings?.['landing.seo'];
    if (seo?.title) document.title = seo.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && seo?.description) meta.setAttribute('content', seo.description);
  }, [landing.data]);

  useEffect(() => {
    if (location.hash && landing.data) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash, landing.data]);

  if (landing.isLoading) {
    return (
      <div className="container space-y-6 py-16">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
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
    <>
      {landing.data.sections.map((s) => (
        <RenderSection key={s.id} section={s} landing={landing.data!} />
      ))}
    </>
  );
}
