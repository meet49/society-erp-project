import type { Response } from 'express';
import type { Paginated } from '@society-erp/shared';

/**
 * Normalises API payloads: Mongoose documents are serialised through toJSON, lean objects get
 * `id` instead of `_id` (recursively), ObjectIds become strings. Dates are left for JSON.stringify.
 */
export function normalize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value !== 'object' || depth > 14) return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof (value as any).toJSON === 'function') {
    const json = (value as any).toJSON();
    return typeof json === 'object' && json !== null ? normalize(json, depth + 1) : json;
  }
  if (Array.isArray(value)) return value.map((v) => normalize(v, depth + 1));
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === '_id') {
      if (src.id === undefined) out.id = typeof v === 'object' && v !== null ? String(v) : (v as any);
      continue;
    }
    out[k] = normalize(v, depth + 1);
  }
  return out;
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200): void {
  const body = meta ? { data: normalize(data), meta } : { data: normalize(data) };
  res.status(status).json(body);
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, undefined, 201);
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function paged<T>(res: Response, page: Paginated<T>): void {
  res.status(200).json({ data: normalize(page.items), meta: { total: page.total, page: page.page, limit: page.limit, pages: page.pages } });
}
