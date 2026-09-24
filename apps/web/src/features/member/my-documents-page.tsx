import * as React from 'react';
import { toast } from 'sonner';
import { FolderOpen, FileText, Download, Pin, Home } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { FilterBar, FilterSelect, SearchInput } from '@/components/common/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentCategories, useDocumentFolders, useDocuments, useDocumentsRealtime, useDownloadDocument } from '@/hooks/use-documents';
import { cn, formatDate, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const fmtSize = (n?: number) => (!n ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Resident view: society documents shared with residents plus papers private to my unit. */
export default function MyDocumentsPage() {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [folder, setFolder] = React.useState('');
  const folders = useDocumentFolders();
  const categories = useDocumentCategories();
  const documents = useDocuments({ limit: 100, search: search || undefined, categoryKey: category || undefined, folderId: folder || undefined });
  const download = useDownloadDocument();
  useDocumentsRealtime();
  const items: any[] = documents.data?.items ?? [];
  const mine = items.filter((d) => d.visibility === 'UNIT');
  const shared = items.filter((d) => d.visibility !== 'UNIT');
  const Row = ({ d }: { d: any }) => (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0"><span className="flex items-center gap-1 font-medium">{d.isPinned ? <Pin className="h-3 w-3 text-primary" /> : null}{d.title}</span><span className="block truncate text-xs text-muted-foreground"><Badge variant="outline" className="mr-1">{formatStatus(d.categoryKey)}</Badge>{d.folderId?.name ? `${d.folderId.name} · ` : ''}{formatDate(d.createdAt)}{d.size ? ` · ${fmtSize(d.size)}` : ''}{d.expiresAt ? ` · valid till ${formatDate(d.expiresAt)}` : ''}</span></span>
      <Button size="sm" variant="outline" loading={download.isPending} onClick={() => download.mutate({ id: d.id }, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Open</Button>
    </li>
  );
  return (
    <div>
      <PageHeader title="Documents" description="Society papers shared with residents, and documents that belong to your unit." />
      <FilterBar onReset={() => { setSearch(''); setCategory(''); setFolder(''); }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search documents…" className="w-full sm:w-64" />
        <FilterSelect value={category} onChange={setCategory} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
        <FilterSelect value={folder} onChange={setFolder} options={(folders.data ?? []).map((f: any) => ({ value: f.id, label: f.name }))} allLabel="All folders" />
      </FilterBar>
      {documents.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<FolderOpen />} title="No documents yet" description="Documents the society shares with residents will appear here." /> : (
        <div className={cn('grid gap-4', mine.length && 'lg:grid-cols-3')}>
          {mine.length ? <Card><CardContent className="p-4"><p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Home className="h-4 w-4" /> My unit</p><ul className="divide-y text-sm">{mine.map((d) => <Row key={d.id} d={d} />)}</ul></CardContent></Card> : null}
          <Card className={cn(mine.length && 'lg:col-span-2')}><CardContent className="p-4"><p className="mb-1 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Society documents</p><ul className="divide-y text-sm">{shared.map((d) => <Row key={d.id} d={d} />)}{!shared.length ? <li className="py-3 text-muted-foreground">Nothing shared yet.</li> : null}</ul></CardContent></Card>
        </div>
      )}
    </div>
  );
}
