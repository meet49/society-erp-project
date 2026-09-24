import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { TableSkeleton } from '@/components/common/loading-state';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  /** hide on small screens */
  hideBelow?: 'sm' | 'md' | 'lg';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  pagination?: { page: number; pages: number; total: number; limit: number; onPageChange: (page: number) => void; onLimitChange?: (limit: number) => void };
  className?: string;
  dense?: boolean;
  footer?: React.ReactNode;
}

const HIDE: Record<string, string> = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, onRowClick, sort, onSortChange, pagination, className, dense, footer }: DataTableProps<T>) {
  const sortField = sort?.replace(/^-/, '');
  const sortDesc = sort?.startsWith('-');
  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    if (sortField !== key) onSortChange(key);
    else if (!sortDesc) onSortChange(`-${key}`);
    else onSortChange('');
  };
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      {error ? (
        <ErrorState error={error} onRetry={onRetry} className="border-0" />
      ) : loading && !rows ? (
        <TableSkeleton cols={columns.length} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} className="border-0" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.headerClassName, c.hideBelow && HIDE[c.hideBelow])}>
                  {c.sortable && onSortChange ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      {sortField === c.key ? sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className={cn(loading && 'opacity-60')}>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn(onRowClick && 'cursor-pointer')}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.className, dense && 'py-1.5', c.hideBelow && HIDE[c.hideBelow])}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {footer}
      {pagination && pagination.total > 0 ? <Pagination {...pagination} /> : null}
    </div>
  );
}

export function Pagination({ page, pages, total, limit, onPageChange, onLimitChange }: { page: number; pages: number; total: number; limit: number; onPageChange: (page: number) => void; onLimitChange?: (limit: number) => void }) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex flex-col gap-2 border-t px-3 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span>
          {from}–{to} of {total}
        </span>
        {onLimitChange ? (
          <Select value={String(limit)} onValueChange={(v) => onLimitChange(Number(v))}>
            <SelectTrigger className="h-7 w-[90px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 text-xs">
          Page {page} of {Math.max(1, pages)}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** URL-free list state helper: page/limit/sort/search/filters kept in component state. */
export function useListState(initial: { limit?: number; sort?: string; filters?: Record<string, string> } = {}) {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(initial.limit ?? 20);
  const [sort, setSort] = React.useState(initial.sort ?? '');
  const [search, setSearchRaw] = React.useState('');
  const [filters, setFiltersRaw] = React.useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial.filters ?? {}).filter(([, v]) => Boolean(v))));
  const setSearch = (v: string) => {
    setSearchRaw(v);
    setPage(1);
  };
  const setFilter = (key: string, value: string) => {
    setFiltersRaw((f) => {
      const next = { ...f };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  };
  const params = React.useMemo(() => ({ page, limit, sort: sort || undefined, search: search || undefined, ...filters }), [page, limit, sort, search, filters]);
  return { page, setPage, limit, setLimit: (l: number) => { setLimit(l); setPage(1); }, sort, setSort: (s: string) => { setSort(s); setPage(1); }, search, setSearch, filters, setFilter, params, reset: () => { setPage(1); setSearchRaw(''); setFiltersRaw({}); } };
}
