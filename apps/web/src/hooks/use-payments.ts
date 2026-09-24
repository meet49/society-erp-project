import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams, downloadFile } from '@/lib/utils';
import { BILLING_RELATED } from '@/hooks/use-billing';
import { societyKeys } from '@/hooks/use-society';
import { useRefreshContext } from '@/hooks/use-auth';

export const paymentKeys = {
  list: (params?: Record<string, unknown>) => ['payments', 'list', params ?? {}] as const,
  detail: (id: string) => ['payments', 'detail', id] as const,
  receipt: (id: string) => ['payments', 'receipt', id] as const,
  stats: ['payments', 'stats'] as const,
  gateway: ['payments', 'gateway'] as const,
  gatewayPublic: ['payments', 'gateway-public'] as const,
  orders: (params?: Record<string, unknown>) => ['payments', 'orders', params ?? {}] as const,
  subscriptionQuote: (cycle?: string) => ['society', 'subscription', 'quote', cycle ?? ''] as const,
  subscriptionHistory: ['society', 'subscription', 'payments'] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

// ------------------------------------------------------------------ society payments
export const usePayments = (params: Record<string, unknown>, enabled = true) => useQuery({ queryKey: paymentKeys.list(params), queryFn: () => http.getPage<any>('/payments', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const usePayment = (id: string) => useQuery({ queryKey: paymentKeys.detail(id), queryFn: () => http.get<any>(`/payments/${id}`), enabled: Boolean(id) });
export const useReceipt = (id: string) => useQuery({ queryKey: paymentKeys.receipt(id), queryFn: () => http.get<any>(`/payments/${id}/receipt`), enabled: Boolean(id) });
export const usePaymentStats = () => useQuery({ queryKey: paymentKeys.stats, queryFn: () => http.get<any>('/payments/stats') });

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/payments', input), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: { id: string; amount?: number; reason: string }) => http.post<any>(`/payments/${id}/refund`, input), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}
export function useReconcilePayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: { id: string; reconciled: boolean; note?: string }) => http.post<any>(`/payments/${id}/reconcile`, input), onSuccess: () => inv(qc, ['payments']) });
}
export function useExportPayments() {
  return useMutation({ mutationFn: async (params: Record<string, unknown>) => { const { blob, filename } = await http.blob('/payments/export', { params: buildQueryParams(params) }); downloadFile(blob, filename ?? 'payments.csv'); } });
}

// ------------------------------------------------------------------ gateway
export const useGatewayConfig = () => useQuery({ queryKey: paymentKeys.gateway, queryFn: () => http.get<any>('/payments/gateway') });
export const useGatewayPublic = (enabled = true) => useQuery({ queryKey: paymentKeys.gatewayPublic, queryFn: () => http.get<any>('/payments/gateway/public'), enabled, staleTime: 60_000 });
export function useSaveGatewayConfig() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.put<any>('/payments/gateway', input), onSuccess: () => inv(qc, ['payments', 'gateway'], ['payments', 'gateway-public'], societyKeys.settings) });
}

// ------------------------------------------------------------------ online orders (society gateway)
export interface CheckoutOrder {
  orderId: string;
  providerOrderId: string;
  provider: 'razorpay' | 'mock' | string;
  keyId?: string;
  amount: number;
  currency: string;
  baseAmount?: number;
  convenienceFee?: number;
  displayName?: string;
  testMode?: boolean;
  allowedMethods?: string[];
  planName?: string;
  billingCycle?: string;
  free?: boolean;
}
export const usePaymentOrders = (params: Record<string, unknown>) => useQuery({ queryKey: paymentKeys.orders(params), queryFn: () => http.getPage<any>('/payments/orders', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useCreateOrder = () => useMutation({ mutationFn: (input: { unitId?: string; invoiceIds?: string[]; amount?: number }) => http.post<CheckoutOrder>('/payments/orders', input) });
export const useSimulateGateway = () => useMutation({ mutationFn: ({ orderId, outcome }: { orderId: string; outcome?: 'success' | 'failure' }) => http.post<{ status: 'PAID' | 'FAILED'; paymentId?: string; signature?: string }>(`/payments/orders/${orderId}/simulate`, { outcome }) });
export function useVerifyOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ orderId, ...input }: { orderId: string; paymentId: string; signature: string }) => http.post<{ payment: any; alreadyProcessed: boolean }>(`/payments/orders/${orderId}/verify`, input), onSuccess: () => inv(qc, ...BILLING_RELATED) });
}

// ------------------------------------------------------------------ subscription payments (platform gateway)
export const useSubscriptionQuote = (cycle?: 'MONTHLY' | 'ANNUAL', enabled = true) => useQuery({ queryKey: paymentKeys.subscriptionQuote(cycle), queryFn: () => http.get<any>('/society/subscription/pay/quote', { params: cycle ? { billingCycle: cycle } : undefined }), enabled });
export const useSubscriptionPaymentHistory = () => useQuery({ queryKey: paymentKeys.subscriptionHistory, queryFn: () => http.getPage<any>('/society/subscription/pay/history', { limit: 20 }) });
export const useCreateSubscriptionOrder = () => useMutation({ mutationFn: (input: { billingCycle?: 'MONTHLY' | 'ANNUAL' }) => http.post<CheckoutOrder & { subscription?: any }>('/society/subscription/pay/order', input) });
export const useSimulateSubscriptionGateway = () => useMutation({ mutationFn: ({ orderId, outcome }: { orderId: string; outcome?: 'success' | 'failure' }) => http.post<{ status: 'PAID' | 'FAILED'; paymentId?: string; signature?: string }>(`/society/subscription/pay/order/${orderId}/simulate`, { outcome }) });
export function useVerifySubscriptionOrder() {
  const qc = useQueryClient();
  const refresh = useRefreshContext();
  return useMutation({
    mutationFn: ({ orderId, ...input }: { orderId: string; paymentId: string; signature: string }) => http.post<{ payment: any; subscription: any; alreadyProcessed: boolean }>(`/society/subscription/pay/order/${orderId}/verify`, input),
    onSuccess: async () => { await inv(qc, societyKeys.subscription, paymentKeys.subscriptionHistory, societyKeys.modules, societyKeys.limits); refresh.mutate(); },
  });
}

// ------------------------------------------------------------------ platform console
export function useRecordPlatformPayment() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/platform/payments/record', input), onSuccess: () => inv(qc, ['platform', 'payments'], ['platform', 'subscriptions'], ['platform', 'subscription'], ['platform', 'societies'], ['platform', 'society'], ['platform', 'dashboard']) });
}
