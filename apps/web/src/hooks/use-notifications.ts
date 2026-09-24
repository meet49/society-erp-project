import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth.store';

export const notificationKeys = {
  list: (params?: Record<string, unknown>) => ['notifications', 'list', params ?? {}] as const,
  unread: ['notifications', 'unread'] as const,
};

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
  priority: string;
  readAt: string | null;
  createdAt: string;
}

export const useNotifications = (params: { page?: number; limit?: number; unreadOnly?: boolean }) =>
  useQuery({ queryKey: notificationKeys.list(params), queryFn: () => http.getPage<AppNotification>('/notifications', params), placeholderData: keepPreviousData });

export const useUnreadCount = () => {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({ queryKey: notificationKeys.unread, queryFn: () => http.get<{ count: number }>('/notifications/unread-count'), enabled: authed, refetchInterval: 60_000 });
};

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }), meta: { silent: true } });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => http.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
}

/** Subscribes to realtime notifications: refreshes the inbox and shows a toast. Mount once in the shell. */
export function useRealtimeNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    return onSocketEvent<AppNotification>('notification', (n) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      const opts = n.priority === 'CRITICAL' || n.priority === 'HIGH' ? { duration: 8000 } : {};
      toast(n.title, { description: n.body, ...opts });
    });
  }, [qc]);
}
