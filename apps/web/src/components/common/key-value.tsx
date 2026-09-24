import * as React from 'react';
import { cn } from '@/lib/utils';

export function KeyValue({ items, className, columns = 2 }: { items: { label: string; value: React.ReactNode; span?: number }[]; className?: string; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3' }[columns], className)}>
      {items.map((it) => (
        <div key={it.label} className={cn(it.span === 2 && 'sm:col-span-2', it.span === 3 && 'sm:col-span-3')}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-sm">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
