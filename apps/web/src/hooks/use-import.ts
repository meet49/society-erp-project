import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export interface ImportField { key: string; label: string; required?: boolean; hint?: string }
export interface ImportTypeDef { type: string; name: string; description: string; module: string; permission: string; fields: ImportField[]; identity: string[] }

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export const useImportTypes = () => useQuery({ queryKey: ['imports', 'types'], queryFn: () => http.get<ImportTypeDef[]>('/society/import/types'), staleTime: 5 * 60_000 });
export const useImports = (params: Record<string, unknown> = {}) => useQuery({ queryKey: ['imports', 'list', params], queryFn: () => http.getPage<any>('/society/import', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useImport = (id: string, live = false) => useQuery({ queryKey: ['imports', 'detail', id], queryFn: () => http.get<any>(`/society/import/${id}`), enabled: Boolean(id), refetchInterval: live ? 2000 : false });
export function useImportRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => onSocketEvent('import.progress', () => inv(qc, ['imports'])), [qc]);
}
export function useUploadImport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ type, file }: { type: string; file: File }) => { const form = new FormData(); form.append('type', type); form.append('file', file); return http.post<any>('/society/import/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 }); }, onSuccess: () => inv(qc, ['imports']) });
}
export function useValidateImport() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, mapping, options }: { id: string; mapping: Record<string, string>; options?: Record<string, unknown> }) => http.put<any>(`/society/import/${id}/mapping`, { mapping, options }), onSuccess: () => inv(qc, ['imports']) }); }
export function useRunImport() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/society/import/${id}/run`), onSuccess: () => inv(qc, ['imports']) }); }
export function useCancelImport() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/society/import/${id}/cancel`), onSuccess: () => inv(qc, ['imports']) }); }
export function useDownloadTemplate() { return useMutation({ mutationFn: async (type: string) => { const { blob, filename } = await http.blob(`/society/import/templates/${type}`); downloadFile(blob, filename ?? `${type.toLowerCase()}-template.csv`); } }); }
export function useDownloadImportErrors() { return useMutation({ mutationFn: async (id: string) => { const { blob, filename } = await http.blob(`/society/import/${id}/errors.csv`); downloadFile(blob, filename ?? 'import-errors.csv'); } }); }
