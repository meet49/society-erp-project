import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { buildQueryParams } from '@/lib/utils';
import { useRefreshContext } from '@/hooks/use-auth';

export const societyKeys = {
  profile: ['society', 'profile'] as const,
  settings: ['society', 'settings'] as const,
  setting: (key: string) => ['society', 'settings', key] as const,
  modules: ['society', 'modules'] as const,
  roles: ['society', 'roles'] as const,
  role: (id: string) => ['society', 'role', id] as const,
  permissionCatalog: ['society', 'permission-catalog'] as const,
  users: (params?: Record<string, unknown>) => ['society', 'users', params ?? {}] as const,
  user: (id: string) => ['society', 'user', id] as const,
  invitations: (status?: string) => ['society', 'invitations', status ?? 'all'] as const,
  categories: (type?: string) => ['society', 'categories', type ?? 'all'] as const,
  audit: (params?: Record<string, unknown>) => ['society', 'audit', params ?? {}] as const,
  subscription: ['society', 'subscription'] as const,
  limits: ['society', 'limits'] as const,
  support: (params?: Record<string, unknown>) => ['society', 'support', params ?? {}] as const,
  supportTicket: (id: string) => ['society', 'support-ticket', id] as const,
};

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

/** Mutations that change access (roles, modules, subscription) also refresh the auth context. */
function useAccessMutation<TVars, TData = any>(fn: (vars: TVars) => Promise<TData>, keys: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  const refresh = useRefreshContext();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await inv(qc, ...keys);
      refresh.mutate();
    },
  });
}

// ---------------- profile & settings
export const useSocietyProfile = () => useQuery({ queryKey: societyKeys.profile, queryFn: () => http.get<any>('/society/profile') });
export function useUpdateSocietyProfile() {
  return useAccessMutation((input: any) => http.patch<any>('/society/profile', input), [societyKeys.profile]);
}
export function useUpdateOnboarding() {
  return useAccessMutation((input: { step?: number; completed?: boolean; skippedStep?: number }) => http.patch<any>('/society/onboarding', input), [societyKeys.profile]);
}
export const useSocietySettings = () => useQuery({ queryKey: societyKeys.settings, queryFn: () => http.get<Record<string, any>>('/society/settings') });
export const useSocietySetting = (key: string) => useQuery({ queryKey: societyKeys.setting(key), queryFn: () => http.get<any>(`/society/settings/${key}`) });
export function useSaveSocietySetting() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ key, value }: { key: string; value: Record<string, unknown> }) => http.put<any>(`/society/settings/${key}`, { value }), onSuccess: (_d, v) => inv(qc, societyKeys.settings, societyKeys.setting(v.key)) });
}

// ---------------- modules
export const useSocietyModules = () => useQuery({ queryKey: societyKeys.modules, queryFn: () => http.getWithMeta<any[], { plan: any; subscriptionStatus: string }>('/society/modules') });
export function useToggleModule() {
  return useAccessMutation(({ key, enabled }: { key: string; enabled: boolean }) => http.patch<any>(`/society/modules/${key}`, { enabled }), [societyKeys.modules, societyKeys.permissionCatalog]);
}
export function useUpdateModuleSettings() {
  return useAccessMutation(({ key, settings }: { key: string; settings: Record<string, unknown> }) => http.put<any>(`/society/modules/${key}/settings`, { settings }), [societyKeys.modules]);
}

// ---------------- roles
export const useRoles = () => useQuery({ queryKey: societyKeys.roles, queryFn: () => http.get<any[]>('/society/roles') });
export const useRole = (id: string) => useQuery({ queryKey: societyKeys.role(id), queryFn: () => http.get<any>(`/society/roles/${id}`), enabled: Boolean(id) });
export const usePermissionCatalog = () => useQuery({ queryKey: societyKeys.permissionCatalog, queryFn: () => http.get<any[]>('/society/roles/permission-catalog') });
export const useCreateRole = () => useAccessMutation((input: any) => http.post<any>('/society/roles', input), [societyKeys.roles]);
export const useUpdateRole = () => useAccessMutation(({ id, ...input }: any) => http.patch<any>(`/society/roles/${id}`, input), [societyKeys.roles, ['society', 'role'], ['society', 'users'], ['society', 'user']]);
export const useDeleteRole = () => useAccessMutation(({ id, reassignToRoleId }: { id: string; reassignToRoleId?: string }) => http.delete(`/society/roles/${id}`, { data: reassignToRoleId ? { reassignToRoleId } : {} }), [societyKeys.roles, ['society', 'users']]);
export const useCloneRole = () => useAccessMutation(({ id, name }: { id: string; name: string }) => http.post<any>(`/society/roles/${id}/clone`, { name }), [societyKeys.roles]);

// ---------------- users
export const useSocietyUsers = (params: Record<string, unknown>) => useQuery({ queryKey: societyKeys.users(params), queryFn: () => http.getPage<any>('/society/users', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useSocietyUser = (id: string) => useQuery({ queryKey: societyKeys.user(id), queryFn: () => http.get<any>(`/society/users/${id}`), enabled: Boolean(id) });
export const useInvitations = (status?: string) => useQuery({ queryKey: societyKeys.invitations(status), queryFn: () => http.get<any[]>('/society/users/invitations', { params: status ? { status } : undefined }) });
const userKeys = [['society', 'users'], ['society', 'user'], ['society', 'invitations'], societyKeys.limits, societyKeys.profile] as readonly (readonly unknown[])[];
export const useCreateSocietyUser = () => useAccessMutation((input: any) => http.post<any>('/society/users', input), userKeys);
export const useInviteUser = () => useAccessMutation((input: any) => http.post<any>('/society/users/invite', input), userKeys);
export const useResendInvitation = () => useAccessMutation((id: string) => http.post<any>(`/society/users/invitations/${id}/resend`), userKeys);
export const useRevokeInvitation = () => useAccessMutation((id: string) => http.delete(`/society/users/invitations/${id}`), userKeys);
export const useUpdateSocietyUser = () => useAccessMutation(({ userId, ...input }: any) => http.patch<any>(`/society/users/${userId}`, input), userKeys);
export const useSetUserStatus = () => useAccessMutation(({ userId, status }: { userId: string; status: 'ACTIVE' | 'INACTIVE' }) => http.patch<any>(`/society/users/${userId}/status`, { status }), userKeys);
export const useAssignUserRoles = () => useAccessMutation(({ userId, roleIds }: { userId: string; roleIds: string[] }) => http.put<any>(`/society/users/${userId}/roles`, { roleIds }), userKeys);
export const useSetDirectPermissions = () => useAccessMutation(({ userId, allow, deny }: { userId: string; allow: string[]; deny: string[] }) => http.put<any>(`/society/users/${userId}/permissions`, { allow, deny }), userKeys);
export const useRevokeUserSessions = () => useAccessMutation((userId: string) => http.post(`/society/users/${userId}/revoke-sessions`), userKeys);
export const useResetUserPassword = () => useMutation({ mutationFn: (userId: string) => http.post<{ tempPassword: string }>(`/society/users/${userId}/reset-password`) });
export const useEffectiveAccess = (userId: string) => useQuery({ queryKey: [...societyKeys.user(userId), 'effective'], queryFn: () => http.get<any>(`/society/users/${userId}/effective-access`), enabled: Boolean(userId) });

// ---------------- categories
export const useCategories = (type?: string, includeInactive = false) => useQuery({ queryKey: [...societyKeys.categories(type), includeInactive], queryFn: () => http.get<any[]>(type ? `/society/categories/${type}` : '/society/categories', { params: includeInactive ? { includeInactive: 'true' } : undefined }) });
export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ type, ...input }: any) => http.post<any>(`/society/categories/${type}`, input), onSuccess: () => inv(qc, ['society', 'categories']) });
}
export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ type, id, ...input }: any) => http.patch<any>(`/society/categories/${type}/${id}`, input), onSuccess: () => inv(qc, ['society', 'categories']) });
}
export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ type, id }: { type: string; id: string }) => http.delete(`/society/categories/${type}/${id}`), onSuccess: () => inv(qc, ['society', 'categories']) });
}
export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ type, orderedIds }: { type: string; orderedIds: string[] }) => http.put(`/society/categories/${type}/reorder`, { orderedIds }), onSuccess: () => inv(qc, ['society', 'categories']) });
}

// ---------------- audit, subscription, limits
export const useSocietyAudit = (params: Record<string, unknown>) => useQuery({ queryKey: societyKeys.audit(params), queryFn: () => http.getPage<any>('/society/audit', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useSocietySubscription = () => useQuery({ queryKey: societyKeys.subscription, queryFn: () => http.get<any>('/society/subscription') });
export const useChangePlanSelf = () => useAccessMutation((input: { planId: string; billingCycle?: string }) => http.post<any>('/society/subscription/change-plan', input), [societyKeys.subscription, societyKeys.modules, societyKeys.limits]);
export const useCancelSubscriptionSelf = () => useAccessMutation((input: { reason?: string }) => http.post<any>('/society/subscription/cancel', input), [societyKeys.subscription]);
export const useSocietyLimits = () => useQuery({ queryKey: societyKeys.limits, queryFn: () => http.get<any[]>('/society/limits') });

// ---------------- support (society side)
export const useSocietySupportTickets = (params: Record<string, unknown>) => useQuery({ queryKey: societyKeys.support(params), queryFn: () => http.getPage<any>('/society/support', buildQueryParams(params)), placeholderData: keepPreviousData });
export const useSocietySupportTicket = (id: string) => useQuery({ queryKey: societyKeys.supportTicket(id), queryFn: () => http.get<any>(`/society/support/${id}`), enabled: Boolean(id) });
export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: any) => http.post<any>('/society/support', input), onSuccess: () => inv(qc, ['society', 'support']) });
}
export function useReplySupportTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => http.post<any>(`/society/support/${id}/reply`, { body }), onSuccess: (_d, v) => inv(qc, ['society', 'support'], societyKeys.supportTicket(v.id)) });
}
