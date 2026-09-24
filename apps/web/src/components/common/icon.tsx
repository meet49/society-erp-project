import * as React from 'react';
import { Box, type LucideProps } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

type IconName = keyof typeof dynamicIconImports;
const cache = new Map<string, React.LazyExoticComponent<React.ComponentType<LucideProps>>>();

/** "LayoutDashboard" → "layout-dashboard" (icon names in the database are PascalCase lucide names). */
function toKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
}

function resolve(name: string): React.LazyExoticComponent<React.ComponentType<LucideProps>> | null {
  const key = (name in dynamicIconImports ? name : toKebab(name)) as IconName;
  const loader = dynamicIconImports[key];
  if (!loader) return null;
  if (!cache.has(key)) cache.set(key, React.lazy(loader));
  return cache.get(key)!;
}

/** Renders a lucide icon by name, loaded on demand so the main bundle does not ship the whole icon set. */
export function DynamicIcon({ name, ...props }: { name?: string | null } & Omit<LucideProps, 'ref'>) {
  const Cmp = name ? resolve(name) : null;
  if (!Cmp) return <Box {...props} />;
  return (
    <React.Suspense fallback={<span className={props.className} style={{ display: 'inline-block' }} aria-hidden />}>
      <Cmp {...props} />
    </React.Suspense>
  );
}
