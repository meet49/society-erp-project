import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Sparkles, Pencil, UserMinus, Clock } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { CardSkeleton } from '@/components/common/loading-state';
import { StatusBadge } from '@/components/common/status-badge';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDomesticHelpList, useHelpLogs, useOperationsRealtime, useRemoveHelpFromUnit } from '@/hooks/use-operations';
import { useHousehold } from '@/hooks/use-residents';
import { formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { HelpDialog, HelpPassCard, VerificationBadge } from '@/features/operations/help-shared';

/** Resident view: my household's help, their gate passes and today's entries. */
export default function MyDomesticHelpPage() {
  const help = useDomesticHelpList({ limit: 50 });
  const logs = useHelpLogs({ limit: 20 });
  const household = useHousehold();
  const remove = useRemoveHelpFromUnit();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useOperationsRealtime();
  const items: any[] = help.data?.items ?? [];
  const unitOptions = (household.data?.units ?? []).map((u: any) => ({ value: u.id, label: u.code }));
  return (
    <div>
      <PageHeader title="My domestic help" description="Register your maid, cook or driver once; share the passcode and they walk in without calls from the gate." actions={<PermissionGate permission="domestic_help:create_own"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Register help</Button></SubscriptionGate></PermissionGate>} />
      {help.isLoading ? <CardSkeleton count={2} /> : !items.length ? <EmptyState icon={<Sparkles />} title="No help registered yet" description="Add the people who work in your home so the gate recognises them." action={<Button onClick={() => setEditing('new')}><Plus /> Register help</Button>} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((h) => (
            <Card key={h.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {h.photoUrl ? <img src={h.photoUrl} alt={h.name} className="h-14 w-14 rounded-md object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/10 text-primary"><Sparkles /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">{h.name} <Badge variant="outline">{formatStatus(h.typeKey)}</Badge> <VerificationBadge status={h.verification?.status} />{h.status !== 'ACTIVE' ? <StatusBadge status={h.status} /> : null}{h.isInside ? <Badge variant="success">Inside now</Badge> : null}</p>
                    <p className="text-sm text-muted-foreground">{h.phone}{(h.units ?? []).filter((u: any) => u.active).map((u: any) => u.schedule).filter(Boolean).length ? ` · ${(h.units ?? []).filter((u: any) => u.active).map((u: any) => u.schedule).filter(Boolean).join(' / ')}` : ''}</p>
                    {h.units?.filter((u: any) => u.active).length > 1 ? <p className="text-xs text-muted-foreground">Also works for {h.units.filter((u: any) => u.active).map((u: any) => u.unitId?.code).filter(Boolean).join(', ')}</p> : null}
                    {h.blockedReason ? <p className="text-xs text-destructive">Blocked by the office: {h.blockedReason}</p> : null}
                  </div>
                </div>
                <HelpPassCard help={h} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(h)}><Pencil /> Edit</Button>
                  {(h.units ?? []).filter((u: any) => u.active && unitOptions.some((o: any) => o.value === (u.unitId?.id ?? u.unitId?._id ?? u.unitId))).map((u: any) => <Button key={u.unitId?.id ?? u.unitId} size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Stop ${h.name}'s access for ${u.unitId?.code ?? 'your unit'}?`, description: 'The passcode stops working for your flat.', destructive: true, confirmLabel: 'Remove' })) remove.mutate({ id: h.id, unitId: u.unitId?.id ?? u.unitId?._id ?? u.unitId }, { onSuccess: () => toast.success('Removed'), onError: (e) => toast.error(getErrorMessage(e)) }); }}><UserMinus /> Remove{unitOptions.length > 1 ? ` (${u.unitId?.code})` : ''}</Button>)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {(logs.data?.items ?? []).length ? <div className="mt-8"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Clock className="h-4 w-4" /> Recent gate activity</h2><ul className="divide-y rounded-lg border bg-card text-sm">{(logs.data?.items ?? []).map((l: any) => <li key={l.id} className="flex justify-between px-4 py-2"><span>{l.helpId?.name ?? 'Help'} {l.type === 'IN' ? 'entered' : 'left'}{l.gateId?.name ? ` via ${l.gateId.name}` : ''}</span><span className="text-muted-foreground">{formatDateTime(l.at)}</span></li>)}</ul></div> : null}
      <HelpDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} help={editing === 'new' ? null : editing} unitOptions={unitOptions} />
      {ConfirmElement}
    </div>
  );
}
