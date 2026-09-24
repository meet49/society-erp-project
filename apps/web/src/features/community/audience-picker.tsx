import * as React from 'react';
import { Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBuildings, useUnitOptions } from '@/hooks/use-units';
import { useRoles, useSocietyUsers } from '@/hooks/use-society';
import { useAudiencePreview, type AudienceValue } from '@/hooks/use-community';
import { cn } from '@/lib/utils';

const TYPES = [{ value: 'ALL', label: 'Everyone' }, { value: 'BUILDING', label: 'Buildings' }, { value: 'UNIT_GROUP', label: 'Specific units' }, { value: 'ROLE', label: 'Roles' }, { value: 'CUSTOM', label: 'Specific people' }];
const RESIDENT_TYPES = ['OWNER', 'TENANT', 'FAMILY'];

function CheckList({ options, selected, onChange, searchable, empty = 'Nothing to choose from' }: { options: { value: string; label: string; description?: string }[]; selected: string[]; onChange: (v: string[]) => void; searchable?: boolean; empty?: string }) {
  const [q, setQ] = React.useState('');
  const list = q ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="rounded-md border">
      {searchable ? <div className="border-b p-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8" /></div> : null}
      <ul className="max-h-48 overflow-y-auto p-1 text-sm">
        {list.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted"><Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} /> <span className="truncate">{o.label}</span>{o.description ? <span className="truncate text-xs text-muted-foreground">{o.description}</span> : null}</label>
          </li>
        ))}
        {!list.length ? <li className="p-2 text-xs text-muted-foreground">{empty}</li> : null}
      </ul>
      {selected.length ? <p className="border-t px-2 py-1 text-xs text-muted-foreground">{selected.length} selected</p> : null}
    </div>
  );
}

/** Shared audience picker: who a notice / announcement / event / poll / survey reaches, with a live head-count. */
export function AudiencePicker({ value, onChange, className }: { value: AudienceValue; onChange: (v: AudienceValue) => void; className?: string }) {
  const buildings = useBuildings();
  const roles = useRoles();
  const units = useUnitOptions(value.type === 'UNIT_GROUP');
  const users = useSocietyUsers({ limit: 200 });
  const preview = useAudiencePreview();
  const key = JSON.stringify(value);
  React.useEffect(() => {
    const t = setTimeout(() => preview.mutate(value), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (patch: Partial<AudienceValue>) => onChange({ ...value, ...patch });
  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="aud-type">Audience</Label>
          <Select value={value.type} onValueChange={(v) => set({ type: v as AudienceValue['type'] })}><SelectTrigger id="aud-type"><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>Narrow to</Label>
          <div className="flex flex-wrap gap-1.5 pt-1">{RESIDENT_TYPES.map((t) => <button key={t} type="button" onClick={() => set({ residentTypes: value.residentTypes.includes(t) ? value.residentTypes.filter((x) => x !== t) : [...value.residentTypes, t] })} className={cn('rounded-full border px-2.5 py-1 text-xs', value.residentTypes.includes(t) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{t.charAt(0) + t.slice(1).toLowerCase()}s</button>)}<span className="self-center text-xs text-muted-foreground">{value.residentTypes.length ? '' : 'all residents'}</span></div>
        </div>
      </div>
      {value.type === 'BUILDING' ? <CheckList options={(buildings.data ?? []).map((b: any) => ({ value: b.id, label: b.name, description: b.code }))} selected={value.buildingIds} onChange={(v) => set({ buildingIds: v })} empty="No buildings yet" /> : null}
      {value.type === 'UNIT_GROUP' ? <CheckList searchable options={units.data ?? []} selected={value.unitIds} onChange={(v) => set({ unitIds: v })} empty="No units yet" /> : null}
      {value.type === 'ROLE' ? <CheckList options={(roles.data ?? []).map((r: any) => ({ value: r.key, label: r.name, description: r.key }))} selected={value.roleKeys} onChange={(v) => set({ roleKeys: v })} /> : null}
      {value.type === 'CUSTOM' ? <CheckList searchable options={(users.data?.items ?? []).map((m: any) => ({ value: m.user?.id ?? m.userId, label: m.user?.name ?? m.name ?? '—', description: m.user?.email ?? '' }))} selected={value.userIds} onChange={(v) => set({ userIds: v })} empty="No members found" /> : null}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> {preview.isPending ? 'Counting…' : preview.data ? `Reaches ${preview.data.count} ${preview.data.count === 1 ? 'person' : 'people'} · ${preview.data.label}` : ''}</p>
    </div>
  );
}
