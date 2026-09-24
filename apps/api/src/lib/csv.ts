/** Minimal RFC 4180 CSV writer used by exports. */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label?: string }[]): string {
  if (!rows.length && !columns) return '';
  const cols = columns ?? Object.keys(rows[0] ?? {}).map((key) => ({ key, label: key }));
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => escape(c.label ?? c.key)).join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c.key])).join(','));
  return [header, ...body].join('\r\n');
}
