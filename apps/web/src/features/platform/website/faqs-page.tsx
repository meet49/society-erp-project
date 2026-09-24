import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PageSkeleton } from '@/components/common/loading-state';
import { EmptyState } from '@/components/common/empty-state';
import { useLandingSections } from '@/hooks/use-platform';
import { SectionEditor } from '@/features/platform/website/section-editor';

/** Dedicated editor for the FAQ section (same draft/publish workflow as the landing editor). */
export default function FaqsPage() {
  const sections = useLandingSections('home');
  if (sections.isLoading) return <PageSkeleton />;
  const faq = (sections.data ?? []).find((s: any) => s.type === 'FAQ');
  return (
    <div>
      <PageHeader title="FAQs" description="Questions and answers shown on the landing and pricing pages." />
      {faq ? (
        <Card>
          <CardContent className="p-5">
            <SectionEditor key={faq.id + String(faq.updatedAt)} section={faq} />
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="No FAQ section" description="Add a FAQ section from the landing page editor first." />
      )}
    </div>
  );
}
