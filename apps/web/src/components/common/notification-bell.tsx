import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount, type AppNotification } from '@/hooks/use-notifications';
import { formatRelative, cn } from '@/lib/utils';
import { EmptyState } from '@/components/common/empty-state';

export function NotificationBell() {
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const list = useNotifications({ limit: 12 });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const count = unread.data?.count ?? 0;

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${count ? ` (${count} unread)` : ''}`}>
          <Bell />
          {count > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{count > 99 ? '99+' : count}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={!count || markAll.isPending}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {list.data?.items.length ? (
            list.data.items.map((n) => (
              <button key={n.id} type="button" onClick={() => open(n)} className={cn('flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/60 last:border-0', !n.readAt && 'bg-accent/40')}>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
              </button>
            ))
          ) : (
            <EmptyState title="You're all caught up" compact className="m-3 border-0" />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
