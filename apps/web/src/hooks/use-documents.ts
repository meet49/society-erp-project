import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams } from '@/lib/utils';

export interface UploadedFile { storageKey: string; name: string; mimeType: string; size: number; url: string }

/** Uploads one file into the society's storage namespace and returns the key to link to a record. */
export async function uploadFile(file: File, scope = 'uploads'): Promise<UploadedFile> {
  const form = new FormData();
  form.append('scope', scope);
  form.append('file', file);
  return http.post<UploadedFile>('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 });
}
export function useUploadFile() { return useMutation({ mutationFn: ({ file, scope }: { file: File; scope?: string }) => uploadFile(file, scope) }); }

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export const useDocuments = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['documents', 'list', params], queryFn: () => http.getPage<any>('/documents', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useDocument = (id: string) => useQuery({ queryKey: ['documents', 'detail', id], queryFn: () => http.get<any>(`/documents/${id}`), enabled: Boolean(id) });
export const useDocumentFolders = () => useQuery({ queryKey: ['documents', 'folders'], queryFn: () => http.get<any[]>('/documents/folders') });
export const useDocumentCategories = () => useQuery({ queryKey: ['documents', 'categories'], queryFn: () => http.get<any[]>('/documents/categories'), staleTime: 5 * 60_000 });
export const useDocumentStats = () => useQuery({ queryKey: ['documents', 'stats'], queryFn: () => http.get<any>('/documents/stats') });
export const useDocumentSettings = (enabled = true) => useQuery({ queryKey: ['documents', 'settings'], queryFn: () => http.get<any>('/documents/settings'), enabled });

export function useCreateFolder() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/documents/folders', input), onSuccess: () => inv(qc, ['documents']) }); }
export function useUpdateFolder() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/documents/folders/${id}`, input), onSuccess: () => inv(qc, ['documents']) }); }
export function useDeleteFolder() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/documents/folders/${id}`), onSuccess: () => inv(qc, ['documents']) }); }
export function useCreateDocument() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/documents', input), onSuccess: () => inv(qc, ['documents']) }); }
export function useUpdateDocument() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/documents/${id}`, input), onSuccess: () => inv(qc, ['documents']) }); }
export function useAddVersion() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/documents/${id}/versions`, input), onSuccess: () => inv(qc, ['documents']) }); }
export function useArchiveDocument() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/documents/${id}/archive`), onSuccess: () => inv(qc, ['documents']) }); }
export function useDeleteDocument() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/documents/${id}`), onSuccess: () => inv(qc, ['documents']) }); }
export function useReviewDocument() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, decision, note }: { id: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) => http.post<any>(`/documents/${id}/review`, { decision, note }), onSuccess: () => inv(qc, ['documents'], ['approvals']) }); }
export function useSaveDocumentSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/documents/settings', input), onSuccess: () => inv(qc, ['documents', 'settings']) }); }
/** Asks the server for a signed URL and opens it; nothing is cached client-side. */
export function useDownloadDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ id, version }: { id: string; version?: number }) => { const r = await http.post<{ url: string; name: string }>(`/documents/${id}/download`, { version }); window.open(r.url, '_blank', 'noopener'); return r; }, onSuccess: () => inv(qc, ['documents', 'detail']) });
}
export function useDocumentsRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => onSocketEvent('documents.changed', () => { qc.invalidateQueries({ queryKey: ['documents'] }); }), [qc]);
}
