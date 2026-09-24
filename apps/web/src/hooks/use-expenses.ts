import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export const expenseKeys = {
  list: (params?: Record<string, unknown>) => ['expenses', 'list', params ?? {}] as const,
  detail: (id: string) => ['expenses', 'detail', id] as const,
  stats: ['expenses', 'stats'] as const,
  vendors: (params?: Record<string, unknown>) => ['vendors', 'list', params ?? {}] as const,
  vendor: (id: string) => ['vendors', 'detail', id] as const,
  vendorOptions: ['vendors', 'options'] as const,
  pos: (params?: Record<string, unknown>) => ['purchase-orders', 'list', params ?? {}] as const,
  po: (id: string) => ['purchase-orders', 'detail', id] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
const RELATED = [['expenses'], ['approvals'], ['accounting'], ['purchase-orders']] as readonly (readonly unknown[])[];

// ---- vendors
export const useVendors = (params: Record<string, unknown>) => useQuery({ queryKey: expenseKeys.vendors(params), queryFn: () => http.getPage<any>('/vendors', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useVendor = (id: string) => useQuery({ queryKey: expenseKeys.vendor(id), queryFn: () => http.get<any>(`/vendors/${id}`), enabled: Boolean(id) });
export const useVendorOptions = (enabled = true) => useQuery({ queryKey: expenseKeys.vendorOptions, queryFn: () => http.get<any[]>('/vendors/options'), enabled, staleTime: 60_000 });
export function useCreateVendor() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/vendors', input), onSuccess: () => inv(qc, ['vendors'], ['approvals']) }); }
export function useUpdateVendor() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/vendors/${id}`, input), onSuccess: () => inv(qc, ['vendors']) }); }
export function useDeleteVendor() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/vendors/${id}`), onSuccess: () => inv(qc, ['vendors']) }); }
export function useExportVendors() { return useMutation({ mutationFn: async () => { const { blob, filename } = await http.blob('/vendors/export'); downloadFile(blob, filename ?? 'vendors.csv'); } }); }

// ---- expenses
export const useExpenses = (params: Record<string, unknown>) => useQuery({ queryKey: expenseKeys.list(params), queryFn: () => http.getPage<any>('/expenses', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useExpense = (id: string) => useQuery({ queryKey: expenseKeys.detail(id), queryFn: () => http.get<any>(`/expenses/${id}`), enabled: Boolean(id) });
export const useExpenseStats = () => useQuery({ queryKey: expenseKeys.stats, queryFn: () => http.get<any>('/expenses/stats') });
export function useCreateExpense() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/expenses', input), onSuccess: () => inv(qc, ...RELATED) }); }
export function useUpdateExpense() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/expenses/${id}`, input), onSuccess: () => inv(qc, ...RELATED) }); }
export function useDeleteExpense() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/expenses/${id}`), onSuccess: () => inv(qc, ...RELATED) }); }
export function useExpenseAction() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, action, ...body }: { id: string; action: 'submit' | 'withdraw' | 'approve' | 'reject'; note?: string; reason?: string }) => http.post<any>(`/expenses/${id}/${action}`, body), onSuccess: () => inv(qc, ...RELATED) }); }
export function usePayExpense() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/expenses/${id}/payments`, input), onSuccess: () => inv(qc, ...RELATED) }); }
export function useExportExpenses() { return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/expenses/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'expenses.csv'); } }); }

// ---- purchase orders
export const usePurchaseOrders = (params: Record<string, unknown>) => useQuery({ queryKey: expenseKeys.pos(params), queryFn: () => http.getPage<any>('/expenses/purchase-orders', buildQueryParams(params)), placeholderData: keepPreviousData });
export const usePurchaseOrder = (id: string) => useQuery({ queryKey: expenseKeys.po(id), queryFn: () => http.get<any>(`/expenses/purchase-orders/${id}`), enabled: Boolean(id) });
export function useCreatePurchaseOrder() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/expenses/purchase-orders', input), onSuccess: () => inv(qc, ...RELATED) }); }
export function useUpdatePurchaseOrder() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/expenses/purchase-orders/${id}`, input), onSuccess: () => inv(qc, ...RELATED) }); }
export function usePurchaseOrderAction() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, action, ...body }: { id: string; action: 'submit' | 'approve' | 'reject' | 'order' | 'receive' | 'convert' | 'cancel'; [k: string]: unknown }) => http.post<any>(`/expenses/purchase-orders/${id}/${action}`, body), onSuccess: () => inv(qc, ...RELATED) }); }
