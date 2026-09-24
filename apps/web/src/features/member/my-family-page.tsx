import * as React from 'react';
import { toast } from 'sonner';
import { Plus, HeartHandshake } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/common/empty-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { useAddFamilyMember, useHousehold } from '@/hooks/use-residents';
import { formatPhone, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

export default function MyFamilyPage() {
  const household = useHousehold();
  const add = useAddFamilyMember();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', relationship: '', phone: '', email: '', type: 'FAMILY', unitId: '' });
  if (household.isLoading) return <PageSkeleton />;
  if (household.isError) return <ErrorState error={household.error} onRetry={() => household.refetch()} />;
  const data = household.data;
  const units: any[] = data?.units ?? [];
  const members: any[] = data?.members ?? [];
  return (
    <div>
      <PageHeader title="My family" description="Everyone registered in your household. Guards and the office use this list to recognise your family." actions={data?.canEditFamily && units.length ? <Button onClick={() => { setForm({ ...form, unitId: units[0]?.id ?? units[0]?._id ?? '' }); setOpen(true); }}><Plus /> Add member</Button> : null} />
      {!units.length ? (
        <EmptyState icon={<HeartHandshake />} title="No unit linked" description="Your household appears once the society links your login to a unit." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m: any) => (
            <Card key={m.id ?? m._id}>
              <CardContent className="flex items-center gap-3 p-4">
                <UserAvatar name={m.name} src={m.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{formatStatus(m.type)}{m.relationship ? ` · ${m.relationship}` : ''} · {m.unitId?.code}{m.phone ? ` · ${formatPhone(m.phone)}` : ''}</p>
                </div>
                {m.userId ? <Badge variant="success">App</Badge> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Add a family member</DialogTitle><DialogDescription>Members are added to your unit; the office can review them.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            {units.length > 1 ? <div className="space-y-1.5"><Label>Unit</Label><Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{units.map((u: any) => <SelectItem key={u.id ?? u._id} value={u.id ?? u._id}>{u.code}</SelectItem>)}</SelectContent></Select></div> : null}
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Type</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FAMILY">Family member</SelectItem><SelectItem value="CAREGIVER">Caregiver</SelectItem><SelectItem value="OTHER">Other authorised resident</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Relationship</Label><Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Spouse, daughter, parent…" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={add.isPending} disabled={form.name.trim().length < 2} onClick={() => add.mutate({ name: form.name, relationship: form.relationship || undefined, phone: form.phone || undefined, email: form.email || undefined, type: form.type, unitId: form.unitId || undefined }, { onSuccess: () => { toast.success('Family member added'); setOpen(false); setForm({ name: '', relationship: '', phone: '', email: '', type: 'FAMILY', unitId: form.unitId }); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
