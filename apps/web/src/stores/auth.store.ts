import { create } from 'zustand';
import type { AccessContext } from '@society-erp/shared';
import { tokenStorage } from '@/lib/storage';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  accessToken: string | null;
  context: AccessContext | null;
  status: AuthStatus;
  setSession: (tokens: { accessToken: string; refreshToken: string }, context?: AccessContext | null) => void;
  setAccessToken: (token: string) => void;
  setContext: (context: AccessContext | null) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
}

/** Client/global auth state. Server state (lists, entities) lives in React Query, never here. */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  context: null,
  status: 'idle',
  setSession: (tokens, context) => {
    tokenStorage.setRefresh(tokens.refreshToken);
    set((s) => ({ accessToken: tokens.accessToken, context: context === undefined ? s.context : context, status: 'authenticated' }));
  },
  setAccessToken: (token) => set({ accessToken: token }),
  setContext: (context) => set({ context, status: context ? 'authenticated' : 'anonymous' }),
  setStatus: (status) => set({ status }),
  clear: () => {
    tokenStorage.clear();
    set({ accessToken: null, context: null, status: 'anonymous' });
  },
}));

export const selectUser = (s: AuthState) => s.context?.user ?? null;
export const selectSociety = (s: AuthState) => s.context?.society ?? null;
