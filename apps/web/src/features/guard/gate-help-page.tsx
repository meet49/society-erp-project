import * as React from 'react';
import { toast } from 'sonner';
import { Search, LogIn, LogOut, Car, Sparkles, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHelpLookup, useHelpPunch, useVehicleLookup } from '@/hooks/use-operations';
import { formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { GatePicker, OfflineBanner, useSelectedGate } from './gate-shared';

function HelpTab() {
  const [code, setCode] = React.useState('');
  const lookup = useHelpLookup();
  const punch = useHelpPunch();
  const [gateId] = useSelectedGate();
  const r = lookup.data;
  const find = () => { if (code.trim().length >= 4) lookup.mutate(code.trim(), { onError: (e) => toast.error(getErrorMessage(e)) }); };
  const act = (direction: 'in' | 'out') => punch.mutate({ id: r.help.id, direction, gateId }, { onSuccess: (res: any) => { toast.success(res?.queued ? 'Saved offline — will sync when back online' : `${r.help.name} ${direction === 'in' ? 'checked in' : 'checked out'}`); lookup.reset(); setCode(''); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="space-y-4">
      <div className="flex gap-2"><Input className="h-12 text-lg" inputMode="numeric" placeholder="Helper's passcode" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') find(); }} /><Button className="h-12" loading={lookup.isPending} onClick={find}><Search /> Find</Button></div>
      {r ? (
        !r.found ? <p className="rounded-md bg-destructive/10 p-3 text-sm">{r.reason}</p> : (
          <Card className={r.allowed ? 'border-success/50' : 'border-destructive/50'}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                {r.help.photoUrl ? <img src={r.help.photoUrl} alt={r.help.name} className="h-20 w-20 rounded-md object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-md bg-muted"><Sparkles /></span>}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{r.help.name}</p>
                  <p className="text-sm text-muted-foreground">{formatStatus(r.help.typeKey)} · {r.help.phone}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">{r.help.verification === 'VERIFIED' ? <Badge variant="success"><ShieldCheck className="mr-1 h-3 w-3" />Verified</Badge> : <Badge variant="warning"><ShieldAlert className="mr-1 h-3 w-3" />{formatStatus(r.help.verification)}</Badge>}{r.help.isInside ? <Badge variant="info">Inside</Badge> : null}</p>
                  <p className="mt-1 text-sm">Works for: <span className="font-medium">{r.help.units.map((u: any) => u.code).join(', ')}</span></p>
                </div>
              </div>
              {!r.allowed ? <p className="rounded-md bg-destructive/10 p-2 text-sm font-medium">{r.reason}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-14 text-base" disabled={!r.allowed || r.help.isInside} loading={punch.isPending} onClick={() => act('in')}><LogIn /> Check in</Button>
                <Button className="h-14 text-base" variant="outline" disabled={!r.help.isInside} loading={punch.isPending} onClick={() => act('out')}><LogOut /> Check out</Button>
              </div>
            </CardContent>
          </Card>
        )
      ) : <p className="text-sm text-muted-foreground">Ask for the 6-digit passcode or scan their QR. Entries and exits are logged and the family is notified.</p>}
    </div>
  );
}

function VehicleTab() {
  const [q, setQ] = React.useState('');
  const results = useVehicleLookup(q);
  return (
    <div className="space-y-3">
      <Input className="h-12 text-lg uppercase" placeholder="Number plate or sticker" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length < 2 ? <p className="text-sm text-muted-foreground">Type part of the plate (last 4 digits work) or the sticker number.</p> : results.isLoading ? <p className="text-sm text-muted-foreground">Searching…</p> : !(results.data ?? []).length ? <p className="rounded-md bg-destructive/10 p-3 text-sm">No registered vehicle matches. Treat it as a visitor vehicle.</p> : (
        <ul className="space-y-2">{(results.data ?? []).map((v: any) => <li key={v.id} className="flex items-center gap-3 rounded-md border bg-card p-3"><Car className="h-6 w-6 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="font-mono text-lg font-semibold">{v.number}</span><span className="block text-sm text-muted-foreground">{[formatStatus(v.type), v.make, v.model, v.color].filter(Boolean).join(' · ')}</span></span><span className="text-right text-sm"><span className="block font-semibold">{v.unitCode ?? '—'}</span>{v.owner ? <span className="block text-muted-foreground">{v.owner}</span> : null}{v.parkingSlot ? <span className="block text-xs text-muted-foreground">Slot {v.parkingSlot}</span> : null}{v.stickerNumber ? <Badge variant="outline">{v.stickerNumber}</Badge> : null}</span></li>)}</ul>
      )}
    </div>
  );
}

/** Guard screen: domestic help entry by passcode and vehicle lookup. */
export default function GateHelpPage() {
  return (
    <div>
      <PageHeader title="Help & vehicles" actions={<GatePicker />} />
      <OfflineBanner />
      <Tabs defaultValue="help">
        <TabsList className="mb-4 grid w-full grid-cols-2"><TabsTrigger value="help"><Sparkles className="mr-1 h-4 w-4" />Domestic help</TabsTrigger><TabsTrigger value="vehicles"><Car className="mr-1 h-4 w-4" />Vehicles</TabsTrigger></TabsList>
        <TabsContent value="help"><HelpTab /></TabsContent>
        <TabsContent value="vehicles"><VehicleTab /></TabsContent>
      </Tabs>
    </div>
  );
}
