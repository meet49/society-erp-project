import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export const accountingKeys = {
  summary: ['accounting', 'summary'] as const,
  trend: ['accounting', 'trend'] as const,
  accounts: (params?: Record<string, unknown>) => ['accounting', 'accounts', params ?? {}] as const,
  funds: ['accounting', 'funds'] as const,
  journals: (params?: Record<string, unknown>) => ['accounting', 'journals', params ?? {}] as const,
  journal: (id: string) => ['accounting', 'journal', id] as const,
  report: (name: string, params?: Record<string, unknown>) => ['accounting', 'report', name, params ?? {}] as const,
  bankAccounts: ['accounting', 'bank-accounts'] as const,
  bankTxns: (params?: Record<string, unknown>) => ['accounting', 'bank-transactions', params ?? {}] as const,
  reconciliation: (id: string) => ['accounting', 'reconciliation', id] as const,
  suggestions: (id: string) => ['accounting', 'suggestions', id] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
const ALL = [['accounting']] as readonly (readonly unknown[])[];

export const useAccountingSummary = () => useQuery({ queryKey: accountingKeys.summary, queryFn: () => http.get<any>('/accounting/summary') });
export const useAccountingTrend = () => useQuery({ queryKey: accountingKeys.trend, queryFn: () => http.get<any[]>('/accounting/trend') });
export const useAccounts = (params: Record<string, unknown> = {}) => useQuery({ queryKey: accountingKeys.accounts(params), queryFn: () => http.get<any[]>('/accounting/accounts', { params: buildQueryParams(params) }) });
export const useFunds = () => useQuery({ queryKey: accountingKeys.funds, queryFn: () => http.get<any[]>('/accounting/funds') });
export const useJournals = (params: Record<string, unknown>) => useQuery({ queryKey: accountingKeys.journals(params), queryFn: () => http.getPage<any>('/accounting/journals', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useJournal = (id: string) => useQuery({ queryKey: accountingKeys.journal(id), queryFn: () => http.get<any>(`/accounting/journals/${id}`), enabled: Boolean(id) });
export const useReport = (name: string, params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: accountingKeys.report(name, params), queryFn: () => http.get<any>(`/accounting/reports/${name}`, { params: buildQueryParams(params) }), enabled, placeholderData: keepPreviousData });
export const useGeneralLedger = (code: string, params: Record<string, unknown> = {}) => useQuery({ queryKey: accountingKeys.report(`general-ledger/${code}`, params), queryFn: () => http.get<any>(`/accounting/reports/general-ledger/${code}`, { params: buildQueryParams(params) }), enabled: Boolean(code) });

export function useCreateAccount() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/accounting/accounts', input), onSuccess: () => inv(qc, ['accounting', 'accounts']) }); }
export function useUpdateAccount() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/accounting/accounts/${id}`, input), onSuccess: () => inv(qc, ['accounting', 'accounts']) }); }
export function useDeleteAccount() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/accounting/accounts/${id}`), onSuccess: () => inv(qc, ['accounting', 'accounts']) }); }
export function useSaveFund() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/accounting/funds', input), onSuccess: () => inv(qc, accountingKeys.funds, ['accounting', 'accounts']) }); }

export function useCreateJournal() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/accounting/journals', input), onSuccess: () => inv(qc, ...ALL) }); }
export function useUpdateJournal() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/accounting/journals/${id}`, input), onSuccess: () => inv(qc, ...ALL) }); }
export function useDeleteJournal() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/accounting/journals/${id}`), onSuccess: () => inv(qc, ...ALL) }); }
export function usePostJournal() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/accounting/journals/${id}/post`), onSuccess: () => inv(qc, ...ALL) }); }
export function useReverseJournal() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => http.post<any>(`/accounting/journals/${id}/reverse`, { reason }), onSuccess: () => inv(qc, ...ALL) }); }
export function useExportReport() { return useMutation({ mutationFn: async ({ name, params }: { name: string; params?: Record<string, unknown> }) => { const { blob, filename } = await http.blob(`/accounting/reports/${name}/export`, { params: buildQueryParams(params) }); downloadFile(blob, filename ?? `${name}.csv`); } }); }

// ---- bank
export const useBankAccounts = (enabled = true) => useQuery({ queryKey: accountingKeys.bankAccounts, queryFn: () => http.get<any[]>('/accounting/bank-accounts'), enabled });
export const useBankTransactions = (params: Record<string, unknown>) => useQuery({ queryKey: accountingKeys.bankTxns(params), queryFn: () => http.getPage<any>('/accounting/bank-transactions', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useReconciliation = (id: string) => useQuery({ queryKey: accountingKeys.reconciliation(id), queryFn: () => http.get<any>(`/accounting/bank-accounts/${id}/reconciliation`), enabled: Boolean(id) });
export const useMatchSuggestions = (id: string) => useQuery({ queryKey: accountingKeys.suggestions(id), queryFn: () => http.get<any[]>(`/accounting/bank-transactions/${id}/suggestions`), enabled: Boolean(id) });
export function useCreateBankAccount() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/accounting/bank-accounts', input), onSuccess: () => inv(qc, ...ALL) }); }
export function useUpdateBankAccount() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/accounting/bank-accounts/${id}`, input), onSuccess: () => inv(qc, accountingKeys.bankAccounts) }); }
export function useImportStatement() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, csv }: { id: string; csv: string }) => http.post<any>(`/accounting/bank-accounts/${id}/statement`, { csv }), onSuccess: () => inv(qc, ...ALL, ['payments']) }); }
export function useAddBankTransaction() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/accounting/bank-accounts/${id}/transactions`, input), onSuccess: () => inv(qc, ...ALL) }); }
export function useAutoMatch() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<{ matched: number }>(`/accounting/bank-accounts/${id}/auto-match`), onSuccess: () => inv(qc, ...ALL, ['payments']) }); }
export function useMatchTransaction() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...target }: { id: string; type: string; id2?: string } & Record<string, any>) => http.post<any>(`/accounting/bank-transactions/${id}/match`, { type: target.type, id: target.targetId }), onSuccess: () => inv(qc, ...ALL, ['payments']) }); }
export function useUnmatchTransaction() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/accounting/bank-transactions/${id}/unmatch`), onSuccess: () => inv(qc, ...ALL, ['payments']) }); }
export function useIgnoreTransaction() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, note }: { id: string; note?: string }) => http.post<any>(`/accounting/bank-transactions/${id}/ignore`, { note }), onSuccess: () => inv(qc, ...ALL) }); }
