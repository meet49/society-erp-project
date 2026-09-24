import { AlertTriangle, Lock, ShieldOff, WifiOff, CreditCard, Blocks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/api-client';
import { getFriendlyMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export function ErrorState({ error, onRetry, className, title }: { error: unknown; onRetry?: () => void; className?: string; title?: string }) {
  const e = toApiError(error);
  const code = e.code;
  const icon =
    code === 'PERMISSION_DENIED' || code === 'FORBIDDEN' ? <Lock /> : code.startsWith('SUBSCRIPTION') ? <CreditCard /> : code.startsWith('MODULE') ? <Blocks /> : code === 'NETWORK_ERROR' ? <WifiOff /> : code === 'FEATURE_DISABLED' ? <ShieldOff /> : <AlertTriangle />;
  const action =
    code === 'MODULE_DISABLED' ? (
      <Button asChild variant="outline" size="sm">
        <Link to="/app/settings/modules">Open module settings</Link>
      </Button>
    ) : code === 'MODULE_NOT_IN_PLAN' || code === 'PLAN_LIMIT_EXCEEDED' || code.startsWith('SUBSCRIPTION') ? (
      <Button asChild variant="outline" size="sm">
        <Link to="/app/settings/subscription">View subscription</Link>
      </Button>
    ) : onRetry ? (
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    ) : null;
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&>svg]:h-6 [&>svg]:w-6">{icon}</div>
      <h3 className="text-sm font-semibold">{title ?? (e.status === 404 ? 'Not found' : 'Something went wrong')}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{getFriendlyMessage(e)}</p>
      {e.requestId ? <p className="mt-1 text-xs text-muted-foreground">Reference: {e.requestId}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
