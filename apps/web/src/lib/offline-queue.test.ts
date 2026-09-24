import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, http: { ...actual.http, post: (...args: unknown[]) => post(...args) } };
});

import { ApiError } from '@/lib/api-client';
import { offlineQueue } from '@/lib/offline-queue';

const goOffline = () => window.dispatchEvent(new Event('offline'));
const goOnline = () => window.dispatchEvent(new Event('online'));
const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * The guard app must never pretend an action succeeded while offline: it queues with an idempotency key,
 * replays in order when the network returns, and drops (visibly) anything the server rejects.
 */
describe('offline queue', () => {
  beforeEach(() => { post.mockReset(); offlineQueue.start(); goOnline(); });

  it('posts immediately when online and adds a clientRef', async () => {
    post.mockResolvedValueOnce({ id: 'v1', status: 'CHECKED_IN' });
    const r = await offlineQueue.run({ method: 'post', url: '/visitors/1/check-in', body: { gateId: 'g1' }, label: 'Check in' });
    expect(r.queued).toBe(false);
    expect(r.data).toEqual({ id: 'v1', status: 'CHECKED_IN' });
    expect(post).toHaveBeenCalledWith('/visitors/1/check-in', expect.objectContaining({ gateId: 'g1', clientRef: expect.any(String) }));
  });

  it('queues while offline, keeps the same clientRef, and replays in order when back online', async () => {
    goOffline();
    const a = await offlineQueue.run({ method: 'post', url: '/a', body: { clientRef: 'ref-a' }, label: 'A' });
    const b = await offlineQueue.run({ method: 'post', url: '/b', body: {}, label: 'B' });
    expect(a.queued).toBe(true);
    expect(b.queued).toBe(true);
    expect(post).not.toHaveBeenCalled();
    expect(offlineQueue.getState().pending.map((p) => p.url)).toEqual(['/a', '/b']);
    post.mockResolvedValue({ ok: true });
    goOnline();
    for (let i = 0; i < 5 && offlineQueue.getState().pending.length; i += 1) await settle();
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/a', '/b']);
    expect(post.mock.calls[0][1]).toMatchObject({ clientRef: 'ref-a' });
    expect(offlineQueue.getState().pending).toHaveLength(0);
  });

  it('treats a network failure during a live call as going offline and queues the action', async () => {
    post.mockRejectedValueOnce(new ApiError({ code: 'NETWORK_ERROR', message: 'offline', status: 0 }));
    const r = await offlineQueue.run({ method: 'post', url: '/c', body: {}, label: 'C' });
    expect(r.queued).toBe(true);
    expect(offlineQueue.getState().online).toBe(false);
    expect(offlineQueue.getState().pending.some((p) => p.url === '/c')).toBe(true);
    post.mockResolvedValue({ ok: true });
    goOnline();
    for (let i = 0; i < 5 && offlineQueue.getState().pending.length; i += 1) await settle();
    expect(offlineQueue.getState().pending).toHaveLength(0);
  });

  it('surfaces a server rejection instead of queueing it, and drops rejected replays with the error kept for the guard', async () => {
    post.mockRejectedValueOnce(new ApiError({ code: 'CONFLICT', message: 'Already checked in', status: 409 }));
    await expect(offlineQueue.run({ method: 'post', url: '/d', body: {}, label: 'D' })).rejects.toMatchObject({ status: 409 });
    expect(offlineQueue.getState().pending).toHaveLength(0);
    goOffline();
    await offlineQueue.run({ method: 'post', url: '/e', body: {}, label: 'Walk-in Ravi' });
    post.mockRejectedValueOnce(new ApiError({ code: 'VALIDATION_ERROR', message: 'Unit not found', status: 422 }));
    goOnline();
    for (let i = 0; i < 5 && offlineQueue.getState().pending.length; i += 1) await settle();
    expect(offlineQueue.getState().pending).toHaveLength(0);
    expect(offlineQueue.getFailed()[0]).toMatchObject({ label: 'Walk-in Ravi', error: 'Unit not found' });
  });
});
