import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { KeyValue } from '@/components/common/key-value';
import { EmptyState } from '@/components/common/empty-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useHousehold, useUpdateResident } from '@/hooks/use-residents';
import { useAuth } from '@/hooks/use-auth';
import { formatDate, formatPhone, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

function EditableResident({ resident }: { resident: any }) {
  const update = useUpdateResident();
  const [form, setForm] = React.useState({ phone: resident.phone ?? '', altPhone: resident.altPhone ?? '', occupation: resident.occupation ?? '', bloodGroup: resident.bloodGroup ?? '', emergencyName: resident.emergencyContacts?.[0]?.name ?? '', emergencyPhone: resident.emergencyContacts?.[0]?.phone ?? '', emergencyRelation: resident.emergencyContacts?.[0]?.relation ?? '' });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{resident.unitId?.code} · {formatStatus(resident.type)}{resident.isPrimary ? ' · primary contact' : ''}</CardTitle>
        <CardDescription>Keep your contact and emergency details current; the society uses them for notices and emergencies.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <KeyValue columns={3} items={[{ label: 'Name', value: resident.name }, { label: 'Email', value: resident.email ?? '—' }, { label: 'Since', value: formatDate(resident.moveInDate) }]} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Alternate phone</Label><Input type="tel" value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Occupation</Label><Input value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Blood group</Label><Input value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} maxLength={5} /></div>
          <div className="space-y-1.5"><Label>Emergency contact name</Label><Input value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Emergency contact phone</Label><Input type="tel" value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Relation</Label><Input value={form.emergencyRelation} onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })} /></div>
        </div>
        <Button loading={update.isPending} onClick={() => update.mutate({ id: resident.id ?? resident._id, phone: form.phone || '', altPhone: form.altPhone || '', occupation: form.occupation || undefined, bloodGroup: form.bloodGroup || undefined, emergencyContacts: form.emergencyName && form.emergencyPhone ? [{ name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation || undefined }] : [] }, { onSuccess: () => toast.success('Profile updated'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save</Button>
      </CardContent>
    </Card>
  );
}

export default function MyProfilePage() {
  const household = useHousehold();
  const { user } = useAuth();
  if (household.isLoading) return <PageSkeleton />;
  if (household.isError) return <ErrorState error={household.error} onRetry={() => household.refetch()} />;
  const me = household.data?.me ?? [];
  return (
    <div>
      <PageHeader title="My profile" description={user?.email} actions={<Button asChild variant="outline"><Link to="/app/profile">Account & password</Link></Button>} />
      {!me.length ? (
        <EmptyState title="No unit linked to your account" description="Ask your society office to link your login to your flat. Until then you can still see notices and raise support tickets." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{me.map((r: any) => <Badge key={r.id ?? r._id} variant="secondary">{r.unitId?.code} · {formatStatus(r.type)} · {formatPhone(r.phone)}</Badge>)}</div>
          {me.map((r: any) => <EditableResident key={r.id ?? r._id} resident={r} />)}
        </div>
      )}
    </div>
  );
}
