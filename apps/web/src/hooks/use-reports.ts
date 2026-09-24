import { useMutation, useQuery, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';

export interface ReportColumn { key: string; label: string; type?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'hours' }
export interface ReportDescriptor { key: string; name: string; description: string; group: 'FINANCE' | 'OPERATIONS' | 'SECURITY' | 'COMMUNITY'; module: string; permission: string | null; params: ('period' | 'month' | 'asOf' | 'months')[]; columns: ReportColumn[]; chart: { type: 'bar' | 'line' | 'hbar'; xKey: string; series: { key: string; label: string }[]; stacked?: boolean; currency?: boolean } | null }
export interface ReportResult { report: ReportDescriptor; params: Record<string, any>; rows: Record<string, any>[]; totals?: Record<string, any>; summary?: Record<string, any>; generatedAt: string }

export const useReportCatalogue = () => useQuery({ queryKey: ['reports', 'catalogue'], queryFn: () => http.get<ReportDescriptor[]>('/reports'), staleTime: 5 * 60_000 });
export const useReportRun = (key: string, params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: ['reports', 'run', key, params], queryFn: () => http.get<ReportResult>(`/reports/${key}`, { params: buildQueryParams(params) }), placeholderData: keepPreviousData, enabled: enabled && Boolean(key) });
export function useExportReportCsv() { return useMutation({ mutationFn: async ({ key, params }: { key: string; params: Record<string, unknown> }) => { const { blob, filename } = await http.blob(`/reports/${key}/export`, { params: buildQueryParams(params) }); downloadFile(blob, filename ?? `${key}.csv`); } }); }
