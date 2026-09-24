import * as React from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, EyeOff, Globe, Pencil, Plus, Trash2, ExternalLink } from 'lucide-react';
import { LandingSectionTypes } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TableSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useCreateSection, useDeleteSection, useLandingPreview, useLandingSections, usePublishSection, useReorderSections, useUnpublishSection } from '@/hooks/use-platform';
import { SectionEditor } from '@/features/platform/website/section-editor';
import { RenderSection } from '@/features/public/sections';
import { formatStatus, formatDateTime } from '@/lib/utils';

export default function LandingEditorPage() {
  const sections = useLandingSections('home');
  const preview = useLandingPreview('home');
  const publish = usePublishSection();
  const unpublish = useUnpublishSection();
  const reorder = useReorderSections();
  const remove = useDeleteSection();
  const create = useCreateSection();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ type: 'CUSTOM', key: '', title: '' });
  if (sections.isError) return <ErrorState error={sections.error} onRetry={() => sections.refetch()} />;
  const list = sections.data ?? [];
  const current = editing ? list.find((s: any) => s.id === editing.id) ?? editing : null;

  const move = (i: number, dir: -1 | 1) => {
    const ids = list.map((s: any) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate({ page: 'home', orderedIds: ids });
  };

  return (
    <div>
      {ConfirmElement}
      <PageHeader
        title="Landing page"
        description="Edit sections as drafts, preview them, then publish. Only published, visible sections appear on the public site."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowPreview(true)}><Eye /> Preview drafts</Button>
            <Button variant="outline" asChild><a href="/" target="_blank" rel="noreferrer"><ExternalLink /> Open live site</a></Button>
            <Button onClick={() => setCreating(true)}><Plus /> Add section</Button>
          </>
        }
      />
      {sections.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="space-y-2">
          {list.map((s: any, i: number) => (
            <Card key={s.id} data-testid={`landing-section-${s.key}`}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down"><ArrowDown /></Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{formatStatus(s.type)}</Badge>
                    <p className="font-medium">{(s.draft?.title ?? s.title) || s.key}</p>
                    {s.hasDraft ? <Badge variant="warning">Unpublished changes</Badge> : null}
                    {!s.isPublished ? <Badge variant="muted">Not published</Badge> : null}
                    {s.isVisible === false ? <Badge variant="muted">Hidden</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">key {s.key}{s.publishedAt ? ` · published ${formatDateTime(s.publishedAt)}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)}><Pencil /> Edit</Button>
                  {s.isPublished ? (
                    <Button variant="ghost" size="sm" onClick={() => unpublish.mutate(s.id, { onSuccess: () => toast.success('Section unpublished') })}><EyeOff /> Unpublish</Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => publish.mutate(s.id, { onSuccess: () => toast.success('Section published') })}><Globe /> Publish</Button>
                  )}
                  {s.hasDraft && s.isPublished ? <Button variant="secondary" size="sm" onClick={() => publish.mutate(s.id, { onSuccess: () => toast.success('Changes published') })}><Globe /> Publish changes</Button> : null}
                  <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete this section?', description: 'It is removed from the live site immediately.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(s.id, { onSuccess: () => toast.success('Section deleted') }); }}><Trash2 /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={Boolean(current)} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Edit {current ? formatStatus(current.type) : ''} section</SheetTitle>
            <SheetDescription>Saving creates a draft. The live site changes only when you publish.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">{current ? <SectionEditor key={current.id + String(current.updatedAt)} section={current} onClose={() => setEditing(null)} /> : null}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent size="xl" className="max-h-[92vh] p-0">
          <DialogHeader className="border-b p-4"><DialogTitle>Preview (drafts included)</DialogTitle></DialogHeader>
          <div className="overflow-y-auto">
            {preview.data ? preview.data.sections.filter((s: any) => s.isVisible !== false).map((s: any) => <RenderSection key={s.id} section={s} landing={preview.data} />) : <TableSkeleton />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Add a section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LandingSectionTypes.filter((t) => t !== 'FOOTER').map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Key</Label><Input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="e.g. partners" /></div>
            <div className="space-y-1.5"><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button disabled={!draft.key} loading={create.isPending} onClick={() => create.mutate({ page: 'home', type: draft.type, key: draft.key, title: draft.title, content: { items: [] } }, { onSuccess: () => { toast.success('Section added as draft'); setCreating(false); setDraft({ type: 'CUSTOM', key: '', title: '' }); } })}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
