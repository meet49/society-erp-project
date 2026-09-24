import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export const complaintKeys = {
  list: (params?: Record<string, unknown>) => ['complaints', 'list', params ?? {}] as const,
  detail: (id: string) => ['complaints', 'detail', id] as const,
  stats: ['complaints', 'stats'] as const,
  settings: ['complaints', 'settings'] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export const useComplaints = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: complaintKeys.list(params), queryFn: () => http.getPage<any>('/complaints', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useComplaint = (id: string) => useQuery({ queryKey: complaintKeys.detail(id), queryFn: () => http.get<any>(`/complaints/${id}`), enabled: Boolean(id) });
export const useComplaintStats = () => useQuery({ queryKey: complaintKeys.stats, queryFn: () => http.get<any>('/complaints/stats') });
export const useComplaintSettings = () => useQuery({ queryKey: complaintKeys.settings, queryFn: () => http.get<any>('/complaints/settings') });

export function useCreateComplaint() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/complaints', input), onSuccess: () => inv(qc, ['complaints']) }); }
export function useUpdateComplaint() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/complaints/${id}`, input), onSuccess: () => inv(qc, ['complaints']) }); }
export function useAssignComplaint() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/complaints/${id}/assign`, input), onSuccess: () => inv(qc, ['complaints']) }); }
export function useComplaintStatus() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) => http.post<any>(`/complaints/${id}/status`, { status, note }), onSuccess: () => inv(qc, ['complaints']) }); }
export function useCommentComplaint() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; body: string; internal?: boolean }) => http.post<any>(`/complaints/${id}/comments`, input), onSuccess: () => inv(qc, ['complaints']) }); }
export function useRateComplaint() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; score: number; comment?: string }) => http.post<any>(`/complaints/${id}/rate`, input), onSuccess: () => inv(qc, ['complaints']) }); }
export function useSaveComplaintSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/complaints/settings', input), onSuccess: () => inv(qc, complaintKeys.settings) }); }
export function useExportComplaints() { return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/complaints/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'complaints.csv'); } }); }
