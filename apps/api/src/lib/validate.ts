import type { RequestHandler } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { Errors } from './errors';

export function zodFields(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (fields[key] ||= []).push(issue.message);
  }
  return fields;
}

type Source = 'body' | 'query' | 'params';

/**
 * Validates and REPLACES req[source] with the parsed (typed, coerced, stripped) value.
 * Unknown keys are dropped so clients cannot smuggle fields such as societyId.
 */
export function validate(schema: ZodSchema, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(Errors.validation(zodFields(result.error)));
      return;
    }
    (req as any)[source] = result.data;
    next();
  };
}

export function parseOrThrow<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.validation(zodFields(result.error));
  return result.data;
}
