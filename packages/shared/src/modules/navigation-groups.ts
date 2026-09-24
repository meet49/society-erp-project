import type { NavigationGroupDefinition } from './types';

/**
 * Default navigation groups. Seeded into platform settings (`navigation.groups`) so the platform
 * owner can relabel / reorder without code changes.
 */
export const NAVIGATION_GROUPS: NavigationGroupDefinition[] = [
  // society admin console
  { key: 'overview', label: 'Overview', sortOrder: 0, audience: 'ADMIN' },
  { key: 'community', label: 'Community', sortOrder: 1, audience: 'ADMIN' },
  { key: 'finance', label: 'Finance', sortOrder: 2, audience: 'ADMIN' },
  { key: 'operations', label: 'Operations', sortOrder: 3, audience: 'ADMIN' },
  { key: 'communication', label: 'Communication', sortOrder: 4, audience: 'ADMIN' },
  { key: 'governance', label: 'Governance', sortOrder: 5, audience: 'ADMIN' },
  { key: 'reports', label: 'Reports', sortOrder: 6, audience: 'ADMIN' },
  { key: 'support', label: 'Support', sortOrder: 7, audience: 'ADMIN' },
  { key: 'settings', label: 'Settings', sortOrder: 8, audience: 'ADMIN' },
  // resident self-service
  { key: 'my', label: 'My Home', sortOrder: 0, audience: 'MEMBER' },
  // guard
  { key: 'gate', label: 'Gate', sortOrder: 0, audience: 'GUARD' },
  // platform console
  { key: 'overview', label: 'Overview', sortOrder: 0, audience: 'PLATFORM' },
  { key: 'saas', label: 'SaaS', sortOrder: 1, audience: 'PLATFORM' },
  { key: 'product', label: 'Product', sortOrder: 2, audience: 'PLATFORM' },
  { key: 'website', label: 'Website', sortOrder: 3, audience: 'PLATFORM' },
  { key: 'customers', label: 'Customers', sortOrder: 4, audience: 'PLATFORM' },
  { key: 'analytics', label: 'Analytics', sortOrder: 5, audience: 'PLATFORM' },
  { key: 'system', label: 'System', sortOrder: 6, audience: 'PLATFORM' },
];
