import { Link } from 'react-router-dom';
import { ClipboardList, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useCommunityRealtime, useSurveys } from '@/hooks/use-community';
import { formatDateTime, formatRelative } from '@/lib/utils';

/** Resident view: surveys I can answer (or already did). */
export default function MySurveysPage() {
  const surveys = useSurveys({ limit: 50 });
  useCommunityRealtime();
  const items: any[] = surveys.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Surveys" description="Share feedback to help the committee decide." />
      {surveys.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<ClipboardList />} title="No surveys" description="Surveys from the committee appear here when they open." /> : (
        <div className="mx-auto max-w-3xl space-y-2">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <Link to={`/app/my/surveys/${s.id}`} className="block">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{s.title} <StatusBadge status={s.status} />{s.myResponse ? <Badge variant="success"><CheckCheck className="mr-1 h-3 w-3" />Responded</Badge> : s.isOpen ? <Badge variant="info">Open</Badge> : null}</p>
                  <p className="text-xs text-muted-foreground">{s.description ? `${s.description} · ` : ''}{s.endAt ? `${s.status === 'CLOSED' ? 'Closed' : 'Closes'} ${formatRelative(s.endAt)} (${formatDateTime(s.endAt)})` : 'No closing date'}</p>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
