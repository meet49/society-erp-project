/**
 * Permission helpers shared by backend (security boundary) and frontend (UX only).
 * Permission key format: `module:action`. Wildcards: `module:*` and `*`.
 */
export function parsePermission(key: string): { module: string; action: string } {
  const idx = key.indexOf(':');
  if (idx === -1) return { module: key, action: '*' };
  return { module: key.slice(0, idx), action: key.slice(idx + 1) };
}

export function permissionMatches(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = parsePermission(granted);
  const r = parsePermission(required);
  if (g.module !== r.module) return false;
  return g.action === '*' || g.action === r.action;
}

export function hasPermission(granted: Iterable<string>, required: string | string[]): boolean {
  const req = Array.isArray(required) ? required : [required];
  if (req.length === 0) return true;
  const list = Array.from(granted);
  return req.some((r) => list.some((g) => permissionMatches(g, r)));
}

export function hasAllPermissions(granted: Iterable<string>, required: string[]): boolean {
  const list = Array.from(granted);
  return required.every((r) => list.some((g) => permissionMatches(g, r)));
}

export function moduleOfPermission(key: string): string {
  return parsePermission(key).module;
}
