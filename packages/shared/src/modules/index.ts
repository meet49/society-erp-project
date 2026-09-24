import { SOCIETY_MODULES } from './society-modules';
import { PLATFORM_MODULES } from './platform-modules';
import type { ModuleDefinition } from './types';

export * from './types';
export * from './society-modules';
export * from './platform-modules';
export * from './navigation-groups';
export * from './default-roles';

export const ALL_MODULES: ModuleDefinition[] = [...SOCIETY_MODULES, ...PLATFORM_MODULES];

export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return ALL_MODULES.find((m) => m.key === key);
}

export function permissionKey(moduleKey: string, action: string): string {
  return `${moduleKey}:${action}`;
}

export function modulePermissionKeys(mod: ModuleDefinition): string[] {
  return mod.actions.map((x) => permissionKey(mod.key, x.key));
}

export function allSocietyPermissionKeys(): string[] {
  return SOCIETY_MODULES.flatMap(modulePermissionKeys);
}

export function allPlatformPermissionKeys(): string[] {
  return PLATFORM_MODULES.flatMap(modulePermissionKeys);
}

export const CORE_SOCIETY_MODULE_KEYS = SOCIETY_MODULES.filter((m) => m.isCore).map((m) => m.key);
