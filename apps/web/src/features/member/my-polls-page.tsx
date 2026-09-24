import * as React from 'react';
import { Vote } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { FilterBar } from '@/components/common/search-input';
import { Switch } from '@/components/ui/switch';
import { useCommunityRealtime, usePolls } from '@/hooks/use-community';
import { PollCard } from '@/features/community/poll-card';

/** Resident view: open polls first, then closed ones with results. */
export default function MyPollsPage() {
  const [closed, setClosed] = React.useState(false);
  const polls = usePolls({ limit: 50 });
  useCommunityRealtime();
  const items: any[] = (polls.data?.items ?? []).filter((p) => closed || p.status === 'OPEN');
  return (
    <div>
      <PageHeader title="Polls" description="Have your say on society decisions." />
      <FilterBar onReset={() => setClosed(false)}><label className="flex items-center gap-2 text-sm"><Switch checked={closed} onCheckedChange={setClosed} /> Show closed polls</label></FilterBar>
      {polls.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<Vote />} title={closed ? 'No polls yet' : 'No open polls'} description="Polls from the committee appear here as soon as they open." /> : <div className="mx-auto grid max-w-4xl gap-4">{items.map((p) => <PollCard key={p.id} poll={p} />)}</div>}
    </div>
  );
}
