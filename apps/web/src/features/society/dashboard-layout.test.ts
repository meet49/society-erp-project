import { describe, it, expect } from 'vitest';
import { applyLayout } from '@/features/society/dashboard-page';

const w = (key: string) => ({ key, module: 'm', permission: 'p', size: 'stat' as const, component: () => null });
const widgets = [w('a'), w('b'), w('c'), w('d')];

describe('dashboard layout', () => {
  it('keeps registration order when nothing is saved', () => {
    expect(applyLayout(widgets, null).map((x) => x.key)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('hides widgets and puts ordered ones first, the rest after in registration order', () => {
    expect(applyLayout(widgets, { hidden: ['b'], order: ['d', 'a'] }).map((x) => x.key)).toEqual(['d', 'a', 'c']);
  });
  it('ignores unknown keys in the saved layout', () => {
    expect(applyLayout(widgets, { hidden: ['zzz'], order: ['zzz', 'c'] }).map((x) => x.key)).toEqual(['c', 'a', 'b', 'd']);
  });
});
