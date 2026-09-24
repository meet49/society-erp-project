import type { Model, FilterQuery, PipelineStage, PopulateOptions } from 'mongoose';
import type { Paginated } from '@society-erp/shared';

export interface PageOptions {
  page?: number;
  limit?: number;
  sort?: string;
  defaultSort?: string;
  allowedSorts?: string[];
  populate?: PopulateOptions | (PopulateOptions | string)[] | string;
  select?: string;
  lean?: boolean;
}

export function parseSort(sort: string | undefined, allowed: string[] | undefined, fallback: string): Record<string, 1 | -1> {
  const raw = sort && sort.trim() ? sort.trim() : fallback;
  const result: Record<string, 1 | -1> = {};
  raw.split(',').forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const desc = p.startsWith('-');
    const field = desc ? p.slice(1) : p;
    if (allowed && !allowed.includes(field)) return;
    result[field] = desc ? -1 : 1;
  });
  if (Object.keys(result).length === 0) result[fallback.replace(/^-/, '')] = fallback.startsWith('-') ? -1 : 1;
  return result;
}

export async function paginate<T>(model: Model<T>, filter: FilterQuery<T>, opts: PageOptions = {}): Promise<Paginated<any>> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 20));
  const sort = parseSort(opts.sort, opts.allowedSorts, opts.defaultSort ?? '-createdAt');
  let query = model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (opts.select) query = query.select(opts.select);
  if (opts.populate) query = query.populate(opts.populate as any);
  if (opts.lean !== false) query = query.lean() as any;
  const [items, total] = await Promise.all([query.exec(), model.countDocuments(filter)]);
  return { items: items as any[], total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function paginateAggregate<T>(
  model: Model<T>,
  pipeline: PipelineStage[],
  opts: { page?: number; limit?: number; sort?: Record<string, 1 | -1> } = {},
): Promise<Paginated<any>> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 20));
  const facet: PipelineStage[] = [
    ...pipeline,
    {
      $facet: {
        items: [...(opts.sort ? [{ $sort: opts.sort } as PipelineStage.Sort] : []), { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ];
  const [result] = await model.aggregate(facet).exec();
  const total = result?.total?.[0]?.count ?? 0;
  return { items: result?.items ?? [], total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function searchRegex(search: string | undefined): RegExp | null {
  if (!search || !search.trim()) return null;
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}
