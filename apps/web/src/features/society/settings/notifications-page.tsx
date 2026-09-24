import * as React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PageSkeleton } from '@/components/common/loading-state';
import { useSaveSocietySetting, useSocietySetting } from '@/hooks/use-society';

const CHANNELS = [
  { key: 'IN_APP', label: 'In-app', hint: 'Always stored; shown in the notification centre and pushed over realtime sockets.' },
  { key: 'EMAIL', label: 'Email', hint: 'Invoices, receipts, complaint updates, notices.' },
  { key: 'WHATSAPP', label: 'WhatsApp', hint: 'Requires a configured WhatsApp provider on the platform.' },
  { key: 'PUSH', label: 'Push', hint: 'Browser / installed app notifications.' },
] as const;

const EVENTS = [
  ['invoice.created', 'Invoice issued'],
  ['invoice.overdue', 'Invoice overdue reminder'],
  ['payment.received', 'Payment receipt'],
  ['complaint.created', 'Complaint raised'],
  ['complaint.updated', 'Complaint status changed'],
  ['complaint.escalated', 'Complaint escalated'],
  ['visitor.pending', 'Walk-in visitor waiting'],
  ['visitor.checked_in', 'Visitor checked in'],
  ['visitor.pass_created', 'Visitor pass created'],
  ['delivery.arrived', 'Delivery at gate'],
  ['notice.published', 'Notice published'],
  ['amenity.booking_confirmed', 'Amenity booking confirmed'],
  ['emergency.sos', 'SOS alert'],
  ['emergency.broadcast', 'Emergency announcement'],
  ['event.created', 'Event announced'],
  ['poll.created', 'Poll opened'],
  ['meeting.scheduled', 'Meeting scheduled'],
] as const;

export default function NotificationSettingsPage() {
  const setting = useSocietySetting('notifications.channels');
  const save = useSaveSocietySetting();
  const [draft, setDraft] = React.useState<any>(null);
  const value = draft ?? setting.data;
  if (setting.isLoading || !value) return <PageSkeleton />;
  const events: Record<string, string[]> = value.events ?? {};
  const setEvent = (event: string, channel: string, on: boolean) => {
    const current = events[event] ?? CHANNELS.filter((c) => value[c.key]).map((c) => c.key);
    const next = on ? [...new Set([...current, channel])] : current.filter((c) => c !== channel);
    setDraft({ ...value, events: { ...events, [event]: next } });
  };
  return (
    <div>
      <PageHeader title="Notification channels" description="Choose which channels your society uses and override them per event. Members can further mute channels in their own profile." actions={<Button onClick={() => save.mutate({ key: 'notifications.channels', value }, { onSuccess: () => { toast.success('Notification settings saved'); setDraft(null); } })} loading={save.isPending} disabled={!draft}>Save changes</Button>} />
      <SettingsNav />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-sm">Default channels</CardTitle><CardDescription>Used for every event without an override.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {CHANNELS.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div><Label>{c.label}</Label><p className="text-xs text-muted-foreground">{c.hint}</p></div>
                <Switch checked={Boolean(value[c.key])} disabled={c.key === 'IN_APP'} onCheckedChange={(v) => setDraft({ ...value, [c.key]: v })} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Per-event overrides</CardTitle><CardDescription>Tick the channels for each event. Unticked rows fall back to the defaults.</CardDescription></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th className="py-2">Event</th>{CHANNELS.map((c) => <th key={c.key} className="py-2 text-center">{c.label}</th>)}<th /></tr></thead>
                <tbody>
                  {EVENTS.map(([key, label]) => {
                    const custom = key in events;
                    const active = custom ? events[key] : CHANNELS.filter((c) => value[c.key]).map((c) => c.key);
                    return (
                      <tr key={key} className="border-t">
                        <td className="py-2"><p>{label}</p><code className="text-[10px] text-muted-foreground">{key}</code></td>
                        {CHANNELS.map((c) => <td key={c.key} className="py-2 text-center"><Checkbox checked={active.includes(c.key)} onCheckedChange={(v) => setEvent(key, c.key, v === true)} aria-label={`${label} via ${c.label}`} /></td>)}
                        <td className="py-2 text-right">{custom ? <Button variant="ghost" size="sm" onClick={() => { const next = { ...events }; delete next[key]; setDraft({ ...value, events: next }); }}>Use defaults</Button> : <span className="text-xs text-muted-foreground">defaults</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
