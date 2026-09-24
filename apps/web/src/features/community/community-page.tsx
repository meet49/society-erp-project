import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Flag, Clock, Megaphone, MessagesSquare } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { FilterBar, FilterSelect } from '@/components/common/search-input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommunityRealtime, useCommunitySettings, useCommunityStats, useSaveCommunitySettings } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { getErrorMessage } from '@/lib/errors';
import { Composer, Feed } from './feed';

function SettingsCard() {
  const settings = useCommunitySettings();
  const save = useSaveCommunitySettings();
  const s = settings.data ?? {};
  const toggle = (key: string, v: boolean) => save.mutate({ [key]: v }, { onSuccess: () => toast.success('Saved'), onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Feed rules</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <label className="flex items-center justify-between gap-3"><span>Residents can post</span><Switch checked={s.memberPostsEnabled !== false} onCheckedChange={(v) => toggle('memberPostsEnabled', v)} /></label>
        <label className="flex items-center justify-between gap-3"><span>Hold resident posts for moderation</span><Switch checked={Boolean(s.moderateMemberPosts)} onCheckedChange={(v) => toggle('moderateMemberPosts', v)} /></label>
        <label className="flex items-center justify-between gap-3"><span>Allow comments</span><Switch checked={s.allowComments !== false} onCheckedChange={(v) => toggle('allowComments', v)} /></label>
        <label className="flex items-center justify-between gap-3"><span>Allow reporting</span><Switch checked={s.allowReports !== false} onCheckedChange={(v) => toggle('allowReports', v)} /></label>
      </CardContent>
    </Card>
  );
}

/** Committee view: announce, moderate reported / pending posts, tune feed rules. */
export default function CommunityPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const stats = useCommunityStats();
  useCommunityRealtime();
  const status = params.get('status') ?? '';
  const reported = params.get('reported') === 'true';
  const setP = (k: string, v: string) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Community" description="Announcements, the residents' feed and moderation." />
      <StatGrid className="mb-6">
        <StatCard label="Posts this week" value={stats.data?.postsThisWeek ?? 0} icon={<MessagesSquare />} loading={stats.isLoading} />
        <StatCard label="Waiting for moderation" value={stats.data?.pending ?? 0} icon={<Clock />} tone={(stats.data?.pending ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Reported posts" value={stats.data?.reported ?? 0} icon={<Flag />} tone={(stats.data?.reported ?? 0) > 0 ? 'destructive' : 'default'} loading={stats.isLoading} />
        <StatCard label="Active announcements" value={stats.data?.announcements ?? 0} icon={<Megaphone />} loading={stats.isLoading} />
      </StatGrid>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Composer announce={can('communication:announce')} />
          <FilterBar onReset={() => { params.delete('status'); params.delete('reported'); params.delete('kind'); setParams(params, { replace: true }); }}>
            <FilterSelect value={params.get('kind') ?? ''} onChange={(v) => setP('kind', v)} options={[{ value: 'POST', label: 'Posts' }, { value: 'ANNOUNCEMENT', label: 'Announcements' }]} allLabel="Posts & announcements" />
            <FilterSelect value={status} onChange={(v) => setP('status', v)} options={[{ value: 'ACTIVE', label: 'Visible' }, { value: 'PENDING', label: 'Waiting for moderation' }, { value: 'HIDDEN', label: 'Hidden' }]} allLabel="Any status" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={reported} onCheckedChange={(v) => setP('reported', v ? 'true' : '')} /> Reported only</label>
          </FilterBar>
          <Feed params={{ kind: params.get('kind') || undefined, status: status || undefined, reportedOnly: reported ? 'true' : undefined }} moderator={can('communication:moderate')} />
        </div>
        <div className="space-y-4">{can('communication:moderate') ? <SettingsCard /> : null}</div>
      </div>
    </div>
  );
}
