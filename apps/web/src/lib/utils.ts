import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();
export function formatCurrency(amount: number | null | undefined, currency = 'INR', opts: { compact?: boolean; decimals?: number } = {}): string {
  const value = Number(amount ?? 0);
  const key = `${currency}:${opts.compact ? 'c' : 'f'}:${opts.decimals ?? ''}`;
  if (!currencyFormatters.has(key)) {
    currencyFormatters.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits: opts.decimals ?? (Number.isInteger(value) ? 0 : 2),
        minimumFractionDigits: 0,
        notation: opts.compact ? 'compact' : 'standard',
      }),
    );
  }
  return currencyFormatters.get(key)!.format(value);
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(Number(value ?? 0));
}

export function formatDate(value: string | Date | null | undefined, fmt = 'DD MMM YYYY'): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format(fmt) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'DD MMM YYYY, hh:mm A');
}

export function formatTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'hh:mm A');
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).fromNow();
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/[^0-9+]/g, '');
  if (/^\+?91\d{10}$/.test(digits)) {
    const n = digits.slice(-10);
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return value;
}

/** SNAKE_CASE → "Snake case" */
export function formatStatus(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
  };
  return wrapped;
}

export function buildQueryParams(params: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = Array.isArray(v) ? v.join(',') : v instanceof Date ? v.toISOString() : String(v);
  }
  return out;
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  return dayjs(a).startOf('day').diff(dayjs(b).startOf('day'), 'day');
}

export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DD');
}

export function toInputDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
}
