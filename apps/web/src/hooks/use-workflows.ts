import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams } from '@/lib/utils';

export const workflowKeys = {
  definitions: ['workflows', 'definitions'] as const,
  definition: (key: string) => ['workflows', 'definition', key] as const,
  instances: (params?: Record<string, unknown>) => ['workflows', 'instances', params ?? {}] as const,
  approvals: (params?: Record<string, unknown>) => ['approvals', params ?? {}] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export const useWorkflows = () => useQuery({ queryKey: workflowKeys.definitions, queryFn: () => http.get<any[]>('/society/workflows') });
export const useWorkflowInstances = (params: Record<string, unknown> = {}) => useQuery({ queryKey: workflowKeys.instances(params), queryFn: () => http.get<any[]>('/society/workflows/instances', { params: buildQueryParams(params) }) });
export function useUpdateWorkflow() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ key, ...input }: any) => http.put<any>(`/society/workflows/${key}`, input), onSuccess: () => inv(qc, ['workflows']) }); }

/** Approval requests waiting on the current user (refreshed on realtime `approvals.changed`). */
export const useApprovals = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: workflowKeys.approvals(params), queryFn: () => http.get<any[]>('/approvals', { params: buildQueryParams(params) }), enabled, refetchInterval: 60_000 });
export function useDecideApproval() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, decision, note }: { id: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) => http.post<any>(`/approvals/${id}/decide`, { decision, note }), onSuccess: () => inv(qc, ['approvals'], ['expenses'], ['purchase-orders'], ['vendors'], ['workflows'], ['amenities'], ['documents']) }); }
