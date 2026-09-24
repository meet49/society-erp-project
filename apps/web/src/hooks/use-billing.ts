import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export const billingKeys = {
  config: ['billing', 'config'] as const,
  chargeHeads: (includeInactive?: boolean) => ['billing', 'charge-heads', Boolean(includeInactive)] as const,
  stats: ['billing', 'stats'] as const,
  runs: (params?: Record<string, unknown>) => ['billing', 'runs', params ?? {}] as const,
  run: (id: string) => ['billing', 'run', id] as const,
  invoices: (params?: Record<string, unknown>) => ['billing', 'invoices', params ?? {}] as const,
  invoice: (id: string) => ['billing', 'invoice', id] as const,
  ledger: (unitId: string, params?: Record<string, unknown>) => ['billing', 'ledger', unitId, params ?? {}] as const,
  balance: (unitId: string) => ['billing', 'balance', unitId] as const,
  meters: (params?: Record<string, unknown>) => ['billing', 'meters', params ?? {}] as const,
  meterTypes: ['billing', 'meter-types'] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
/** Anything that changes money touches invoices, ledgers, balances, stats and payments. */
export const BILLING_RELATED = [['billing'], ['payments'], ['unit'], ['residents', 'household']] as readonly (readonly unknown[])[];

// ------------------------------------------------------------------ configuration
export const useBillingConfig = () => useQuery({ queryKey: billingKeys.config, queryFn: () => http.get<any>('/billing/config') });
export function useSaveBillingConfig() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.put<any>('/billing/config', input), onSuccess: () => inv(qc, billingKeys.config) });
}
export const useFormulaTest = () => useMutation({ mutationFn: (input: { formula: string; vars?: Record<string, number> }) => http.post<any>('/billing/config/formula-test', input) });

// ------------------------------------------------------------------ charge heads
export const useChargeHeads = (includeInactive = false) => useQuery({ queryKey: billingKeys.chargeHeads(includeInactive), queryFn: () => http.get<any[]>('/billing/charge-heads', { params: includeInactive ? { includeInactive: 'true' } : undefined }) });
export function useCreateChargeHead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/billing/charge-heads', input), onSuccess: () => inv(qc, ['billing', 'charge-heads']) });
}
export function useUpdateChargeHead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/billing/charge-heads/${id}`, input), onSuccess: () => inv(qc, ['billing', 'charge-heads']) });
}
export function useDeactivateChargeHead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.delete(`/billing/charge-heads/${id}`), onSuccess: () => inv(qc, ['billing', 'charge-heads']) });
}

// ------------------------------------------------------------------ runs
export const useBillingRuns = (params: Record<string, unknown>) => useQuery({ queryKey: billingKeys.runs(params), queryFn: () => http.getPage<any>('/billing/runs', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useBillingRun = (id: string) => useQuery({ queryKey: billingKeys.run(id), queryFn: () => http.get<any>(`/billing/runs/${id}`), enabled: Boolean(id) });
export const usePreviewRun = () => useMutation({ mutationFn: (input: any) => http.post<any>('/billing/runs/preview', input) });
export function useGenerateRun() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/billing/runs', input), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useIssueRun() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.post<any>(`/billing/runs/${id}/issue`), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => http.post<any>(`/billing/runs/${id}/cancel`, { reason }), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}

// ------------------------------------------------------------------ invoices
export const useInvoices = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: billingKeys.invoices(params), queryFn: () => http.getPage<any>('/billing/invoices', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useInvoice = (id: string) => useQuery({ queryKey: billingKeys.invoice(id), queryFn: () => http.get<any>(`/billing/invoices/${id}`), enabled: Boolean(id) });
export const useBillingStats = () => useQuery({ queryKey: billingKeys.stats, queryFn: () => http.get<any>('/billing/stats') });
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/billing/invoices', input), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/billing/invoices/${id}`, input), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.post<any>(`/billing/invoices/${id}/issue`), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => http.post<any>(`/billing/invoices/${id}/cancel`, { reason }), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export const useRemindInvoice = () => useMutation({ mutationFn: (id: string) => http.post<any>(`/billing/invoices/${id}/remind`) });
export function useExportInvoices() {
  return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/billing/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'invoices.csv'); } });
}

// ------------------------------------------------------------------ ledger
export const useUnitLedger = (unitId: string, params: Record<string, unknown> = {}) => useQuery({ queryKey: billingKeys.ledger(unitId, params), queryFn: () => http.get<any>(`/billing/units/${unitId}/ledger`, { params: buildQueryParams(params) }), enabled: Boolean(unitId) });
export const useUnitBalance = (unitId: string) => useQuery({ queryKey: billingKeys.balance(unitId), queryFn: () => http.get<{ unitId: string; balance: number }>(`/billing/units/${unitId}/balance`), enabled: Boolean(unitId) });

// ------------------------------------------------------------------ meters
export const useMeterReadings = (params: Record<string, unknown>) => useQuery({ queryKey: billingKeys.meters(params), queryFn: () => http.getPage<any>('/billing/meters', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useMeterTypes = () => useQuery({ queryKey: billingKeys.meterTypes, queryFn: () => http.get<string[]>('/billing/meters/types') });
export function useRecordMeterReading() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/billing/meters', input), onSuccess: () => inv(qc, ['billing', 'meters'], billingKeys.meterTypes, ['unit']) });
}
export function useImportMeterReadings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { csv: string; meterType?: string; readingDate?: string }) => http.post<any>('/billing/meters/import', input), onSuccess: () => inv(qc, ['billing', 'meters'], billingKeys.meterTypes, ['unit']) });
}
export function useDeleteMeterReading() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.delete(`/billing/meters/${id}`), onSuccess: () => inv(qc, ['billing', 'meters']) });
}
