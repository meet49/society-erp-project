import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatCell } from '@/features/reports/report-page';

describe('report cell formatting', () => {
  it('formats by column type', () => {
    render(<div><span data-testid="c">{formatCell(1234.5, { key: 'x', label: 'x', type: 'currency' })}</span><span data-testid="p">{formatCell(42.123, { key: 'x', label: 'x', type: 'percent' })}</span><span data-testid="h">{formatCell(3.5, { key: 'x', label: 'x', type: 'hours' })}</span><span data-testid="n">{formatCell(7, { key: 'x', label: 'x', type: 'number' })}</span><span data-testid="e">{formatCell(null, { key: 'x', label: 'x', type: 'number' })}</span></div>);
    expect(screen.getByTestId('c').textContent).toMatch(/1,234\.50|1,234\.5/);
    expect(screen.getByTestId('p').textContent).toBe('42.1%');
    expect(screen.getByTestId('h').textContent).toBe('3.5 h');
    expect(screen.getByTestId('n').textContent).toBe('7');
    expect(screen.getByTestId('e').textContent).toBe('—');
  });
});
