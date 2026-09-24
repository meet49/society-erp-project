import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { API_ORIGIN } from '@/lib/api-client';

let socket: Socket | null = null;
let currentToken: string | null = null;
const listeners = new Map<string, Set<(payload: any) => void>>();

function attachListeners(s: Socket): void {
  for (const [event, handlers] of listeners) for (const h of handlers) s.on(event, h);
}

/** Connects (or reconnects) the realtime channel for the current access token. Rooms are assigned server-side. */
export function connectSocket(token: string | null): void {
  if (!token) {
    disconnectSocket();
    return;
  }
  if (socket && currentToken === token) return;
  disconnectSocket();
  currentToken = token;
  socket = io(API_ORIGIN || '/', { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 10_000 });
  attachListeners(socket);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentToken = null;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Subscribe to a server-pushed event. Returns an unsubscribe function. Survives reconnects. */
export function onSocketEvent<T = any>(event: string, handler: (payload: T) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  socket?.on(event, handler);
  return () => {
    listeners.get(event)?.delete(handler);
    socket?.off(event, handler);
  };
}

// keep the socket bound to the active session
useAuthStore.subscribe((state, prev) => {
  if (state.accessToken !== prev.accessToken) connectSocket(state.status === 'authenticated' ? state.accessToken : null);
});
