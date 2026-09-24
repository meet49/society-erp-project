import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export const amenityKeys = {
  list: (params?: Record<string, unknown>) => ['amenities', 'list', params ?? {}] as const,
  detail: (id: string) => ['amenities', 'detail', id] as const,
  types: ['amenities', 'types'] as const,
  settings: ['amenities', 'settings'] as const,
  stats: ['amenities', 'stats'] as const,
  availability: (id: string, date: string) => ['amenities', 'availability', id, date] as const,
  calendar: (id: string, from: string, to: string) => ['amenities', 'calendar', id, from, to] as const,
  bookings: (params?: Record<string, unknown>) => ['amenities', 'bookings', params ?? {}] as const,
  booking: (id: string) => ['amenities', 'booking', id] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export const useAmenities = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: amenityKeys.list(params), queryFn: () => http.get<any[]>('/amenities', { params: buildQueryParams(params) }), enabled });
export const useAmenity = (id: string) => useQuery({ queryKey: amenityKeys.detail(id), queryFn: () => http.get<any>(`/amenities/${id}`), enabled: Boolean(id) });
export const useAmenityTypes = () => useQuery({ queryKey: amenityKeys.types, queryFn: () => http.get<any[]>('/amenities/types'), staleTime: 5 * 60_000 });
export const useAmenitySettings = (enabled = true) => useQuery({ queryKey: amenityKeys.settings, queryFn: () => http.get<any>('/amenities/settings'), enabled });
export const useAmenityStats = () => useQuery({ queryKey: amenityKeys.stats, queryFn: () => http.get<any>('/amenities/stats') });
export const useAvailability = (id: string, date: string) => useQuery({ queryKey: amenityKeys.availability(id, date), queryFn: () => http.get<any>(`/amenities/${id}/availability`, { params: { date } }), enabled: Boolean(id && date), placeholderData: keepPreviousData });
export const useAmenityCalendar = (id: string, from: string, to: string) => useQuery({ queryKey: amenityKeys.calendar(id, from, to), queryFn: () => http.get<any[]>(`/amenities/${id}/calendar`, { params: { from, to } }), enabled: Boolean(id && from && to), placeholderData: keepPreviousData });
export const useBookings = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: amenityKeys.bookings(params), queryFn: () => http.getPage<any>('/amenities/bookings', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useBooking = (id: string) => useQuery({ queryKey: amenityKeys.booking(id), queryFn: () => http.get<any>(`/amenities/bookings/${id}`), enabled: Boolean(id) });

export function useCreateAmenity() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/amenities', input), onSuccess: () => inv(qc, ['amenities']) }); }
export function useUpdateAmenity() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/amenities/${id}`, input), onSuccess: () => inv(qc, ['amenities']) }); }
export function useDeleteAmenity() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/amenities/${id}`), onSuccess: () => inv(qc, ['amenities']) }); }
export function useSaveAmenitySettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/amenities/settings', input), onSuccess: () => inv(qc, amenityKeys.settings) }); }
export function useBookAmenity() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { amenityId: string; unitId?: string; startAt: string; slots?: number; guests?: number; purpose?: string }) => http.post<any>('/amenities/bookings', input), onSuccess: () => inv(qc, ['amenities'], ['billing'], ['notifications']) }); }
export function useCancelBooking() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => http.post<any>(`/amenities/bookings/${id}/cancel`, { reason }), onSuccess: () => inv(qc, ['amenities'], ['billing'], ['workflows'], ['approvals']) }); }
export function useDecideBooking() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, decision, note }: { id: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) => http.post<any>(`/amenities/bookings/${id}/decide`, { decision, note }), onSuccess: () => inv(qc, ['amenities'], ['workflows'], ['approvals'], ['billing']) }); }
export function useRefundBooking() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, amount, reason }: { id: string; amount?: number; reason: string }) => http.post<any>(`/amenities/bookings/${id}/refund`, { amount, reason }), onSuccess: () => inv(qc, ['amenities'], ['payments']) }); }
export function useExportBookings() { return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/amenities/bookings/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'amenity-bookings.csv'); } }); }

/** Keeps booking lists live while approvals / payments / cancellations happen elsewhere. */
export function useAmenityRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => onSocketEvent('amenities.changed', () => { qc.invalidateQueries({ queryKey: ['amenities'] }); }), [qc]);
}
