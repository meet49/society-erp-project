import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCheck, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAcknowledgeNotice, useNotice } from '@/hooks/use-community';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** One notice, opened by a resident (opening it counts as a read). */
export default function MyNoticePage() {
  const { id = '' } = useParams();
  const notice = useNotice(id);
  const ack = useAcknowledgeNotice();
  if (notice.isLoading) return <PageSkeleton />;
  if (notice.isError || !notice.data) return <ErrorState error={notice.error} onRetry={() => notice.refetch()} />;
  const n = notice.data;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={n.title} description={`${n.noticeNumber} · ${formatStatus(n.categoryKey)} · ${formatDateTime(n.publishedAt ?? n.createdAt)}${n.createdBy?.name ? ` · ${n.createdBy.name}` : ''}`} actions={<Button asChild variant="ghost"><Link to="/app/my/notices"><ArrowLeft /> All notices</Link></Button>} />
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="flex flex-wrap gap-2">{n.priority !== 'NORMAL' ? <Badge variant={n.priority === 'URGENT' ? 'destructive' : 'warning'}>{formatStatus(n.priority)}</Badge> : null}<Badge variant="outline">For {n.audienceLabel}</Badge>{n.expiresAt ? <Badge variant="muted">Until {formatDateTime(n.expiresAt)}</Badge> : null}</p>
          <div className="whitespace-pre-line text-sm leading-relaxed">{n.body}</div>
          {n.attachments?.length ? <ul className="space-y-1 text-sm">{n.attachments.map((a: any) => <li key={a.storageKey} className="flex items-center gap-2 text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> {a.name}</li>)}</ul> : null}
          {n.requiresAcknowledgement ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              {n.acknowledged ? <p className="flex items-center gap-2 text-success"><CheckCheck className="h-4 w-4" /> You acknowledged this notice.</p> : <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p>The society asks every recipient to confirm they have read this notice.</p><Button loading={ack.isPending} onClick={() => ack.mutate(n.id, { onSuccess: () => toast.success('Acknowledged'), onError: (e) => toast.error(getErrorMessage(e)) })}><CheckCheck /> I have read this</Button></div>}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
