import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, FolderOpen, FolderPlus, FileText, Download, Pin, Archive, Trash2, Pencil, Upload, CheckCheck, Ban, Clock, HardDrive, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { FileUpload } from '@/components/common/file-upload';
import { useConfirm } from '@/components/common/confirm-dialog';
import { KeyValue } from '@/components/common/key-value';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAddVersion, useArchiveDocument, useCreateDocument, useCreateFolder, useDeleteDocument, useDeleteFolder, useDocument, useDocumentCategories, useDocumentFolders, useDocumentSettings, useDocumentStats, useDocuments, useDocumentsRealtime, useDownloadDocument, useReviewDocument, useSaveDocumentSettings, useUpdateDocument, uploadFile } from '@/hooks/use-documents';
import { useUnitOptions } from '@/hooks/use-units';
import { usePermissions } from '@/hooks/use-access';
import { Combobox } from '@/components/common/combobox';
import { cn, formatDate, formatDateTime, formatNumber, formatStatus, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { WorkflowTrail } from '@/features/expenses/expense-detail-page';

const VISIBILITY = [{ value: 'ADMIN', label: 'Admins only' }, { value: 'COMMITTEE', label: 'Committee & staff' }, { value: 'MEMBERS', label: 'All residents' }, { value: 'UNIT', label: 'Specific units' }];
const fmtSize = (n?: number) => (!n ? '—' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Upload / edit dialog. New documents upload the file first, then create the record with the returned key. */
export function DocumentDialog({ open, onOpenChange, document: existing, folderId }: { open: boolean; onOpenChange: (o: boolean) => void; document?: any | null; folderId?: string | null }) {
  const categories = useDocumentCategories();
  const folders = useDocumentFolders();
  const units = useUnitOptions(open);
  const create = useCreateDocument();
  const update = useUpdateDocument();
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const blank = { title: '', description: '', categoryKey: 'OTHER', folderId: folderId ?? '', tags: '', visibility: 'COMMITTEE', unitIds: [] as string[], expiresAt: '', isPinned: false };
  const [form, setForm] = React.useState(blank);
  React.useEffect(() => {
    if (!open) return;
    setFiles([]);
    setForm(existing ? { title: existing.title, description: existing.description ?? '', categoryKey: existing.categoryKey ?? 'OTHER', folderId: existing.folderId?.id ?? existing.folderId?._id ?? '', tags: (existing.tags ?? []).filter((t: string) => !t.startsWith('__')).join(', '), visibility: existing.visibility ?? 'COMMITTEE', unitIds: (existing.unitIds ?? []).map(String), expiresAt: existing.expiresAt ? toInputDate(existing.expiresAt) : '', isPinned: Boolean(existing.isPinned) } : { ...blank, folderId: folderId ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, folderId]);
  const payload = () => ({ title: form.title, description: form.description || undefined, categoryKey: form.categoryKey, folderId: form.folderId || null, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), visibility: form.visibility, unitIds: form.visibility === 'UNIT' ? form.unitIds : [], expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null, isPinned: form.isPinned });
  const submit = async () => {
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, ...payload() });
        toast.success('Document updated');
      } else {
        if (!files[0]) return toast.error('Choose a file');
        setUploading(true);
        const stored = await uploadFile(files[0], 'documents');
        const created = await create.mutateAsync({ ...payload(), file: { storageKey: stored.storageKey, name: stored.name, mimeType: stored.mimeType, size: stored.size } });
        toast.success(created.status === 'PENDING_APPROVAL' ? 'Uploaded — waiting for review' : 'Document added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };
  const busy = uploading || create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{existing ? `Edit ${existing.title}` : 'Add document'}</DialogTitle><DialogDescription>Choose who can see it. Residents only see member-visible categories; unit documents are private to those units.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!existing ? <div className="sm:col-span-2"><FileUpload value={files} onChange={(f) => { setFiles(f); if (f[0] && !form.title) setForm({ ...form, title: f[0].name.replace(/\.[^.]+$/, '') }); }} accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.xlsx,.docx" /></div> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="doc-title">Title *</Label><Input id="doc-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="doc-desc">Description</Label><Textarea id="doc-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="doc-cat">Category</Label><Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}><SelectTrigger id="doc-cat"><SelectValue /></SelectTrigger><SelectContent>{(categories.data ?? []).map((c: any) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}{!categories.data?.length ? <SelectItem value="OTHER">Other</SelectItem> : null}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="doc-folder">Folder</Label><Select value={form.folderId || 'root'} onValueChange={(v) => setForm({ ...form, folderId: v === 'root' ? '' : v })}><SelectTrigger id="doc-folder"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="root">No folder</SelectItem>{(folders.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="doc-vis">Visible to</Label><Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}><SelectTrigger id="doc-vis"><SelectValue /></SelectTrigger><SelectContent>{VISIBILITY.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="doc-expires">Expires on</Label><Input id="doc-expires" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
          {form.visibility === 'UNIT' ? <div className="space-y-1.5 sm:col-span-2"><Label>Units</Label><div className="flex flex-wrap gap-1.5">{form.unitIds.map((u) => <Badge key={u} variant="outline" className="cursor-pointer" onClick={() => setForm({ ...form, unitIds: form.unitIds.filter((x) => x !== u) })}>{units.data?.find((o: any) => o.value === u)?.label ?? u} ×</Badge>)}</div><Combobox value="" onChange={(v) => { if (v && !form.unitIds.includes(v)) setForm({ ...form, unitIds: [...form.unitIds, v] }); }} options={units.data ?? []} placeholder="Add a unit…" /></div> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="doc-tags">Tags (comma separated)</Label><Input id="doc-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="agm, insurance, lift" /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.isPinned} onCheckedChange={(v) => setForm({ ...form, isPinned: v })} /> Pin to the top</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={busy} disabled={form.title.trim().length < 2 || (!existing && !files[0])} onClick={submit}><Upload /> {existing ? 'Save' : uploading ? 'Uploading…' : 'Upload'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentSheet({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (d: any) => void }) {
  const doc = useDocument(id ?? '');
  const download = useDownloadDocument();
  const archive = useArchiveDocument();
  const remove = useDeleteDocument();
  const review = useReviewDocument();
  const addVersion = useAddVersion();
  const { can } = usePermissions();
  const { confirm, ConfirmElement } = useConfirm();
  const [versionFiles, setVersionFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const d = doc.data;
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  const uploadVersion = async () => {
    if (!versionFiles[0] || !d) return;
    setBusy(true);
    try { const stored = await uploadFile(versionFiles[0], 'documents'); await addVersion.mutateAsync({ id: d.id, file: { storageKey: stored.storageKey, name: stored.name, mimeType: stored.mimeType, size: stored.size } }); toast.success(`Version ${d.version + 1} uploaded`); setVersionFiles([]); } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {d ? <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2">{d.isPinned ? <Pin className="h-4 w-4 text-primary" /> : null}{d.title} <StatusBadge status={d.status} /></SheetTitle><SheetDescription>{formatStatus(d.categoryKey)} · {VISIBILITY.find((v) => v.value === d.visibility)?.label}{d.folderId?.name ? ` · ${d.folderId.name}` : ''}</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-4">
            {d.description ? <p className="text-sm text-muted-foreground">{d.description}</p> : null}
            <KeyValue columns={2} items={[
              { label: 'File', value: <span className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{d.name}</span> },
              { label: 'Size', value: fmtSize(d.size) },
              { label: 'Version', value: `v${d.version}` },
              { label: 'Downloads', value: d.downloadCount },
              { label: 'Uploaded', value: `${formatDateTime(d.createdAt)}${d.uploadedBy?.name ? ` · ${d.uploadedBy.name}` : ''}` },
              { label: 'Expires', value: d.expiresAt ? <span className={cn(new Date(d.expiresAt) < new Date() && 'text-destructive')}>{formatDate(d.expiresAt)}</span> : '—' },
              ...(d.tags?.filter((t: string) => !t.startsWith('__')).length ? [{ label: 'Tags', value: <span className="flex flex-wrap gap-1">{d.tags.filter((t: string) => !t.startsWith('__')).map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}</span>, span: 2 }] : []),
              ...(d.reviewNote ? [{ label: 'Review note', value: d.reviewNote, span: 2 }] : []),
            ]} />
            <div className="flex flex-wrap gap-2">
              <PermissionGate permission={['documents:download', 'documents:view_own']}><Button size="sm" loading={download.isPending} onClick={() => download.mutate({ id: d.id }, { onError: err })}><Download /> Download</Button></PermissionGate>
              {d.canEdit && can('documents:update') ? <Button size="sm" variant="outline" onClick={() => onEdit(d)}><Pencil /> Edit</Button> : null}
              {d.status === 'PENDING_APPROVAL' && can('documents:update') ? <><Button size="sm" onClick={() => review.mutate({ id: d.id, decision: 'APPROVED' }, { onSuccess: () => toast.success('Approved'), onError: err })}><CheckCheck /> Approve</Button><Button size="sm" variant="outline" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Reject this document?', destructive: true, confirmLabel: 'Reject' })) review.mutate({ id: d.id, decision: 'REJECTED', note: 'Rejected by reviewer' }, { onError: err }); }}><Ban /> Reject</Button></> : null}
              {d.status !== 'ARCHIVED' && (can('documents:archive') || can('documents:update')) ? <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: `Archive “${d.title}”?`, description: 'Residents will no longer see it; the file is kept.', confirmLabel: 'Archive' })) archive.mutate(d.id, { onSuccess: () => toast.success('Archived'), onError: err }); }}><Archive /> Archive</Button> : null}
              {can('documents:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete permanently?', description: 'Every version is removed from storage.', destructive: true, confirmLabel: 'Delete' })) remove.mutate(d.id, { onSuccess: () => { toast.success('Deleted'); onClose(); }, onError: err }); }}><Trash2 /></Button> : null}
            </div>
            <WorkflowTrail workflow={d.workflow} />
            <div>
              <h3 className="mb-2 text-sm font-semibold">Versions</h3>
              <ul className="divide-y rounded-md border text-sm">{[...(d.versions ?? [])].reverse().map((v: any) => <li key={v.version} className="flex items-center justify-between gap-2 px-3 py-2"><span>v{v.version} · {v.name} <span className="text-xs text-muted-foreground">{fmtSize(v.size)} · {formatDate(v.uploadedAt)}{v.uploadedBy?.name ? ` · ${v.uploadedBy.name}` : ''}{v.note ? ` · ${v.note}` : ''}</span></span><Button size="sm" variant="ghost" onClick={() => download.mutate({ id: d.id, version: v.version }, { onError: err })}><Download /></Button></li>)}</ul>
              {d.canEdit && d.status !== 'ARCHIVED' && (can('documents:update') || can('documents:create')) ? <div className="mt-2 space-y-2"><FileUpload value={versionFiles} onChange={setVersionFiles} label="Upload a new version" />{versionFiles[0] ? <Button size="sm" loading={busy} onClick={uploadVersion}><Upload /> Add version {d.version + 1}</Button> : null}</div> : null}
            </div>
          </div>
        </> : null}
        {ConfirmElement}
      </SheetContent>
    </Sheet>
  );
}

function FolderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateFolder();
  const [name, setName] = React.useState('');
  const [visibility, setVisibility] = React.useState('COMMITTEE');
  React.useEffect(() => { if (open) { setName(''); setVisibility('COMMITTEE'); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="fd-name">Name *</Label><Input id="fd-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="fd-vis">Who can browse it</Label><Select value={visibility} onValueChange={setVisibility}><SelectTrigger id="fd-vis"><SelectValue /></SelectTrigger><SelectContent>{VISIBILITY.filter((v) => v.value !== 'UNIT').map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate({ name, visibility }, { onSuccess: () => { toast.success('Folder created'); onOpenChange(false); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsCard() {
  const settings = useDocumentSettings();
  const categories = useDocumentCategories();
  const save = useSaveDocumentSettings();
  const s = settings.data;
  if (!s) return null;
  const toggleCat = (key: string) => { const list: string[] = s.memberVisibleCategories ?? []; save.mutate({ memberVisibleCategories: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] }, { onError: (e) => toast.error(getErrorMessage(e)) }); };
  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <p className="mb-2 font-semibold">Repository rules</p>
      <p className="mb-1 text-xs text-muted-foreground">Categories residents may see (when the document itself is member-visible)</p>
      <div className="mb-3 flex flex-wrap gap-1.5">{(categories.data ?? []).map((c: any) => <button key={c.key} type="button" onClick={() => toggleCat(c.key)} className={cn('rounded-full border px-2.5 py-1 text-xs', (s.memberVisibleCategories ?? []).includes(c.key) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{c.name}</button>)}</div>
      <label className="flex items-center justify-between gap-3"><span>Committee uploads need admin review</span><Switch checked={Boolean(s.requireApprovalForStaffUploads)} onCheckedChange={(v) => save.mutate({ requireApprovalForStaffUploads: v }, { onError: (e) => toast.error(getErrorMessage(e)) })} /></label>
    </div>
  );
}

/** Repository view for admins / committee: folders, upload, review, versions, expiry. */
export default function DocumentsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const stats = useDocumentStats();
  const folders = useDocumentFolders();
  const categories = useDocumentCategories();
  const list = useListState({ limit: 25 });
  const folderId = params.get('folder') ?? '';
  const documents = useDocuments({ ...list.params, folderId: folderId || undefined });
  const removeFolder = useDeleteFolder();
  const { confirm, ConfirmElement } = useConfirm();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [folderOpen, setFolderOpen] = React.useState(false);
  useDocumentsRealtime();
  const selected = params.get('document');
  const setParam = (k: string, v: string | null) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  return (
    <div>
      <PageHeader title="Documents" description="Bye-laws, minutes, contracts, insurance and unit papers with controlled visibility." actions={<>
        <PermissionGate permission="documents:manage_folders"><Button variant="outline" onClick={() => setFolderOpen(true)}><FolderPlus /> Folder</Button></PermissionGate>
        <PermissionGate permission="documents:create"><SubscriptionGate><Button onClick={() => setAdding(true)}><Plus /> Add document</Button></SubscriptionGate></PermissionGate>
      </>} />
      <StatGrid className="mb-6">
        <StatCard label="Documents" value={stats.data?.total ?? 0} hint={stats.data?.byCategory?.length ? `${stats.data.byCategory.length} categories` : undefined} icon={<FileText />} loading={stats.isLoading} />
        <StatCard label="Waiting for review" value={stats.data?.pending ?? 0} icon={<CheckCheck />} tone={(stats.data?.pending ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Expiring soon" value={stats.data?.expiring ?? 0} hint={stats.data?.expired ? `${stats.data.expired} already expired` : 'Next 60 days'} icon={<Clock />} tone={(stats.data?.expired ?? 0) > 0 ? 'destructive' : (stats.data?.expiring ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Storage used" value={`${formatNumber(stats.data?.sizeMb ?? 0, 1)} MB`} hint={stats.data?.storageLimitMb ? `of ${stats.data.storageLimitMb} MB on your plan` : 'No storage limit on your plan'} icon={<HardDrive />} loading={stats.isLoading} />
      </StatGrid>
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-2 text-sm">
            <button type="button" onClick={() => setParam('folder', null)} className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted', !folderId && 'bg-muted font-medium')}><FolderOpen className="h-4 w-4" /> All documents</button>
            <button type="button" onClick={() => setParam('folder', 'root')} className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted', folderId === 'root' && 'bg-muted font-medium')}><FolderOpen className="h-4 w-4 opacity-60" /> Unfiled</button>
            {(folders.data ?? []).map((f: any) => (
              <div key={f.id} className={cn('group flex items-center rounded hover:bg-muted', folderId === f.id && 'bg-muted font-medium')}>
                <button type="button" onClick={() => setParam('folder', f.id)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left"><FolderOpen className="h-4 w-4 text-primary" /> <span className="flex-1 truncate">{f.name}</span><span className="text-xs text-muted-foreground">{f.documentCount}</span></button>
                {can('documents:manage_folders') ? <button type="button" className="mr-1 hidden text-muted-foreground hover:text-destructive group-hover:block" onClick={async () => { if (await confirm({ title: `Delete folder “${f.name}”?`, description: 'Only empty folders can be deleted.', destructive: true, confirmLabel: 'Delete' })) removeFolder.mutate(f.id, { onError: (e) => toast.error(getErrorMessage(e)) }); }}><Trash2 className="h-3.5 w-3.5" /></button> : null}
              </div>
            ))}
          </div>
          {can('documents:manage_folders') || can('documents:update') ? <SettingsCard /> : null}
        </div>
        <div className="lg:col-span-3">
          <FilterBar onReset={list.reset}>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Title, file name, tag…" className="w-full sm:w-64" />
            <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
            <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'PENDING_APPROVAL', 'REJECTED', 'ARCHIVED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Live & pending" />
            <FilterSelect value={list.filters.visibility ?? ''} onChange={(v) => list.setFilter('visibility', v)} options={VISIBILITY} allLabel="Any visibility" />
            <label className="flex items-center gap-2 text-sm"><Switch checked={list.filters.expiringOnly === 'true'} onCheckedChange={(v) => list.setFilter('expiringOnly', v ? 'true' : '')} /> Expiring</label>
          </FilterBar>
          <DataTable
            rows={documents.data?.items}
            loading={documents.isFetching}
            error={documents.error}
            onRetry={() => documents.refetch()}
            rowKey={(d: any) => d.id}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={(d: any) => setParam('document', d.id)}
            emptyTitle="No documents here"
            emptyDescription="Upload bye-laws, minutes, contracts or unit papers and choose who may see them."
            columns={[
              { key: 'title', header: 'Document', sortable: true, cell: (d: any) => <span><span className="flex items-center gap-1 font-medium">{d.isPinned ? <Pin className="h-3 w-3 text-primary" /> : null}{d.title}</span><span className="block text-xs text-muted-foreground">{d.name} · {fmtSize(d.size)} · v{d.version}</span></span> },
              { key: 'categoryKey', header: 'Category', hideBelow: 'md', sortable: true, cell: (d: any) => <Badge variant="outline">{formatStatus(d.categoryKey)}</Badge> },
              { key: 'visibility', header: 'Visible to', hideBelow: 'lg', cell: (d: any) => VISIBILITY.find((v) => v.value === d.visibility)?.label ?? d.visibility },
              { key: 'expiresAt', header: 'Expires', sortable: true, hideBelow: 'md', cell: (d: any) => d.expiresAt ? <span className={cn(new Date(d.expiresAt) < new Date() ? 'text-destructive' : new Date(d.expiresAt).getTime() - Date.now() < 60 * 86_400_000 ? 'text-warning-foreground dark:text-warning' : '')}>{formatDate(d.expiresAt)}</span> : '—' },
              { key: 'createdAt', header: 'Added', sortable: true, hideBelow: 'lg', cell: (d: any) => `${formatDate(d.createdAt)}${d.uploadedBy?.name ? ` · ${d.uploadedBy.name}` : ''}` },
              { key: 'status', header: 'Status', cell: (d: any) => <StatusBadge status={d.status} /> },
            ]}
            pagination={documents.data ? { page: documents.data.page, pages: documents.data.pages, total: documents.data.total, limit: documents.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
          />
        </div>
      </div>
      <DocumentDialog open={adding || Boolean(editing)} onOpenChange={(o) => { if (!o) { setAdding(false); setEditing(null); } }} document={editing} folderId={folderId && folderId !== 'root' ? folderId : null} />
      <FolderDialog open={folderOpen} onOpenChange={setFolderOpen} />
      <DocumentSheet id={selected} onClose={() => setParam('document', null)} onEdit={(d) => { setParam('document', null); setEditing(d); }} />
      {ConfirmElement}
    </div>
  );
}
