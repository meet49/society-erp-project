import * as React from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/avatar';
import { useResidentLookup } from '@/hooks/use-residents';
import { usePermissions } from '@/hooks/use-access';
import { formatStatus } from '@/lib/utils';

/** Privacy-respecting directory: name, type and unit only (contact details stay in the Residents module). */
export default function DirectoryPage() {
  const [q, setQ] = React.useState('');
  const lookup = useResidentLookup(q);
  const { can } = usePermissions();
  return (
    <div>
      <PageHeader title="Directory" description="Find residents by name or unit. Contact details are shown only to roles with permission." />
      <SearchInput value={q} onChange={setQ} placeholder="Type a name or unit number…" className="mb-4 max-w-md" delay={200} />
      {!q.trim() ? (
        <EmptyState icon={<Search />} title="Search the directory" description="Start typing a resident name or a unit like A-101." />
      ) : lookup.data && lookup.data.length === 0 ? (
        <EmptyState title="No matches" description="Try a different name or unit number." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(lookup.data ?? []).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <UserAvatar name={r.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{can('residents:view') ? <Link to={`/app/residents/${r.id}`} className="hover:underline">{r.name}</Link> : r.name}</p>
                  <p className="text-xs text-muted-foreground">{formatStatus(r.type)}{r.isPrimary ? ' · primary' : ''}</p>
                </div>
                <Badge variant="secondary">{r.unitCode}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
