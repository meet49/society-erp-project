import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function StatCard({ label, value, hint, icon, tone = 'default', to, loading, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive'; to?: string; loading?: boolean; className?: string }) {
  const toneClass = { default: 'bg-muted text-muted-foreground', primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/15 text-warning-foreground dark:text-warning', destructive: 'bg-destructive/10 text-destructive' }[tone];
  const body = (
    <Card className={cn('flex items-center gap-4 p-4 transition-shadow', to && 'hover:shadow-md', className)}>
      {icon ? <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5', toneClass)}>{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-7 w-20" /> : <p className="mt-0.5 truncate text-2xl font-semibold tabular">{value}</p>}
        {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>;
}
