import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';
import { offlineQueue, type QueueState } from '@/lib/offline-queue';
import { onSocketEvent } from '@/lib/socket';

export const visitorKeys = {
  list: (params?: Record<string, unknown>) => ['visitors', 'list', params ?? {}] as const,
  detail: (id: string) => ['visitors', 'detail', id] as const,
  pass: (id: string) => ['visitors', 'pass', id] as const,
  board: ['visitors', 'board'] as const,
  timeline: ['visitors', 'timeline'] as const,
  stats: ['visitors', 'stats'] as const,
  gates: ['visitors', 'gates'] as const,
  settings: ['visitors', 'settings'] as const,
  deliveries: (params?: Record<string, unknown>) => ['deliveries', 'list', params ?? {}] as const,
  delivery: (id: string) => ['deliveries', 'detail', id] as const,
  atGate: ['deliveries', 'at-gate'] as const,
  deliveryStats: ['deliveries', 'stats'] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

// ---- queries
export const useVisitors = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: visitorKeys.list(params), queryFn: () => http.getPage<any>('/visitors', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useVisitor = (id: string) => useQuery({ queryKey: visitorKeys.detail(id), queryFn: () => http.get<any>(`/visitors/${id}`), enabled: Boolean(id) });
export const useVisitorPass = (id: string) => useQuery({ queryKey: visitorKeys.pass(id), queryFn: () => http.get<any>(`/visitors/${id}/pass`), enabled: Boolean(id) });
export const useGateBoard = () => useQuery({ queryKey: visitorKeys.board, queryFn: () => http.get<any>('/visitors/board'), refetchInterval: 30_000 });
export const useGateTimeline = () => useQuery({ queryKey: visitorKeys.timeline, queryFn: () => http.get<any[]>('/visitors/timeline'), refetchInterval: 60_000 });
export const useVisitorStats = () => useQuery({ queryKey: visitorKeys.stats, queryFn: () => http.get<any>('/visitors/stats') });
export const useGates = () => useQuery({ queryKey: visitorKeys.gates, queryFn: () => http.get<any[]>('/visitors/gates'), staleTime: 5 * 60_000 });
export const useVisitorSettings = () => useQuery({ queryKey: visitorKeys.settings, queryFn: () => http.get<any>('/visitors/settings') });
export const useDeliveries = (params: Record<string, unknown>) => useQuery({ queryKey: visitorKeys.deliveries(params), queryFn: () => http.getPage<any>('/deliveries', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useDelivery = (id: string) => useQuery({ queryKey: visitorKeys.delivery(id), queryFn: () => http.get<any>(`/deliveries/${id}`), enabled: Boolean(id) });
export const useDeliveriesAtGate = () => useQuery({ queryKey: visitorKeys.atGate, queryFn: () => http.get<any[]>('/deliveries/at-gate'), refetchInterval: 60_000 });
export const useDeliveryStats = () => useQuery({ queryKey: visitorKeys.deliveryStats, queryFn: () => http.get<any>('/deliveries/stats') });

/** Live gate updates: any change at the gate refreshes the board / lists. */
export function useGateRealtime(onDecision?: (d: { visitorId: string; visitorName: string; unitCode?: string; status: string; reason?: string }) => void) {
  const qc = useQueryClient();
  React.useEffect(() => {
    const offChanged = onSocketEvent('gate.changed', () => inv(qc, ['visitors'], ['deliveries']));
    const offDecision = onSocketEvent('gate.decision', (d: any) => { inv(qc, ['visitors']); onDecision?.(d); });
    return () => { offChanged(); offDecision(); };
  }, [qc, onDecision]);
}

/** Resident side: refresh visitor lists on approval requests / status changes. */
export function useVisitorRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => {
    const offs = ['visitors.changed', 'visitor.approval_requested', 'deliveries.changed'].map((e) => onSocketEvent(e, () => inv(qc, ['visitors'], ['deliveries'], ['notifications'])));
    return () => offs.forEach((f) => f());
  }, [qc]);
}

// ---- resident / admin mutations
export function usePreApproveVisitor() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/visitors', input), onSuccess: () => inv(qc, ['visitors']) }); }
export function useDecideVisitor() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, decision, reason }: { id: string; decision: 'approve' | 'deny'; reason?: string }) => http.post<any>(`/visitors/${id}/${decision}`, { reason }), onSuccess: () => inv(qc, ['visitors'], ['notifications']) }); }
export function useCancelVisitor() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/visitors/${id}/cancel`), onSuccess: () => inv(qc, ['visitors']) }); }
export function useSaveVisitorSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/visitors/settings', input), onSuccess: () => inv(qc, visitorKeys.settings, visitorKeys.board) }); }
export function useCreateGate() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/visitors/gates', input), onSuccess: () => inv(qc, visitorKeys.gates) }); }
export function useUpdateGate() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/visitors/gates/${id}`, input), onSuccess: () => inv(qc, visitorKeys.gates) }); }
export function useExportVisitors() { return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/visitors/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'visitors.csv'); } }); }
export function useAnnounceDelivery() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/deliveries/announce', input), onSuccess: () => inv(qc, ['deliveries']) }); }
export function useDeliveryStatus() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; status: string; collectedByName?: string; note?: string }) => http.post<any>(`/deliveries/${id}/status`, input), onSuccess: () => inv(qc, ['deliveries']) }); }

// ---- guard mutations (offline-capable: queued with a clientRef when the network is down)
export const useLookupPass = () => useMutation({ mutationFn: (code: string) => http.post<any>('/visitors/lookup', { code }) });
export function useGateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; body: Record<string, unknown>; label: string }) => offlineQueue.run(input as any),
    onSuccess: () => inv(qc, ['visitors'], ['deliveries']),
  });
}

/** Subscribes to the offline queue (pending actions, online flag). */
export function useOfflineQueue(): QueueState {
  const [state, setState] = React.useState<QueueState>(() => offlineQueue.getState());
  React.useEffect(() => { offlineQueue.start(); return offlineQueue.subscribe(setState); }, []);
  return state;
}

/** Gate unit picker: server-side search on flat code / number (works for guards without the units module). */
export function useGateUnitSearch(q: string) {
  return useQuery({
    queryKey: ['gate', 'units', q],
    queryFn: async () => (await http.get<any[]>('/visitors/units', { params: { q: q || undefined, limit: 30 } })).map((u) => ({ value: u.id, label: u.code, description: [u.building, u.resident].filter(Boolean).join(' · ') })),
    placeholderData: (prev: any) => prev,
    staleTime: 60_000,
  });
}
