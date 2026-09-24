import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessContext, LoginInput, LoginResponse, AuthUser } from '@society-erp/shared';
import { http, refreshSession } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { tokenStorage } from '@/lib/storage';

export const authKeys = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
  invitation: (token: string) => ['auth', 'invitation', token] as const,
};

export function useAuth() {
  const context = useAuthStore((s) => s.context);
  const status = useAuthStore((s) => s.status);
  return { context, user: context?.user ?? null, society: context?.society ?? null, status, isAuthenticated: status === 'authenticated' && Boolean(context) };
}

/** Boots the session on app load: refresh token → access token → /auth/me. */
export async function bootstrapSession(): Promise<AccessContext | null> {
  const store = useAuthStore.getState();
  if (!tokenStorage.getRefresh()) {
    store.setStatus('anonymous');
    return null;
  }
  store.setStatus('loading');
  const token = await refreshSession();
  if (!token) {
    store.clear();
    return null;
  }
  try {
    const context = await http.get<AccessContext>('/auth/me');
    store.setContext(context);
    connectSocket(token);
    return context;
  } catch {
    store.clear();
    return null;
  }
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: LoginInput) => http.post<LoginResponse>('/auth/login', input),
    onSuccess: (data) => {
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.context);
      connectSocket(data.accessToken);
    },
    meta: { silent: true },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async () => {
      const refreshToken = tokenStorage.getRefresh();
      try {
        await http.post('/auth/logout', { refreshToken });
      } catch {
        /* already invalid */
      }
    },
    onSettled: () => {
      disconnectSocket();
      clear();
      qc.clear();
    },
    meta: { silent: true },
  });
}

export function useSwitchContext() {
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: { societyId?: string; platform?: boolean }) => http.post<LoginResponse>('/auth/switch', input),
    onSuccess: (data) => {
      qc.clear();
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.context);
      connectSocket(data.accessToken);
    },
  });
}

/** Re-fetches the access context (after role/module/subscription changes) and stores it. */
export function useRefreshContext() {
  const setContext = useAuthStore((s) => s.setContext);
  return useMutation({
    mutationFn: () => http.get<AccessContext>('/auth/me'),
    onSuccess: (ctx) => setContext(ctx),
    meta: { silent: true },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (input: { currentPassword: string; newPassword: string }) => http.post('/auth/change-password', input) });
}

export function useUpdateProfile() {
  const setContext = useAuthStore((s) => s.setContext);
  const context = useAuthStore((s) => s.context);
  return useMutation({
    mutationFn: (input: { name?: string; phone?: string; avatarUrl?: string; preferences?: Record<string, unknown> }) => http.patch<AuthUser>('/auth/profile', input),
    onSuccess: (user) => {
      if (context) setContext({ ...context, user });
    },
  });
}

export function useSessions() {
  return useQuery({ queryKey: authKeys.sessions, queryFn: () => http.get<any[]>('/auth/sessions') });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (familyId: string) => http.delete(`/auth/sessions/${familyId}`), onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.sessions }) });
}

export function useRevokeAllSessions() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => http.post<{ revoked: number }>('/auth/sessions/revoke-all'), onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.sessions }) });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (input: { email: string }) => http.post('/auth/forgot-password', input), meta: { silent: true } });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (input: { token: string; password: string }) => http.post('/auth/reset-password', input), meta: { silent: true } });
}

export function useInvitation(token: string | null) {
  return useQuery({ queryKey: authKeys.invitation(token ?? ''), queryFn: () => http.get<any>(`/auth/invitations/${token}`), enabled: Boolean(token), retry: false, meta: { silent: true } });
}

export function useAcceptInvitation() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: { token: string; name?: string; password: string }) => http.post<LoginResponse>('/auth/invitations/accept', input),
    onSuccess: (data) => {
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.context);
      connectSocket(data.accessToken);
    },
    meta: { silent: true },
  });
}
