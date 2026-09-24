import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ErrorCodes } from '@society-erp/shared';
import { AppError, Errors } from '../lib/errors';
import { zodFields } from '../lib/validate';
import { isProd } from '../config/env';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(Errors.custom(404, ErrorCodes.NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found`));
};

function normalise(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return Errors.validation(zodFields(err));
  if (err instanceof mongoose.Error.ValidationError) {
    const fields: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(err.errors)) fields[k] = [v.message];
    return Errors.validation(fields);
  }
  if (err instanceof mongoose.Error.CastError) return Errors.badRequest(`Invalid value for ${err.path}`);
  const anyErr = err as any;
  if (anyErr?.code === 11000) {
    const keys = Object.keys(anyErr.keyPattern ?? anyErr.keyValue ?? {});
    return Errors.conflict(`A record with the same ${keys.join(', ') || 'value'} already exists`, { fields: keys });
  }
  if (anyErr?.type === 'entity.too.large') return Errors.custom(413, ErrorCodes.PAYLOAD_TOO_LARGE, 'Payload too large');
  if (anyErr?.type === 'entity.parse.failed') return Errors.badRequest('Malformed JSON body');
  if (anyErr?.name === 'MulterError') return Errors.badRequest(anyErr.message);
  return Errors.internal();
}

/** Global error middleware: consistent { code, message, fields } body; stack traces never leak in production. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalise(err);
  res.locals.errorCode = appError.code;
  if (appError.status >= 500) {
    (req.log ?? logger).error({ err, requestId: req.id }, 'Unhandled error');
  }
  const body: Record<string, unknown> = {
    code: appError.code,
    message: appError.expose ? appError.message : 'Something went wrong',
    requestId: req.id,
  };
  if (appError.fields) body.fields = appError.fields;
  if (appError.details) body.details = appError.details;
  if (!isProd && appError.status >= 500 && err instanceof Error) body.debug = { message: err.message, stack: err.stack?.split('\n').slice(0, 8) };
  res.status(appError.status).json(body);
};
