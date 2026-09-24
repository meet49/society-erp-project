import { cn } from '@/lib/utils';

export function Progress({ value, max = 100, className, tone = 'primary' }: { value: number; max?: number; className?: string; tone?: 'primary' | 'success' | 'warning' | 'destructive' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cn('h-full rounded-full transition-all', { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive' }[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
