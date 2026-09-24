import type { NavAudience } from '../modules/types';
import type { RoleLanding, SubscriptionStatus } from '../constants/enums';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface NavigationItem {
  key: string;
  module: string;
  group: string;
  label: string;
  path: string;
  icon?: string;
  sortOrder: number;
  audience: NavAudience;
}

export interface NavigationGroup {
  key: string;
  label: string;
  sortOrder: number;
  audience: NavAudience;
  items: NavigationItem[];
}

export interface AccessibleModule {
  key: string;
  name: string;
  icon: string;
  category: string;
  isCore: boolean;
  status: string;
  /** true when the module is usable by the society (global + plan + subscription + society toggle) */
  accessible: boolean;
  enabledBySociety: boolean;
  inPlan: boolean;
  globallyActive: boolean;
  featureFlagBlocked: boolean;
  /** true when the current user holds at least one permission in the module */
  userHasPermission: boolean;
  configuration?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface SubscriptionAccess {
  status: SubscriptionStatus | 'NONE';
  readOnly: boolean;
  blocked: boolean;
  renewalDate?: string | null;
  trialEndDate?: string | null;
  gracePeriodEndsAt?: string | null;
  planName?: string;
  planId?: string;
  daysRemaining?: number | null;
}

export interface AuthUserSociety {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  roleKeys: string[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: string;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  societies: AuthUserSociety[];
}

/** Everything the frontend needs to render a shell after login or society switch. */
export interface AccessContext {
  user: AuthUser;
  society: {
    id: string;
    name: string;
    slug: string;
    status: string;
    logoUrl?: string | null;
    timezone: string;
    currency: string;
    onboardingCompleted: boolean;
  } | null;
  roles: { id: string; key: string; name: string; landing: RoleLanding; color?: string }[];
  permissions: string[];
  landing: RoleLanding;
  modules: AccessibleModule[];
  navigation: NavigationGroup[];
  subscription: SubscriptionAccess | null;
  featureFlags: Record<string, boolean>;
  resident?: { id: string; unitIds: string[]; primaryUnitId?: string | null; type: string } | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

export interface LoginResponse extends TokenPair {
  context: AccessContext;
}
