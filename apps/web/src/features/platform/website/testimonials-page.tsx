import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PageSkeleton } from '@/components/common/loading-state';
import { EmptyState } from '@/components/common/empty-state';
import { useLandingSections } from '@/hooks/use-platform';
import { SectionEditor } from '@/features/platform/website/section-editor';

export default function TestimonialsPage() {
  const sections = useLandingSections('home');
  if (sections.isLoading) return <PageSkeleton />;
  const section = (sections.data ?? []).find((s: any) => s.type === 'TESTIMONIALS');
  return (
    <div>
      <PageHeader title="Testimonials" description="Customer quotes shown on the landing page." />
      {section ? (
        <Card>
          <CardContent className="p-5">
            <SectionEditor key={section.id + String(section.updatedAt)} section={section} />
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="No testimonials section" description="Add a Testimonials section from the landing page editor first." />
      )}
    </div>
  );
}
