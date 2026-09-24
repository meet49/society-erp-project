import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';
import { offlineQueue } from '@/lib/offline-queue';
import type { AudienceValue } from '@/hooks/use-community';

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

/** Refreshes incident and emergency queries on socket events; surfaces new SOS / broadcasts as toasts for responders. */
export function useSecurityRealtime(opts: { onSos?: (a: any) => void; onBroadcast?: (b: any) => void } = {}) {
  const qc = useQueryClient();
  const { onSos, onBroadcast } = opts;
  React.useEffect(() => {
    const offs = [
      onSocketEvent('security.changed', () => inv(qc, ['security'])),
      onSocketEvent('emergency.changed', () => inv(qc, ['emergency'])),
      onSocketEvent('emergency.sos', (a: any) => { inv(qc, ['emergency']); if (onSos) onSos(a); else toast.error(`SOS from ${a.raisedBy}${a.unitCode ? ` (${a.unitCode})` : ''} at ${a.location}`, { duration: 15000 }); }),
      onSocketEvent('emergency.broadcast', (b: any) => { inv(qc, ['emergency']); if (onBroadcast) onBroadcast(b); else toast.warning(`EMERGENCY: ${b.title}`, { description: b.message, duration: 20000 }); }),
    ];
    return () => offs.forEach((off) => off());
  }, [qc, onSos, onBroadcast]);
}

// ------------------------------------------------------------------ incidents
export const useIncidents = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['security', 'incidents', params], queryFn: () => http.getPage<any>('/security/incidents', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useIncident = (id: string) => useQuery({ queryKey: ['security', 'incident', id], queryFn: () => http.get<any>(`/security/incidents/${id}`), enabled: Boolean(id) });
export const useIncidentStats = (enabled = true) => useQuery({ queryKey: ['security', 'stats'], queryFn: () => http.get<any>('/security/stats'), enabled });
export const useIncidentTypes = () => useQuery({ queryKey: ['security', 'types'], queryFn: () => http.get<any[]>('/security/types'), staleTime: 5 * 60_000 });
export const useSecuritySettings = (enabled = true) => useQuery({ queryKey: ['security', 'settings'], queryFn: () => http.get<any>('/security/settings'), enabled });
export const useSecurityGates = () => useQuery({ queryKey: ['security', 'gates'], queryFn: () => http.get<any[]>('/security/gates'), staleTime: 60_000 });
export function useSaveSecuritySettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/security/settings', input), onSuccess: () => inv(qc, ['security', 'settings']) }); }
export function useCreateGate() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/security/gates', input), onSuccess: () => inv(qc, ['security', 'gates'], ['visitors']) }); }
export function useUpdateGate() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/security/gates/${id}`, input), onSuccess: () => inv(qc, ['security', 'gates'], ['visitors']) }); }
/** Reporting goes through the offline queue so a guard can log an incident without signal; the clientRef makes replays safe. */
export function useReportIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: Record<string, unknown>) => offlineQueue.run({ method: 'post', url: '/security/incidents', body: { ...input, clientRef: (input.clientRef as string) ?? `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, label: `Incident: ${String(input.title ?? '')}` }), onSuccess: () => inv(qc, ['security']) });
}
export function useCreateIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/security/incidents', input), onSuccess: () => inv(qc, ['security']) }); }
export function useUpdateIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/security/incidents/${id}`, input), onSuccess: () => inv(qc, ['security']) }); }
export function useAssignIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, assignedTo }: { id: string; assignedTo: string | null }) => http.post<any>(`/security/incidents/${id}/assign`, { assignedTo }), onSuccess: () => inv(qc, ['security']) }); }
export function useIncidentNote() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; note: string; photos?: string[] }) => http.post<any>(`/security/incidents/${id}/notes`, input), onSuccess: () => inv(qc, ['security']) }); }
export function useIncidentStatus() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; status: 'INVESTIGATING' | 'OPEN'; note?: string }) => http.post<any>(`/security/incidents/${id}/status`, input), onSuccess: () => inv(qc, ['security']) }); }
export function useResolveIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; note: string; actionTaken?: string; close?: boolean }) => http.post<any>(`/security/incidents/${id}/resolve`, input), onSuccess: () => inv(qc, ['security']) }); }
export function useCloseIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, note }: { id: string; note?: string }) => http.post<any>(`/security/incidents/${id}/close`, { note }), onSuccess: () => inv(qc, ['security']) }); }
export function useDeleteIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/security/incidents/${id}`), onSuccess: () => inv(qc, ['security']) }); }
export function useExportIncidents() { return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/security/incidents/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'incidents.csv'); } }); }

// ------------------------------------------------------------------ emergency
export const useEmergencyContacts = () => useQuery({ queryKey: ['emergency', 'contacts'], queryFn: () => http.get<any[]>('/emergency/contacts'), staleTime: 5 * 60_000 });
export const useEmergencyActive = (enabled = true) => useQuery({ queryKey: ['emergency', 'active'], queryFn: () => http.get<{ sos: any[]; broadcasts: any[] }>('/emergency/active'), refetchInterval: 30_000, enabled });
export const useEmergencyAlerts = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['emergency', 'alerts', params], queryFn: () => http.getPage<any>('/emergency/alerts', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useEmergencyAlert = (id: string) => useQuery({ queryKey: ['emergency', 'alert', id], queryFn: () => http.get<any>(`/emergency/alerts/${id}`), enabled: Boolean(id) });
export const useEmergencyStats = (enabled = true) => useQuery({ queryKey: ['emergency', 'stats'], queryFn: () => http.get<any>('/emergency/stats'), enabled });
export const useEmergencySettings = (enabled = true) => useQuery({ queryKey: ['emergency', 'settings'], queryFn: () => http.get<any>('/emergency/settings'), enabled });
export function useSaveEmergencySettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/emergency/settings', input), onSuccess: () => inv(qc, ['emergency', 'settings']) }); }
export function useCreateContact() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/emergency/contacts', input), onSuccess: () => inv(qc, ['emergency', 'contacts']) }); }
export function useUpdateContact() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/emergency/contacts/${id}`, input), onSuccess: () => inv(qc, ['emergency', 'contacts']) }); }
export function useDeleteContact() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/emergency/contacts/${id}`), onSuccess: () => inv(qc, ['emergency', 'contacts']) }); }
export function useReorderContacts() { const qc = useQueryClient(); return useMutation({ mutationFn: (ids: string[]) => http.post<any[]>('/emergency/contacts/reorder', { ids }), onSuccess: () => inv(qc, ['emergency', 'contacts']) }); }
/** SOS is never queued offline: the caller must know immediately whether help was actually alerted. */
export function useRaiseSos() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { category: string; location?: string; message?: string; unitId?: string; coordinates?: { lat: number; lng: number } }) => http.post<any>('/emergency/sos', { ...input, clientRef: `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, { timeout: 15_000 }), onSuccess: () => inv(qc, ['emergency']) }); }
export function useAcknowledgeAlert() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, note }: { id: string; note?: string }) => http.post<any>(`/emergency/alerts/${id}/acknowledge`, { note }), onSuccess: () => inv(qc, ['emergency']) }); }
export function useResolveAlert() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; note?: string; falseAlarm?: boolean }) => http.post<any>(`/emergency/alerts/${id}/resolve`, input), onSuccess: () => inv(qc, ['emergency']) }); }
export function useBroadcast() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { title: string; message: string; category: string; audience?: AudienceValue; expiresInHours?: number }) => http.post<any>('/emergency/broadcast', input), onSuccess: () => inv(qc, ['emergency']) }); }
