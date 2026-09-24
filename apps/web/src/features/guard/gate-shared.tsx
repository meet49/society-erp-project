import * as React from 'react';
import { Camera, RefreshCw, WifiOff, CloudUpload, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/common/status-badge';
import { useGates, useOfflineQueue } from '@/hooks/use-visitors';
import { cn, formatRelative, formatStatus, formatTime } from '@/lib/utils';

const GATE_KEY = 'society-erp:gate';
export function useSelectedGate(): [string, (id: string) => void, any[]] {
  const gates = useGates();
  const [gateId, setGate] = React.useState<string>(() => { try { return localStorage.getItem(GATE_KEY) ?? ''; } catch { return ''; } });
  React.useEffect(() => { if (!gateId && gates.data?.length) setGate((gates.data.find((g: any) => g.isDefault) ?? gates.data[0]).id); }, [gates.data, gateId]);
  const set = (id: string) => { setGate(id); try { localStorage.setItem(GATE_KEY, id); } catch { /* ignore */ } };
  return [gateId, set, gates.data ?? []];
}

export function GatePicker() {
  const [gateId, setGate, gates] = useSelectedGate();
  if (gates.length <= 1) return null;
  return (
    <div className="flex items-center gap-2"><Label className="text-xs text-muted-foreground">Gate</Label><Select value={gateId} onValueChange={setGate}><SelectTrigger className="h-9 w-40"><SelectValue placeholder="Gate" /></SelectTrigger><SelectContent>{gates.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
  );
}

/** Shows queued (offline) actions so the guard knows nothing is lost and nothing is faked as done. */
export function OfflineBanner() {
  const q = useOfflineQueue();
  if (q.online && !q.pending.length) return null;
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm', q.online ? 'border-primary/40 bg-primary/5' : 'border-warning/50 bg-warning/10')}>
      <span className="flex items-center gap-2">{q.online ? <CloudUpload className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{q.online ? `Syncing ${q.pending.length} pending action(s)…` : `Offline · ${q.pending.length} action(s) will sync when back online`}</span>
      {q.pending.length ? <Badge variant="warning">{q.pending.length}</Badge> : <Check className="h-4 w-4 text-success" />}
    </div>
  );
}

/** Camera / file capture producing a compressed JPEG data URL (≤ ~800px) for visitor photos. */
export function PhotoCapture({ value, onChange, label = 'Take photo' }: { value: string | null; onChange: (dataUrl: string | null) => void; label?: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handle = (file: File | undefined) => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      onChange(canvas.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  return (
    <div className="flex items-center gap-3">
      {value ? <img src={value} alt="Visitor" className="h-20 w-20 rounded-md object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-muted-foreground"><Camera className="h-6 w-6" /></div>}
      <div className="flex flex-col gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Camera /> {value ? 'Retake' : label}</Button>
        {value ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button> : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files?.[0])} aria-label={label} />
    </div>
  );
}

export function VisitorCard({ v, actions, compact }: { v: any; actions?: React.ReactNode; compact?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{v.name}{v.guestCount > 1 ? <span className="ml-1 text-xs text-muted-foreground">+{v.guestCount - 1}</span> : null}</p>
          <p className="truncate text-xs text-muted-foreground">{formatStatus(v.categoryKey)}{v.companyName ? ` · ${v.companyName}` : ''} · Unit {v.unitId?.code ?? '—'}{v.vehicleNumber ? ` · ${v.vehicleNumber}` : ''}</p>
          {!compact ? <p className="text-xs text-muted-foreground">{v.status === 'CHECKED_IN' ? `In since ${formatTime(v.checkInAt)}${v.checkInGateId?.name ? ` · ${v.checkInGateId.name}` : ''}` : v.status === 'PENDING' ? `Waiting for ${v.hostUserId?.name ?? 'resident'} · ${formatRelative(v.approvalRequestedAt ?? v.createdAt)}` : v.expectedAt ? `Expected ${formatRelative(v.expectedAt)}` : formatRelative(v.createdAt)}</p> : null}
        </div>
        <StatusBadge status={v.status} />
      </div>
      {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return <Button variant="ghost" size="icon" aria-label="Refresh" onClick={onClick}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>;
}
