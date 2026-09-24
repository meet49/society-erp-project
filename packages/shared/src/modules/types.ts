import type { ModuleCategory, ModuleStatus, RoleScope } from '../constants/enums';

export type NavAudience = 'ADMIN' | 'MEMBER' | 'GUARD' | 'PLATFORM';

export interface ModuleActionDefinition {
  /** action part of the permission key: `${module}:${action}` */
  key: string;
  label: string;
  description?: string;
  /** true when the action only grants access to the caller's own records (member self-service) */
  ownScope?: boolean;
}

export interface NavigationItemDefinition {
  /** stable id, unique per module */
  key: string;
  group: string;
  label: string;
  path: string;
  icon?: string;
  sortOrder: number;
  /** any of these permissions grants visibility */
  permissions: string[];
  audience: NavAudience;
  /** optional feature flag that must be enabled */
  featureFlag?: string;
}

export interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: ModuleCategory;
  scope: RoleScope;
  /** core modules are always available in every plan and cannot be disabled by a society */
  isCore: boolean;
  status: ModuleStatus;
  sortOrder: number;
  dependencies: string[];
  actions: ModuleActionDefinition[];
  navigation: NavigationItemDefinition[];
  featureFlag?: string;
  version: string;
  configuration: Record<string, unknown>;
}

export interface NavigationGroupDefinition {
  key: string;
  label: string;
  sortOrder: number;
  audience: NavAudience;
}
