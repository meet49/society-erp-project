import * as React from 'react';
import { toast } from 'sonner';
import { Heart, MessageCircle, Flag, Pin, EyeOff, Eye, Trash2, Megaphone, Send, CheckCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ALL_AUDIENCE, useCommentPost, useCommunitySettings, useCreatePost, useDeletePost, useLikePost, useModeratePost, usePosts, useRemoveComment, useReportPost, type AudienceValue } from '@/hooks/use-community';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatRelative, getInitials } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { AudiencePicker } from './audience-picker';

function Avatar({ name }: { name?: string }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{getInitials(name)}</span>;
}

/** Composer for posts (residents) and announcements (committee). */
export function Composer({ announce }: { announce: boolean }) {
  const create = useCreatePost();
  const settings = useCommunitySettings();
  const [body, setBody] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [kind, setKind] = React.useState<'POST' | 'ANNOUNCEMENT'>('POST');
  const [pinned, setPinned] = React.useState(false);
  const [audience, setAudience] = React.useState<AudienceValue>(ALL_AUDIENCE);
  const { can } = usePermissions();
  const canPost = can('communication:create') && (settings.data?.memberPostsEnabled !== false || can('communication:moderate'));
  if (!canPost && !announce) return null;
  const submit = () => create.mutate({ kind, title: kind === 'ANNOUNCEMENT' ? title || undefined : undefined, body, audience: kind === 'ANNOUNCEMENT' ? audience : undefined, isPinned: kind === 'ANNOUNCEMENT' ? pinned : undefined }, {
    onSuccess: (p) => { toast.success(p.status === 'PENDING' ? 'Posted — waiting for moderation' : kind === 'ANNOUNCEMENT' ? 'Announcement published' : 'Posted'); setBody(''); setTitle(''); setPinned(false); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 p-4">
        {announce ? <div className="flex gap-1.5">{(['POST', 'ANNOUNCEMENT'] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-full border px-3 py-1 text-xs', kind === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{k === 'POST' ? 'Post' : 'Announcement'}</button>)}</div> : null}
        {kind === 'ANNOUNCEMENT' ? <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" aria-label="Announcement title" /> : null}
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'ANNOUNCEMENT' ? 'What should residents know?' : 'Share something with your neighbours…'} aria-label="Post" />
        {kind === 'ANNOUNCEMENT' ? <><AudiencePicker value={audience} onChange={setAudience} /><label className="flex items-center gap-2 text-sm"><Switch checked={pinned} onCheckedChange={setPinned} /> Pin to the top</label></> : null}
        <div className="flex justify-end"><Button loading={create.isPending} disabled={body.trim().length < 2} onClick={submit}>{kind === 'ANNOUNCEMENT' ? <><Megaphone /> Announce</> : <><Send /> Post</>}</Button></div>
      </CardContent>
    </Card>
  );
}

function PostCard({ post, moderator }: { post: any; moderator: boolean }) {
  const like = useLikePost();
  const comment = useCommentPost();
  const removeComment = useRemoveComment();
  const report = useReportPost();
  const moderate = useModeratePost();
  const remove = useDeletePost();
  const { confirm, ConfirmElement } = useConfirm();
  const [text, setText] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const del = async () => { if (await confirm({ title: 'Delete this post?', destructive: true, confirmLabel: 'Delete' })) remove.mutate(post.id, { onSuccess: () => toast.success('Deleted'), onError: err }); };
  return (
    <Card className={cn(post.kind === 'ANNOUNCEMENT' && 'border-primary/40', post.status === 'HIDDEN' && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar name={post.createdBy?.name} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="font-semibold">{post.createdBy?.name ?? 'Member'}</span>{post.unitId?.code ? <span className="text-muted-foreground">· {post.unitId.code}</span> : null}<span className="text-muted-foreground">· {formatRelative(post.createdAt)}</span>{post.kind === 'ANNOUNCEMENT' ? <Badge variant="info"><Megaphone className="mr-1 h-3 w-3" />Announcement · {post.audienceLabel}</Badge> : null}{post.isPinned ? <Badge variant="outline"><Pin className="mr-1 h-3 w-3" />Pinned</Badge> : null}{post.status !== 'ACTIVE' ? <StatusBadge status={post.status} /> : null}{moderator && post.reportCount ? <Badge variant="destructive"><Flag className="mr-1 h-3 w-3" />{post.reportCount} report{post.reportCount === 1 ? '' : 's'}</Badge> : null}</p>
            {post.title ? <p className="mt-1 font-semibold">{post.title}</p> : null}
            <p className="mt-1 whitespace-pre-line text-sm">{post.body}</p>
            {moderator && post.reports?.length ? <ul className="mt-2 rounded-md bg-destructive/5 p-2 text-xs text-muted-foreground">{post.reports.map((r: any, i: number) => <li key={i}>{r.userId?.name ?? 'Someone'}: {r.reason}</li>)}</ul> : null}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Button size="sm" variant="ghost" className={cn(post.liked && 'text-destructive')} onClick={() => like.mutate(post.id, { onError: err })}><Heart className={cn(post.liked && 'fill-current')} /> {post.likeCount || ''}</Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}><MessageCircle /> {post.commentCount || ''}</Button>
              {!post.mine ? <Button size="sm" variant="ghost" onClick={() => { setReason(''); setReporting(true); }}><Flag /> Report</Button> : null}
              {post.mine || moderator ? <Button size="sm" variant="ghost" className="text-destructive" onClick={del}><Trash2 /></Button> : null}
              {moderator ? <>
                <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: post.id, action: post.isPinned ? 'UNPIN' : 'PIN' }, { onError: err })}><Pin /> {post.isPinned ? 'Unpin' : 'Pin'}</Button>
                {post.status === 'PENDING' ? <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: post.id, action: 'APPROVE' }, { onSuccess: () => toast.success('Approved'), onError: err })}><CheckCheck /> Approve</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: post.id, action: post.status === 'HIDDEN' ? 'UNHIDE' : 'HIDE' }, { onError: err })}>{post.status === 'HIDDEN' ? <><Eye /> Unhide</> : <><EyeOff /> Hide</>}</Button>
                {post.reportCount ? <Button size="sm" variant="ghost" onClick={() => moderate.mutate({ id: post.id, action: 'CLEAR_REPORTS' }, { onError: err })}>Clear reports</Button> : null}
              </> : null}
            </div>
            {open || post.comments?.length ? (
              <div className="mt-2 space-y-2 border-l-2 pl-3">
                {(post.comments ?? []).map((c: any) => (
                  <div key={c.id} className={cn('text-sm', c.hidden && 'opacity-50')}><span className="font-medium">{c.userId?.name ?? 'Member'}</span> <span className="text-xs text-muted-foreground">{formatRelative(c.at)}</span>{(c.mine || moderator) && !c.hidden ? <button type="button" className="ml-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => removeComment.mutate({ id: post.id, commentId: c.id }, { onError: err })}>remove</button> : null}<p className="whitespace-pre-line">{c.body}</p></div>
                ))}
                {open ? <div className="flex gap-2"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment…" aria-label="Comment" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) comment.mutate({ id: post.id, body: text }, { onSuccess: () => setText(''), onError: err }); }} /><Button size="sm" loading={comment.isPending} disabled={!text.trim()} onClick={() => comment.mutate({ id: post.id, body: text }, { onSuccess: () => setText(''), onError: err })}><Send /></Button></div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Report this post</DialogTitle><DialogDescription>The committee reviews reports and can hide the post.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="rp-reason">Why?</Label><Textarea id="rp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setReporting(false)}>Cancel</Button><Button variant="destructive" loading={report.isPending} disabled={reason.trim().length < 3} onClick={() => report.mutate({ id: post.id, reason }, { onSuccess: () => { toast.success('Reported to the committee'); setReporting(false); }, onError: err })}>Report</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmElement}
    </Card>
  );
}

/** The feed itself; the same component powers the resident page and the moderation view. */
export function Feed({ params, moderator }: { params: Record<string, unknown>; moderator: boolean }) {
  const posts = usePosts({ limit: 30, ...params });
  const items: any[] = posts.data?.items ?? [];
  if (posts.isLoading) return <CardSkeleton count={3} />;
  if (!items.length) return <EmptyState icon={<MessageCircle />} title="Nothing here yet" description={moderator ? 'Posts and announcements appear here as residents and the committee share them.' : 'Be the first to say hello to your neighbours.'} />;
  return <div className="space-y-3">{items.map((p) => <PostCard key={p.id} post={p} moderator={moderator} />)}</div>;
}
