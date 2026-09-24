import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export function useAssetsRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => {
    const offs = [onSocketEvent('contracts.changed', () => inv(qc, ['contracts'], ['assets'])), onSocketEvent('assets.changed', () => inv(qc, ['assets'], ['contracts'])), onSocketEvent('inventory.changed', () => inv(qc, ['inventory']))];
    return () => offs.forEach((off) => off());
  }, [qc]);
}

const exporter = (url: string, name: string) => async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob(url, { params: buildQueryParams(params) }); downloadFile(blob, filename ?? name); };

// ------------------------------------------------------------------ contracts
export const useContracts = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['contracts', 'list', params], queryFn: () => http.getPage<any>('/contracts', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useContract = (id: string) => useQuery({ queryKey: ['contracts', 'detail', id], queryFn: () => http.get<any>(`/contracts/${id}`), enabled: Boolean(id) });
export const useContractStats = (enabled = true) => useQuery({ queryKey: ['contracts', 'stats'], queryFn: () => http.get<any>('/contracts/stats'), enabled });
export const useContractSettings = (enabled = true) => useQuery({ queryKey: ['contracts', 'settings'], queryFn: () => http.get<any>('/contracts/settings'), enabled });
export function useSaveContractSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/contracts/settings', input), onSuccess: () => inv(qc, ['contracts', 'settings']) }); }
export function useCreateContract() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/contracts', input), onSuccess: () => inv(qc, ['contracts'], ['assets']) }); }
export function useUpdateContract() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/contracts/${id}`, input), onSuccess: () => inv(qc, ['contracts'], ['assets']) }); }
export function useDeleteContract() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/contracts/${id}`), onSuccess: () => inv(qc, ['contracts']) }); }
export function useActivateContract() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/contracts/${id}/activate`), onSuccess: () => inv(qc, ['contracts']) }); }
export function useRenewContract() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/contracts/${id}/renew`, input), onSuccess: () => inv(qc, ['contracts'], ['assets']) }); }
export function useTerminateContract() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; reason: string; at?: string }) => http.post<any>(`/contracts/${id}/terminate`, input), onSuccess: () => inv(qc, ['contracts'], ['assets']) }); }
export function useLogContractVisit() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/contracts/${id}/visits`, input), onSuccess: () => inv(qc, ['contracts'], ['assets']) }); }
export function useRecordContractPayment() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/contracts/${id}/payments`, input), onSuccess: () => inv(qc, ['contracts'], ['expenses']) }); }
export function useExportContracts() { return useMutation({ mutationFn: exporter('/contracts/export', 'contracts.csv') }); }

// ------------------------------------------------------------------ assets
export const useAssets = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['assets', 'list', params], queryFn: () => http.getPage<any>('/assets', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useAsset = (id: string) => useQuery({ queryKey: ['assets', 'detail', id], queryFn: () => http.get<any>(`/assets/${id}`), enabled: Boolean(id) });
export const useAssetStats = (enabled = true) => useQuery({ queryKey: ['assets', 'stats'], queryFn: () => http.get<any>('/assets/stats'), enabled });
export const useAssetCategories = () => useQuery({ queryKey: ['assets', 'categories'], queryFn: () => http.get<any[]>('/assets/categories'), staleTime: 5 * 60_000 });
export const useAssetSettings = (enabled = true) => useQuery({ queryKey: ['assets', 'settings'], queryFn: () => http.get<any>('/assets/settings'), enabled });
export const useAssetOptions = (enabled = true) => useQuery({ queryKey: ['assets', 'options'], queryFn: async () => (await http.getPage<any>('/assets', { limit: '200', sort: 'name' })).items.map((a: any) => ({ value: a.id, label: `${a.name} (${a.assetCode})`, description: a.location ?? '' })), enabled, staleTime: 60_000 });
export function useSaveAssetSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/assets/settings', input), onSuccess: () => inv(qc, ['assets', 'settings']) }); }
export function useCreateAsset() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/assets', input), onSuccess: () => inv(qc, ['assets']) }); }
export function useUpdateAsset() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/assets/${id}`, input), onSuccess: () => inv(qc, ['assets']) }); }
export function useDeleteAsset() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/assets/${id}`), onSuccess: () => inv(qc, ['assets']) }); }
export function useAssetStatus() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/assets/${id}/status`, input), onSuccess: () => inv(qc, ['assets']) }); }
export function useLogMaintenance() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/assets/${id}/maintenance`, input), onSuccess: () => inv(qc, ['assets'], ['expenses']) }); }
export function useExportAssets() { return useMutation({ mutationFn: exporter('/assets/export', 'assets.csv') }); }

// ------------------------------------------------------------------ inventory
export const useInventoryItems = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['inventory', 'items', params], queryFn: () => http.getPage<any>('/inventory/items', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useInventoryItem = (id: string) => useQuery({ queryKey: ['inventory', 'item', id], queryFn: () => http.get<any>(`/inventory/items/${id}`), enabled: Boolean(id) });
export const useInventoryStats = (enabled = true) => useQuery({ queryKey: ['inventory', 'stats'], queryFn: () => http.get<any>('/inventory/stats'), enabled });
export const useInventoryCategories = () => useQuery({ queryKey: ['inventory', 'categories'], queryFn: () => http.get<any[]>('/inventory/categories'), staleTime: 5 * 60_000 });
export const useInventorySettings = (enabled = true) => useQuery({ queryKey: ['inventory', 'settings'], queryFn: () => http.get<any>('/inventory/settings'), enabled });
export const useStockTransactions = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['inventory', 'transactions', params], queryFn: () => http.getPage<any>('/inventory/transactions', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export function useSaveInventorySettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/inventory/settings', input), onSuccess: () => inv(qc, ['inventory', 'settings']) }); }
export function useCreateItem() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/inventory/items', input), onSuccess: () => inv(qc, ['inventory']) }); }
export function useUpdateItem() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/inventory/items/${id}`, input), onSuccess: () => inv(qc, ['inventory']) }); }
export function useDeleteItem() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/inventory/items/${id}`), onSuccess: () => inv(qc, ['inventory']) }); }
export function useStockTransact() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/inventory/items/${id}/transactions`, input), onSuccess: () => inv(qc, ['inventory']) }); }
export function useExportInventory() { return useMutation({ mutationFn: exporter('/inventory/export', 'inventory.csv') }); }
