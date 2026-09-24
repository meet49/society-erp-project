import * as React from 'react';
import { toast } from 'sonner';
import { LogIn, LogOut, Keyboard, Camera, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/common/status-badge';
import { useGateAction, useLookupPass } from '@/hooks/use-visitors';
import { GatePicker, OfflineBanner, PhotoCapture, useSelectedGate } from '@/features/guard/gate-shared';
import { cn, formatDateTime, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** Camera QR scanner (html5-qrcode, loaded lazily) with a passcode fallback. */
function QrScanner({ onCode, active }: { onCode: (code: string) => void; active: boolean }) {
  const ref = React.useRef<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode('gate-qr-reader', { verbose: false });
        ref.current = scanner;
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (text: string) => { onCode(text); }, () => undefined);
      } catch (err) {
        setError('Camera not available. Enter the passcode instead.');
        void err;
      }
    })();
    return () => {
      cancelled = true;
      const s = ref.current;
      ref.current = null;
      if (s) s.stop().catch(() => undefined);
    };
  }, [active, onCode]);
  return (
    <div>
      <div id="gate-qr-reader" className={cn('overflow-hidden rounded-lg bg-black', !active && 'hidden')} style={{ minHeight: active ? 260 : 0 }} />
      {error ? <p className="mt-2 text-sm text-warning-foreground dark:text-warning">{error}</p> : null}
    </div>
  );
}

export default function GateScanPage() {
  const lookup = useLookupPass();
  const action = useGateAction();
  const [gateId] = useSelectedGate();
  const [mode, setMode] = React.useState<'camera' | 'code'>('code');
  const [code, setCode] = React.useState('');
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<any>(null);
  const lastScan = React.useRef<{ code: string; at: number } | null>(null);
  const find = React.useCallback((value: string) => {
    const v = value.trim();
    if (!v) return;
    if (lastScan.current && lastScan.current.code === v && Date.now() - lastScan.current.at < 4000) return;
    lastScan.current = { code: v, at: Date.now() };
    lookup.mutate(v, { onSuccess: (r) => { setResult(r); setPhoto(null); if (navigator.vibrate) navigator.vibrate(60); }, onError: (e) => { setResult(null); toast.error(getErrorMessage(e)); } });
  }, [lookup]);
  const checkIn = () => action.mutate({ url: `/visitors/${result.id}/check-in`, body: { gateId: gateId || undefined, photo: photo ?? undefined }, label: `Check-in ${result.name}` }, { onSuccess: (r) => { toast[r.queued ? 'warning' : 'success'](r.queued ? 'Saved offline — will sync when online' : `${result.name} checked in`); setResult(null); setCode(''); }, onError: (e) => toast.error(getErrorMessage(e)) });
  const checkOut = () => action.mutate({ url: `/visitors/${result.id}/check-out`, body: { gateId: gateId || undefined }, label: `Check-out ${result.name}` }, { onSuccess: (r) => { toast[r.queued ? 'warning' : 'success'](r.queued ? 'Saved offline — will sync when online' : `${result.name} checked out`); setResult(null); setCode(''); }, onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="space-y-4">
      <OfflineBanner />
      <div className="flex items-center justify-between gap-2"><h1 className="text-lg font-semibold">Scan pass</h1><GatePicker /></div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant={mode === 'camera' ? 'default' : 'outline'} onClick={() => setMode('camera')}><Camera /> Camera</Button>
        <Button variant={mode === 'code' ? 'default' : 'outline'} onClick={() => setMode('code')}><Keyboard /> Passcode</Button>
      </div>
      {mode === 'camera' ? <QrScanner active={mode === 'camera' && !result} onCode={find} /> : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); find(code); }}>
          <div className="flex-1 space-y-1"><Label htmlFor="gate-code" className="sr-only">Passcode</Label><Input id="gate-code" inputMode="numeric" autoComplete="off" placeholder="6-digit passcode" className="h-14 text-center text-2xl tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} /></div>
          <Button type="submit" size="lg" className="h-14" loading={lookup.isPending} disabled={code.length < 4}>Find</Button>
        </form>
      )}
      {result ? (
        <div className={cn('rounded-lg border p-4', result.valid ? 'border-success/50 bg-success/5' : 'border-destructive/50 bg-destructive/5')}>
          <div className="flex items-start gap-3">
            {result.photoUrl ? <img src={result.photoUrl} alt="" className="h-16 w-16 rounded-md object-cover" /> : null}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-lg font-semibold">{result.valid ? <ShieldCheck className="h-5 w-5 text-success" /> : <ShieldAlert className="h-5 w-5 text-destructive" />}{result.name}</p>
              <p className="text-sm">{formatStatus(result.categoryKey)}{result.companyName ? ` · ${result.companyName}` : ''} · Unit <strong>{result.unitId?.code}</strong>{result.hostUserId?.name ? ` · host ${result.hostUserId.name}` : ''}</p>
              <p className="text-xs text-muted-foreground">Valid {formatDateTime(result.validFrom)} → {formatDateTime(result.validUntil)}{result.vehicleNumber ? ` · ${result.vehicleNumber}` : ''}{result.guestCount > 1 ? ` · ${result.guestCount} guests` : ''}</p>
              <div className="mt-1 flex items-center gap-2"><StatusBadge status={result.status} />{!result.valid && result.reason ? <Badge variant="destructive">{result.reason}</Badge> : null}</div>
            </div>
          </div>
          {result.valid ? <div className="mt-3 space-y-3"><PhotoCapture value={photo} onChange={setPhoto} label="Photo (optional)" /><Button size="lg" className="h-14 w-full text-base" loading={action.isPending} onClick={checkIn}><LogIn /> Check in {result.name}</Button></div> : result.status === 'CHECKED_IN' ? <Button size="lg" variant="outline" className="mt-3 h-14 w-full text-base" loading={action.isPending} onClick={checkOut}><LogOut /> Check out {result.name}</Button> : <p className="mt-3 text-sm text-muted-foreground">Ask the resident to share a new pass, or register a walk-in so they can approve it.</p>}
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setResult(null); setCode(''); }}>Scan another</Button>
        </div>
      ) : null}
    </div>
  );
}
