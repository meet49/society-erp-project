import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { FilterBar, FilterSelect } from '@/components/common/search-input';
import { useCommunityRealtime } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { Composer, Feed } from '@/features/community/feed';

/** Resident view of the community feed. */
export default function MyCommunityPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  useCommunityRealtime();
  const kind = params.get('kind') ?? '';
  return (
    <div>
      <PageHeader title="Community" description="Neighbourly updates, recommendations and announcements from the committee." />
      <div className="mx-auto max-w-3xl">
        <Composer announce={can('communication:announce')} />
        <FilterBar onReset={() => { params.delete('kind'); params.delete('mine'); setParams(params, { replace: true }); }}>
          <FilterSelect value={kind} onChange={(v) => { if (v) params.set('kind', v); else params.delete('kind'); setParams(params, { replace: true }); }} options={[{ value: 'POST', label: 'Posts' }, { value: 'ANNOUNCEMENT', label: 'Announcements' }]} allLabel="Everything" />
          <FilterSelect value={params.get('mine') ?? ''} onChange={(v) => { if (v) params.set('mine', v); else params.delete('mine'); setParams(params, { replace: true }); }} options={[{ value: 'true', label: 'My posts' }]} allLabel="Everyone's posts" />
        </FilterBar>
        <Feed params={{ kind: kind || undefined, mine: params.get('mine') || undefined }} moderator={can('communication:moderate')} />
      </div>
    </div>
  );
}
