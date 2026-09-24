import { useMutation, useQuery } from '@tanstack/react-query';
import type { LeadInput, LoginResponse, SignupInput } from '@society-erp/shared';
import { http } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { connectSocket } from '@/lib/socket';

export const publicKeys = {
  landing: (page: string) => ['public', 'landing', page] as const,
  plans: ['public', 'plans'] as const,
  settings: ['public', 'settings'] as const,
  signupConfig: ['public', 'signup-config'] as const,
};

export interface PublicSection {
  id: string;
  type: string;
  key: string;
  title: string;
  subtitle: string;
  description: string;
  content: Record<string, any>;
  image: string;
  icon: string;
  cta: { label?: string; href?: string; secondaryLabel?: string; secondaryHref?: string };
  metadata: Record<string, any>;
  sortOrder: number;
}

export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  trialDays: number;
  features: { key: string; label: string; description?: string; included: boolean }[];
  modules: { key: string; name: string }[];
  limits: Record<string, number | null>;
  highlighted: boolean;
  badge?: string;
  ctaLabel?: string;
  isDefault: boolean;
}

export interface PublicLanding {
  page: string;
  sections: PublicSection[];
  settings: Record<string, any>;
  plans: PublicPlan[];
  modules: { key: string; name: string; description?: string; icon: string; category: string }[];
}

export function usePublicLanding(page = 'home') {
  return useQuery({ queryKey: publicKeys.landing(page), queryFn: () => http.get<PublicLanding>('/public/landing', { params: { page } }), staleTime: 60_000 });
}

export function usePublicPlans() {
  return useQuery({ queryKey: publicKeys.plans, queryFn: () => http.getWithMeta<PublicPlan[], { pricing: Record<string, any> }>('/public/plans'), staleTime: 60_000 });
}

export function usePublicSettings() {
  return useQuery({ queryKey: publicKeys.settings, queryFn: () => http.get<Record<string, any>>('/public/settings'), staleTime: 5 * 60_000 });
}

export function useSignupConfig() {
  return useQuery({ queryKey: publicKeys.signupConfig, queryFn: () => http.get<{ enabled: boolean; defaultPlanId: string | null; plans: PublicPlan[]; trialDays: number; brandName: string }>('/public/signup/config') });
}

export function useCreateLead() {
  return useMutation({ mutationFn: (input: LeadInput) => http.post<{ id: string }>('/public/leads', input), meta: { silent: true } });
}

export function useCreatePublicTicket() {
  return useMutation({ mutationFn: (input: { name: string; email: string; phone?: string; subject: string; message: string }) => http.post<{ ticketNumber: string }>('/public/support', input), meta: { silent: true } });
}

export function useSignup() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: SignupInput) => http.post<LoginResponse & { societyId: string; slug: string }>('/public/signup', input),
    onSuccess: (data) => {
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.context);
      connectSocket(data.accessToken);
    },
    meta: { silent: true },
  });
}
