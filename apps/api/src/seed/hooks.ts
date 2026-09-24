/** Seed hook registry: business modules register demo-data generators without touching the seed entry point. */
export interface SeedContext {
  societyId: string;
  adminUserId: string;
}

type Hook = (ctx: SeedContext) => Promise<void>;
const hooks: { name: string; fn: Hook }[] = [];

export function registerSeedHooks(name: string, fn: Hook): void {
  if (!hooks.some((h) => h.name === name)) hooks.push({ name, fn });
}

export async function runSeedHooks(ctx: SeedContext): Promise<void> {
  for (const h of hooks) await h.fn(ctx);
}
