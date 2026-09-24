import * as React from 'react';
import { CheckSquare } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { FilterBar } from '@/components/common/search-input';
import { Switch } from '@/components/ui/switch';
import { useGovernanceRealtime, useVotings } from '@/hooks/use-governance';
import { BallotCard } from '@/features/governance/ballot-card';

/** Resident view: open votes first, closed ones with results. */
export default function MyVotingPage() {
  const [closed, setClosed] = React.useState(false);
  const votings = useVotings({ limit: 50 });
  useGovernanceRealtime();
  const items: any[] = (votings.data?.items ?? []).filter((v) => closed || v.status === 'OPEN');
  return (
    <div>
      <PageHeader title="Voting" description="Cast your household's ballot on society resolutions and elections." />
      <FilterBar onReset={() => setClosed(false)}><label className="flex items-center gap-2 text-sm"><Switch checked={closed} onCheckedChange={setClosed} /> Show closed votes</label></FilterBar>
      {votings.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<CheckSquare />} title={closed ? 'No votes yet' : 'Nothing open for voting'} description="You'll be notified when a vote opens for you." /> : <div className="mx-auto grid max-w-4xl gap-4">{items.map((v) => <BallotCard key={v.id} voting={v} />)}</div>}
    </div>
  );
}
