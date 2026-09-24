import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { useSocietyAudit } from '@/hooks/use-society';
import { AuditDetailDialog, auditColumns } from '@/features/platform/audit-page';

export default function SocietyAuditPage() {
  const list = useListState({ sort: '-createdAt' });
  const audit = useSocietyAudit(list.params);
  const [entry, setEntry] = React.useState<any | null>(null);
  return (
    <div>
      <PageHeader title="Audit log" description="Who changed what and when: logins, roles, modules, billing, payments, exports and settings." />
      <SettingsNav />
      <FilterBar onReset={list.reset}>
        <SearchInput value={list.filters.action ?? ''} onChange={(v) => list.setFilter('action', v)} placeholder="Action prefix, e.g. user." className="w-full sm:w-64" />
        <FilterSelect value={list.filters.resource ?? ''} onChange={(v) => list.setFilter('resource', v)} options={['Society', 'SocietySetting', 'SocietyModule', 'Role', 'User', 'Membership', 'Invitation', 'Category', 'Unit', 'Building', 'Subscription', 'SupportTicket'].map((r) => ({ value: r, label: r }))} allLabel="Any resource" />
      </FilterBar>
      <DataTable rows={audit.data?.items} loading={audit.isFetching} error={audit.error} onRetry={() => audit.refetch()} rowKey={(a: any) => a.id} dense sort={list.sort} onSortChange={list.setSort} columns={auditColumns(setEntry)} pagination={audit.data ? { page: audit.data.page, pages: audit.data.pages, total: audit.data.total, limit: audit.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined} />
      <AuditDetailDialog entry={entry} onClose={() => setEntry(null)} />
    </div>
  );
}
