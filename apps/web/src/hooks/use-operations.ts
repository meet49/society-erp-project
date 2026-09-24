import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';
import { offlineQueue } from '@/lib/offline-queue';

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export function useOperationsRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => onSocketEvent('operations.changed', () => { for (const k of ['staff', 'domestic-help', 'vehicles', 'parking']) qc.invalidateQueries({ queryKey: [k] }); }), [qc]);
}

// ------------------------------------------------------------------ staff & attendance
export const useStaffList = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['staff', 'list', params], queryFn: () => http.getPage<any>('/staff', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useStaffMember = (id: string) => useQuery({ queryKey: ['staff', 'detail', id], queryFn: () => http.get<any>(`/staff/${id}`), enabled: Boolean(id) });
export const useStaffStats = () => useQuery({ queryKey: ['staff', 'stats'], queryFn: () => http.get<any>('/staff/stats') });
export const useStaffCategories = () => useQuery({ queryKey: ['staff', 'categories'], queryFn: () => http.get<any[]>('/staff/categories'), staleTime: 5 * 60_000 });
export const useStaffSettings = (enabled = true) => useQuery({ queryKey: ['staff', 'settings'], queryFn: () => http.get<any>('/staff/settings'), enabled });
export const useAttendanceRegister = (month: string, categoryKey?: string) => useQuery({ queryKey: ['staff', 'register', month, categoryKey ?? ''], queryFn: () => http.get<any>('/staff/attendance/register', { params: { month, categoryKey: categoryKey || undefined } }), enabled: Boolean(month), placeholderData: keepPreviousData });
export function useCreateStaff() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/staff', input), onSuccess: () => inv(qc, ['staff']) }); }
export function useUpdateStaff() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/staff/${id}`, input), onSuccess: () => inv(qc, ['staff']) }); }
export function useDeleteStaff() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/staff/${id}`), onSuccess: () => inv(qc, ['staff']) }); }
export function useMarkAttendanceRows() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { date: string; entries: any[] }) => http.post<any>('/staff/attendance', input), onSuccess: () => inv(qc, ['staff']) }); }
export function useStaffPunch() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, direction, ...input }: { id: string; direction: 'in' | 'out'; gateId?: string }) => http.post<any>(`/staff/${id}/check-${direction}`, input), onSuccess: () => inv(qc, ['staff']) }); }
export function useSaveStaffSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/staff/settings', input), onSuccess: () => inv(qc, ['staff', 'settings']) }); }
export function useExportRegister() { return useMutation({ mutationFn: async (month: string) => { const { blob, filename } = await http.blob('/staff/attendance/export', { params: { month } }); downloadFile(blob, filename ?? `attendance-${month}.csv`); } }); }

// ------------------------------------------------------------------ domestic help
export const useDomesticHelpList = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['domestic-help', 'list', params], queryFn: () => http.getPage<any>('/domestic-help', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useDomesticHelp = (id: string) => useQuery({ queryKey: ['domestic-help', 'detail', id], queryFn: () => http.get<any>(`/domestic-help/${id}`), enabled: Boolean(id) });
export const useHelpTypes = () => useQuery({ queryKey: ['domestic-help', 'types'], queryFn: () => http.get<any[]>('/domestic-help/types'), staleTime: 5 * 60_000 });
export const useHelpStats = () => useQuery({ queryKey: ['domestic-help', 'stats'], queryFn: () => http.get<any>('/domestic-help/stats') });
export const useHelpLogs = (params: Record<string, unknown> = {}) => useQuery({ queryKey: ['domestic-help', 'logs', params], queryFn: () => http.getPage<any>('/domestic-help/logs', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useHelpSettings = (enabled = true) => useQuery({ queryKey: ['domestic-help', 'settings'], queryFn: () => http.get<any>('/domestic-help/settings'), enabled });
export function useRegisterHelp() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/domestic-help', input), onSuccess: () => inv(qc, ['domestic-help']) }); }
export function useUpdateHelp() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/domestic-help/${id}`, input), onSuccess: () => inv(qc, ['domestic-help']) }); }
export function useRemoveHelpFromUnit() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, unitId }: { id: string; unitId: string }) => http.post<any>(`/domestic-help/${id}/units/${unitId}/remove`), onSuccess: () => inv(qc, ['domestic-help']) }); }
export function useVerifyHelp() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; status: 'VERIFIED' | 'REJECTED'; note?: string }) => http.post<any>(`/domestic-help/${id}/verify`, input), onSuccess: () => inv(qc, ['domestic-help']) }); }
export function useBlockHelp() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, block, reason }: { id: string; block: boolean; reason?: string }) => http.post<any>(`/domestic-help/${id}/${block ? 'block' : 'unblock'}`, block ? { reason } : {}), onSuccess: () => inv(qc, ['domestic-help']) }); }
export function useSaveHelpSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/domestic-help/settings', input), onSuccess: () => inv(qc, ['domestic-help', 'settings']) }); }
export function useHelpLookup() { return useMutation({ mutationFn: (code: string) => http.post<any>('/domestic-help/lookup', { code }) }); }
/** Gate punches go through the offline queue so a flaky connection never loses an entry. */
export function useHelpPunch() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, direction, gateId }: { id: string; direction: 'in' | 'out'; gateId?: string }) => offlineQueue.run({ method: 'post', url: `/domestic-help/${id}/check-${direction}`, body: { gateId }, label: `Domestic help ${direction}` }), onSuccess: () => inv(qc, ['domestic-help']) });
}

// ------------------------------------------------------------------ vehicles & parking
export const useVehicles = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['vehicles', 'list', params], queryFn: () => http.getPage<any>('/vehicles', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useVehicleStats = () => useQuery({ queryKey: ['vehicles', 'stats'], queryFn: () => http.get<any>('/vehicles/stats') });
export const useVehicleLookup = (q: string) => useQuery({ queryKey: ['vehicles', 'lookup', q], queryFn: () => http.get<any[]>('/vehicles/lookup', { params: { q } }), enabled: q.trim().length >= 2, placeholderData: keepPreviousData });
export function useCreateVehicle() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/vehicles', input), onSuccess: () => inv(qc, ['vehicles']) }); }
export function useUpdateVehicle() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/vehicles/${id}`, input), onSuccess: () => inv(qc, ['vehicles'], ['parking']) }); }
export function useDeleteVehicle() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/vehicles/${id}`), onSuccess: () => inv(qc, ['vehicles'], ['parking']) }); }
export const useParkingSlots = (params: Record<string, unknown> = {}) => useQuery({ queryKey: ['parking', 'list', params], queryFn: () => http.getPage<any>('/parking', buildQueryParams({ limit: 200, ...params })), placeholderData: keepPreviousData });
export const useParkingStats = () => useQuery({ queryKey: ['parking', 'stats'], queryFn: () => http.get<any>('/parking/stats') });
export function useCreateSlot() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/parking', input), onSuccess: () => inv(qc, ['parking']) }); }
export function useBulkSlots() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/parking/bulk', input), onSuccess: () => inv(qc, ['parking']) }); }
export function useUpdateSlot() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/parking/${id}`, input), onSuccess: () => inv(qc, ['parking']) }); }
export function useDeleteSlot() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/parking/${id}`), onSuccess: () => inv(qc, ['parking']) }); }
export function useAllocateSlot() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; unitId: string; vehicleId?: string | null }) => http.post<any>(`/parking/${id}/allocate`, input), onSuccess: () => inv(qc, ['parking'], ['vehicles'], ['units']) }); }
export function useReleaseSlot() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/parking/${id}/release`), onSuccess: () => inv(qc, ['parking'], ['vehicles'], ['units']) }); }
