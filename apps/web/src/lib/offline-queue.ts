import { http } from '@/lib/api-client';
import { isApiError } from '@/lib/errors';

/**
 * Offline action queue for the guard app. Actions are persisted in IndexedDB with a client
 * reference (idempotency key) and replayed in order when connectivity returns. The server treats a
 * replayed clientRef as a no-op, so an action is never applied twice. Nothing is ever marked as
 * "done" locally until the server confirms it.
 */
export interface QueuedAction {
  id: string;
  createdAt: number;
  method: 'post';
  url: string;
  body: Record<string, unknown>;
  label: string;
  attempts: number;
  lastError?: string;
}

const DB_NAME = 'society-erp-offline';
const STORE = 'actions';
type Listener = (state: QueueState) => void;
export interface QueueState { pending: QueuedAction[]; syncing: boolean; online: boolean }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    t.onerror = () => reject(t.error);
  });
}

class OfflineQueue {
  private listeners = new Set<Listener>();
  private state: QueueState = { pending: [], syncing: false, online: typeof navigator === 'undefined' ? true : navigator.onLine };
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('online', () => { this.state.online = true; this.emit(); void this.flush(); });
    window.addEventListener('offline', () => { this.state.online = false; this.emit(); });
    void this.load().then(() => this.flush());
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState(): QueueState { return this.state; }

  private emit() { for (const l of this.listeners) l({ ...this.state, pending: [...this.state.pending] }); }

  private async load(): Promise<void> {
    try {
      const all = (await tx<QueuedAction[]>('readonly', (s) => s.getAll())) ?? [];
      this.state.pending = all.sort((a, b) => a.createdAt - b.createdAt);
      this.emit();
    } catch { /* no IndexedDB (private mode) → memory only */ }
  }

  /** Runs the request now when online; otherwise stores it and resolves with `{ queued: true }`. */
  async run<T = any>(action: Omit<QueuedAction, 'id' | 'createdAt' | 'attempts'>): Promise<{ queued: boolean; data?: T }> {
    const clientRef = (action.body.clientRef as string | undefined) ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const body = { ...action.body, clientRef };
    if (this.state.online) {
      try {
        const data = await http.post<T>(action.url, body);
        return { queued: false, data };
      } catch (err) {
        // network failure (no response) → queue; a server rejection is surfaced to the user
        if (isApiError(err) && err.status && err.status > 0) throw err;
        this.state.online = false;
      }
    }
    const item: QueuedAction = { ...action, body, id: clientRef, createdAt: Date.now(), attempts: 0 };
    this.state.pending.push(item);
    try { await tx('readwrite', (s) => s.put(item)); } catch { /* memory only */ }
    this.emit();
    return { queued: true };
  }

  async flush(): Promise<void> {
    if (this.state.syncing || !this.state.online || !this.state.pending.length) return;
    this.state.syncing = true;
    this.emit();
    for (const item of [...this.state.pending]) {
      try {
        await http.post(item.url, item.body);
        await this.remove(item.id);
      } catch (err) {
        item.attempts += 1;
        item.lastError = isApiError(err) ? err.message : 'Network error';
        // server said no (4xx): drop it so the queue never gets stuck, the guard sees the error label
        if (isApiError(err) && err.status && err.status >= 400 && err.status < 500) await this.remove(item.id, item.lastError);
        else { this.state.online = false; break; }
      }
    }
    this.state.syncing = false;
    this.emit();
  }

  private failed: { label: string; error: string; at: number }[] = [];
  getFailed() { return this.failed; }

  private async remove(id: string, error?: string): Promise<void> {
    const item = this.state.pending.find((p) => p.id === id);
    if (item && error) this.failed.unshift({ label: item.label, error, at: Date.now() });
    this.state.pending = this.state.pending.filter((p) => p.id !== id);
    try { await tx('readwrite', (s) => s.delete(id)); } catch { /* ignore */ }
  }
}

export const offlineQueue = new OfflineQueue();
