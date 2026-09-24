import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams } from '@/lib/utils';

export const platformKeys = {
  dashboard: ['platform', 'dashboard'] as const,
  analytics: ['platform', 'analytics'] as const,
  health: ['platform', 'health'] as const,
  societies: (params?: Record<string, unknown>) => ['platform', 'societies', params ?? {}] as const,
  society: (id: string) => ['platform', 'society', id] as const,
  societyModules: (id: string) => ['platform', 'society', id, 'modules'] as const,
  societyUsers: (id: string, params?: Record<string, unknown>) => ['platform', 'society', id, 'users', params ?? {}] as const,
  societyUsage: (id: string) => ['platform', 'society', id, 'usage'] as const,
  societyActivity: (id: string, params?: Record<string, unknown>) => ['platform', 'society', id, 'activity', params ?? {}] as const,
  subscriptions: (params?: Record<string, unknown>) => ['platform', 'subscriptions', params ?? {}] as const,
  subscription: (id: string) => ['platform', 'subscription', id] as const,
  expiryRadar: ['platform', 'expiry-radar'] as const,
  plans: (includeArchived?: boolean) => ['platform', 'plans', { includeArchived }] as const,
  plan: (id: string) => ['platform', 'plan', id] as const,
  modules: ['platform', 'modules'] as const,
  featureFlags: ['platform', 'feature-flags'] as const,
  settings: (group?: string) => ['platform', 'settings', group ?? 'all'] as const,
  users: ['platform', 'users'] as const,
  audit: (params?: Record<string, unknown>) => ['platform', 'audit', params ?? {}] as const,
  leads: (params?: Record<string, unknown>) => ['platform', 'leads', params ?? {}] as const,
  lead: (id: string) => ['platform', 'lead', id] as const,
  supportStats: ['platform', 'support', 'stats'] as const,
  tickets: (params?: Record<string, unknown>) => ['platform', 'tickets', params ?? {}] as const,
  ticket: (id: string) => ['platform', 'ticket', id] as const,
  landingSections: (page?: string) => ['platform', 'landing', 'sections', page ?? 'all'] as const,
  landingPreview: (page: string) => ['platform', 'landing', 'preview', page] as const,
  payments: (params?: Record<string, unknown>) => ['platform', 'payments', params ?? {}] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

// ---------------- dashboard / analytics / health
export const usePlatformDashboard = () => useQuery({ queryKey: platformKeys.dashboard, queryFn: () => http.get<any>('/platform/dashboard'), refetchInterval: 60_000 });
export const usePlatformAnalytics = () => useQuery({ queryKey: platformKeys.analytics, queryFn: () => http.get<any>('/platform/analytics') });
export const usePlatformHealth = () => useQuery({ queryKey: platformKeys.health, queryFn: () => http.get<any>('/platform/health'), refetchInterval: 30_000 });

// ---------------- societies
export const useSocieties = (params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.societies(params), queryFn: () => http.getPage<any>('/platform/societies', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useSocietyDetail = (id: string) => useQuery({ queryKey: platformKeys.society(id), queryFn: () => http.get<any>(`/platform/societies/${id}`), enabled: Boolean(id) });
export const useSocietyModulesPlatform = (id: string) => useQuery({ queryKey: platformKeys.societyModules(id), queryFn: () => http.get<any[]>(`/platform/societies/${id}/modules`), enabled: Boolean(id) });
export const useSocietyUsersPlatform = (id: string, params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.societyUsers(id, params), queryFn: () => http.getPage<any>(`/platform/societies/${id}/users`, buildQueryParams(params)), enabled: Boolean(id), placeholderData: keepPreviousData });
export const useSocietyUsage = (id: string) => useQuery({ queryKey: platformKeys.societyUsage(id), queryFn: () => http.get<any[]>(`/platform/societies/${id}/usage`), enabled: Boolean(id) });
export const useSocietyActivity = (id: string, params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.societyActivity(id, params), queryFn: () => http.getPage<any>(`/platform/societies/${id}/activity`, buildQueryParams(params)), enabled: Boolean(id), placeholderData: keepPreviousData });

export function useCreateSociety() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/platform/societies', input), onSuccess: () => inv(qc, ['platform', 'societies'], platformKeys.dashboard) });
}
export function useUpdateSocietyPlatform(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.patch<any>(`/platform/societies/${id}`, input), onSuccess: () => inv(qc, platformKeys.society(id), ['platform', 'societies']) });
}
export function useSetSocietyStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { status: string; reason?: string }) => http.patch<any>(`/platform/societies/${id}/status`, input), onSuccess: () => inv(qc, platformKeys.society(id), ['platform', 'societies'], platformKeys.dashboard) });
}
export function useToggleSocietyModulePlatform(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { key: string; enabled: boolean }) => http.patch<any>(`/platform/societies/${id}/modules/${input.key}`, { enabled: input.enabled }), onSuccess: () => inv(qc, platformKeys.societyModules(id), platformKeys.society(id)) });
}
export function useResetSocietyAdminPassword(id: string) {
  return useMutation({ mutationFn: () => http.post<{ tempPassword: string }>(`/platform/societies/${id}/reset-admin-password`) });
}

// ---------------- subscriptions
export const useSubscriptions = (params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.subscriptions(params), queryFn: () => http.getPage<any>('/platform/subscriptions', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useSubscriptionDetail = (id: string) => useQuery({ queryKey: platformKeys.subscription(id), queryFn: () => http.get<any>(`/platform/subscriptions/${id}`), enabled: Boolean(id) });
export const useExpiryRadar = () => useQuery({ queryKey: platformKeys.expiryRadar, queryFn: () => http.get<any[]>('/platform/subscriptions/expiry-radar') });

function useSubscriptionAction(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => http.post<any>(`/platform/subscriptions/${id}/${action}`, body),
    onSuccess: (_d, vars) => inv(qc, platformKeys.subscription(vars.id), ['platform', 'subscriptions'], platformKeys.expiryRadar, platformKeys.dashboard, ['platform', 'societies'], ['platform', 'society']),
  });
}
export const useExtendSubscription = () => useSubscriptionAction('extend');
export const useChangeSubscriptionPlan = () => useSubscriptionAction('change-plan');
export const useActivateSubscription = () => useSubscriptionAction('activate');
export const useSuspendSubscription = () => useSubscriptionAction('suspend');
export const useCancelSubscriptionPlatform = () => useSubscriptionAction('cancel');
export const useReactivateSubscription = () => useSubscriptionAction('reactivate');
export const useRemindSubscription = () => useSubscriptionAction('remind');
export function useRunLifecycle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => http.post<any>('/platform/subscriptions/run-lifecycle'), onSuccess: () => inv(qc, ['platform']) });
}

// ---------------- plans
export const usePlans = (includeArchived = false) => useQuery({ queryKey: platformKeys.plans(includeArchived), queryFn: () => http.get<any[]>('/platform/plans', { params: { includeArchived } }) });
export const usePlan = (id: string) => useQuery({ queryKey: platformKeys.plan(id), queryFn: () => http.get<any>(`/platform/plans/${id}`), enabled: Boolean(id) });
export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/platform/plans', input), onSuccess: () => inv(qc, ['platform', 'plans'], ['public']) });
}
export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/platform/plans/${id}`, input), onSuccess: (_d, v) => inv(qc, ['platform', 'plans'], platformKeys.plan(v.id), ['public']) });
}
export function useArchivePlan() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.post<any>(`/platform/plans/${id}/archive`), onSuccess: () => inv(qc, ['platform', 'plans'], ['public']) });
}

// ---------------- modules & flags
export const usePlatformModules = () => useQuery({ queryKey: platformKeys.modules, queryFn: () => http.get<any[]>('/platform/modules') });
export function useUpdatePlatformModule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ key, ...input }: any) => http.patch<any>(`/platform/modules/${key}`, input), onSuccess: () => inv(qc, platformKeys.modules, ['public']) });
}
export const useFeatureFlagsPlatform = () => useQuery({ queryKey: platformKeys.featureFlags, queryFn: () => http.get<any[]>('/platform/feature-flags') });
export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ key, ...input }: any) => http.patch<any>(`/platform/feature-flags/${key}`, input), onSuccess: () => inv(qc, platformKeys.featureFlags) });
}
export function useCreateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/platform/feature-flags', input), onSuccess: () => inv(qc, platformKeys.featureFlags) });
}

// ---------------- settings & users
export const usePlatformSettings = (group?: string) => useQuery({ queryKey: platformKeys.settings(group), queryFn: () => http.get<any[]>('/platform/settings', { params: group ? { group } : undefined }) });
export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (settings: { key: string; value: unknown }[]) => http.put('/platform/settings', { settings }), onSuccess: () => inv(qc, ['platform', 'settings'], ['public'], ['platform', 'landing']) });
}
export const usePlatformUsers = () => useQuery({ queryKey: platformKeys.users, queryFn: () => http.getWithMeta<any[], { roles: any[] }>('/platform/users') });
export function useCreatePlatformUser() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/platform/users', input), onSuccess: () => inv(qc, platformKeys.users) });
}
export function useSetPlatformUserRoles() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ userId, roleKeys }: { userId: string; roleKeys: string[] }) => http.put<any>(`/platform/users/${userId}/roles`, { roleKeys }), onSuccess: () => inv(qc, platformKeys.users) });
}
export const usePlatformAudit = (params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.audit(params), queryFn: () => http.getPage<any>('/platform/audit', buildQueryParams(params)), placeholderData: keepPreviousData });

// ---------------- leads
export const useLeads = (params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.leads(params), queryFn: () => http.getPage<any>('/platform/leads', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useLead = (id: string) => useQuery({ queryKey: platformKeys.lead(id), queryFn: () => http.get<any>(`/platform/leads/${id}`), enabled: Boolean(id) });
export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/platform/leads/${id}`, input), onSuccess: (_d, v) => inv(qc, ['platform', 'leads'], platformKeys.lead(v.id), platformKeys.dashboard) });
}
export function useAddLeadNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => http.post<any>(`/platform/leads/${id}/notes`, { body }), onSuccess: (_d, v) => inv(qc, platformKeys.lead(v.id)) });
}
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => http.delete(`/platform/leads/${id}`), onSuccess: () => inv(qc, ['platform', 'leads']) });
}

// ---------------- support inbox
export const useSupportStats = () => useQuery({ queryKey: platformKeys.supportStats, queryFn: () => http.get<any>('/platform/support/stats') });
export const useTickets = (params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.tickets(params), queryFn: () => http.getPage<any>('/platform/support', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useTicket = (id: string) => useQuery({ queryKey: platformKeys.ticket(id), queryFn: () => http.get<any>(`/platform/support/${id}`), enabled: Boolean(id) });
export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/platform/support/${id}`, input), onSuccess: (_d, v) => inv(qc, ['platform', 'tickets'], platformKeys.ticket(v.id), platformKeys.supportStats, platformKeys.dashboard) });
}
export function useReplyTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...input }: { id: string; body: string; internal?: boolean; status?: string }) => http.post<any>(`/platform/support/${id}/reply`, input), onSuccess: (_d, v) => inv(qc, ['platform', 'tickets'], platformKeys.ticket(v.id)) });
}

// ---------------- landing CMS
export const useLandingSections = (page?: string) => useQuery({ queryKey: platformKeys.landingSections(page), queryFn: () => http.get<any[]>('/platform/landing/sections', { params: page ? { page } : undefined }) });
export const useLandingPreview = (page = 'home') => useQuery({ queryKey: platformKeys.landingPreview(page), queryFn: () => http.get<any>('/platform/landing/preview', { params: { page } }) });
function useLandingMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => inv(qc, ['platform', 'landing'], ['public']) });
}
export const useCreateSection = () => useLandingMutation((input: any) => http.post<any>('/platform/landing/sections', input));
export const useUpdateSection = () => useLandingMutation(({ id, ...input }: any) => http.patch<any>(`/platform/landing/sections/${id}`, input));
export const usePublishSection = () => useLandingMutation((id: string) => http.post<any>(`/platform/landing/sections/${id}/publish`));
export const useUnpublishSection = () => useLandingMutation((id: string) => http.post<any>(`/platform/landing/sections/${id}/unpublish`));
export const useDiscardSectionDraft = () => useLandingMutation((id: string) => http.post<any>(`/platform/landing/sections/${id}/discard-draft`));
export const useReorderSections = () => useLandingMutation((input: { page: string; orderedIds: string[] }) => http.put('/platform/landing/sections/reorder', input));
export const useDeleteSection = () => useLandingMutation((id: string) => http.delete(`/platform/landing/sections/${id}`));

// ---------------- payments
export const usePlatformPayments = (params: Record<string, unknown>) => useQuery({ queryKey: platformKeys.payments(params), queryFn: () => http.getPage<any>('/platform/payments', buildQueryParams(params)), placeholderData: keepPreviousData });
