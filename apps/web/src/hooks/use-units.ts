import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export const unitKeys = {
  buildings: ['buildings'] as const,
  units: (params?: Record<string, unknown>) => ['units', params ?? {}] as const,
  unit: (id: string) => ['unit', id] as const,
  stats: ['units', 'stats'] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export const useBuildings = () => useQuery({ queryKey: unitKeys.buildings, queryFn: () => http.get<any[]>('/buildings') });
export function useCreateBuilding() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/buildings', input), onSuccess: () => inv(qc, unitKeys.buildings) });
}
export function useUpdateBuilding() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/buildings/${id}`, input), onSuccess: () => inv(qc, unitKeys.buildings, ['units']) });
}
export function useDeleteBuilding() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.delete(`/buildings/${id}`), onSuccess: () => inv(qc, unitKeys.buildings) });
}

export const useUnits = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: unitKeys.units(params), queryFn: () => http.getPage<any>('/units', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useUnit = (id: string) => useQuery({ queryKey: unitKeys.unit(id), queryFn: () => http.get<any>(`/units/${id}`), enabled: Boolean(id) });
export const useUnitStats = () => useQuery({ queryKey: unitKeys.stats, queryFn: () => http.get<any>('/units/stats') });
export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/units', input), onSuccess: () => inv(qc, ['units'], unitKeys.buildings, ['society', 'limits'], ['society', 'profile']) });
}
export function useBulkCreateUnits() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<{ created: number; skipped: string[] }>('/units/bulk', input), onSuccess: () => inv(qc, ['units'], unitKeys.buildings, ['society', 'limits'], ['society', 'profile']) });
}
export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/units/${id}`, input), onSuccess: (_d, v) => inv(qc, ['units'], unitKeys.unit(v.id), unitKeys.buildings) });
}
export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.delete(`/units/${id}`), onSuccess: () => inv(qc, ['units'], unitKeys.buildings, ['society', 'limits']) });
}
export function useExportUnits() {
  return useMutation({
    mutationFn: async () => {
      const { blob, filename } = await http.blob('/units/export');
      downloadFile(blob, filename ?? 'units.csv');
    },
  });
}

/** Lightweight option list for pickers (all units, code + id). */
export function useUnitOptions(enabled = true) {
  return useQuery({
    queryKey: ['units', 'options'],
    queryFn: async () => {
      const page = await http.getPage<any>('/units', { limit: 200, sort: 'code' });
      return page.items.map((u: any) => ({ value: u.id, label: u.code, description: u.buildingId?.name }));
    },
    enabled,
    staleTime: 60_000,
  });
}
