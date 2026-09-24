import * as React from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Pin, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { FilterBar, FilterSelect } from '@/components/common/search-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useCommunityRealtime, useNoticeCategories, useNotices } from '@/hooks/use-community';
import { cn, formatRelative, formatStatus } from '@/lib/utils';

/** Resident view: notices addressed to me, unread first. */
export default function MyNoticesPage() {
  const [category, setCategory] = React.useState('');
  const [unread, setUnread] = React.useState(false);
  const categories = useNoticeCategories();
  const notices = useNotices({ limit: 50, categoryKey: category || undefined, unreadOnly: unread ? 'true' : undefined });
  useCommunityRealtime();
  const items: any[] = notices.data?.items ?? [];
  return (
    <div>
      <PageHeader title="Notices" description="Circulars and announcements from your society." />
      <FilterBar onReset={() => { setCategory(''); setUnread(false); }}>
        <FilterSelect value={category} onChange={setCategory} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
        <label className="flex items-center gap-2 text-sm"><Switch checked={unread} onCheckedChange={setUnread} /> Unread only</label>
      </FilterBar>
      {notices.isLoading ? <CardSkeleton count={3} /> : !items.length ? <EmptyState icon={<Megaphone />} title="No notices" description="You're all caught up." /> : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card key={n.id} className={cn(!n.read && 'border-primary/50', n.priority === 'URGENT' && 'border-destructive/60')}>
              <CardContent className="p-4">
                <Link to={`/app/my/notices/${n.id}`} className="block">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{n.isPinned ? <Pin className="h-3.5 w-3.5 text-primary" /> : null}{n.title}{!n.read ? <Badge variant="info">New</Badge> : null}{n.priority !== 'NORMAL' ? <Badge variant={n.priority === 'URGENT' ? 'destructive' : 'warning'}>{formatStatus(n.priority)}</Badge> : null}{n.requiresAcknowledgement ? <Badge variant={n.acknowledged ? 'success' : 'outline'}><CheckCheck className="mr-1 h-3 w-3" />{n.acknowledged ? 'Acknowledged' : 'Acknowledgement needed'}</Badge> : null}</p>
                  <p className="text-xs text-muted-foreground">{formatStatus(n.categoryKey)} · {formatRelative(n.publishedAt)} · {n.createdBy?.name ?? 'Society office'}</p>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
