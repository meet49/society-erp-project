import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';
import { useRefreshContext } from '@/hooks/use-auth';

export const residentKeys = {
  list: (params?: Record<string, unknown>) => ['residents', 'list', params ?? {}] as const,
  detail: (id: string) => ['residents', 'detail', id] as const,
  stats: ['residents', 'stats'] as const,
  lookup: (q: string) => ['residents', 'lookup', q] as const,
  moves: (params?: Record<string, unknown>) => ['residents', 'moves', params ?? {}] as const,
  household: ['residents', 'household'] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
const RELATED = [['residents'], ['units'], ['unit'], ['buildings'], ['society', 'limits']] as readonly (readonly unknown[])[];

export const useResidents = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: residentKeys.list(params), queryFn: () => http.getPage<any>('/residents', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useResident = (id: string) => useQuery({ queryKey: residentKeys.detail(id), queryFn: () => http.get<any>(`/residents/${id}`), enabled: Boolean(id) });
export const useResidentStats = () => useQuery({ queryKey: residentKeys.stats, queryFn: () => http.get<any>('/residents/stats') });
export const useResidentLookup = (q: string) => useQuery({ queryKey: residentKeys.lookup(q), queryFn: () => http.get<any[]>('/residents/lookup', { params: { q, limit: 20 } }), enabled: q.trim().length > 0, placeholderData: keepPreviousData });
export const useMoves = (params: Record<string, unknown>) => useQuery({ queryKey: residentKeys.moves(params), queryFn: () => http.getPage<any>('/residents/moves', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useHousehold = () => useQuery({ queryKey: residentKeys.household, queryFn: () => http.get<any>('/residents/my') });

export function useCreateResident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/residents', input), onSuccess: () => inv(qc, ...RELATED) });
}
export function useUpdateResident() {
  const qc = useQueryClient();
  const refresh = useRefreshContext();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/residents/${id}`, input), onSuccess: async () => { await inv(qc, ...RELATED); refresh.mutate(); } });
}
export function useDeleteResident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.delete(`/residents/${id}`), onSuccess: () => inv(qc, ...RELATED) });
}
export function useInviteResidentLogin() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: { id: string; email?: string; roleIds?: string[] }) => http.post<any>(`/residents/${id}/invite`, input), onSuccess: () => inv(qc, ['residents'], ['society', 'invitations'], ['society', 'users']) });
}
export function useRequestMove() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/residents/moves', input), onSuccess: () => inv(qc, ...RELATED) });
}
export function useApproveMove() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.post<any>(`/residents/moves/${id}/approve`), onSuccess: () => inv(qc, ...RELATED) });
}
export function useRejectMove() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => http.post<any>(`/residents/moves/${id}/reject`, { reason }), onSuccess: () => inv(qc, ['residents', 'moves']) });
}
export function useAddFamilyMember() {
  const qc = useQueryClient();
  const refresh = useRefreshContext();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/residents/my/family', input), onSuccess: async () => { await inv(qc, residentKeys.household, ['residents']); refresh.mutate(); } });
}
export function useExportResidents() {
  return useMutation({ mutationFn: async () => { const { blob, filename } = await http.blob('/residents/export'); downloadFile(blob, filename ?? 'residents.csv'); } });
}
