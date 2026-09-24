import { describe, it, expect } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import { StatusBadge } from '@/components/common/status-badge';
import { useListState } from '@/components/common/data-table';

describe('StatusBadge', () => {
  it('renders a readable label and a placeholder for missing status', () => {
    render(<><StatusBadge status="PENDING_APPROVAL" /><StatusBadge status={null} /></>);
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('useListState', () => {
  it('seeds filters from initial values, drops empty ones and resets the page on change', () => {
    const { result } = renderHook(() => useListState({ limit: 10, sort: 'name', filters: { status: 'OPEN', empty: '' } }));
    expect(result.current.params).toEqual({ page: 1, limit: 10, sort: 'name', search: undefined, status: 'OPEN' });
    act(() => result.current.setPage(3));
    expect(result.current.params.page).toBe(3);
    act(() => result.current.setFilter('status', 'CLOSED'));
    expect(result.current.params).toMatchObject({ page: 1, status: 'CLOSED' });
    act(() => result.current.setFilter('status', ''));
    expect((result.current.params as Record<string, unknown>).status).toBeUndefined();
  });
});
