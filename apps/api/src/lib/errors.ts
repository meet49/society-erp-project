import { ErrorCodes, type ErrorCode } from '@society-erp/shared';

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode | string;
  public readonly fields?: Record<string, string[]>;
  public readonly details?: Record<string, unknown>;
  public readonly expose: boolean;

  constructor(
    status: number,
    code: ErrorCode | string,
    message: string,
    opts: { fields?: Record<string, string[]>; details?: Record<string, unknown>; expose?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = opts.fields;
    this.details = opts.details;
    this.expose = opts.expose ?? true;
  }
}

export const Errors = {
  badRequest: (message = 'Bad request', details?: Record<string, unknown>) =>
    new AppError(400, ErrorCodes.BAD_REQUEST, message, { details }),
  validation: (fields: Record<string, string[]>, message = 'Validation failed') =>
    new AppError(422, ErrorCodes.VALIDATION_ERROR, message, { fields }),
  unauthenticated: (message = 'Authentication required', code: ErrorCode = ErrorCodes.UNAUTHENTICATED) =>
    new AppError(401, code, message),
  invalidCredentials: () => new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password'),
  forbidden: (message = 'You do not have access to this resource', code: ErrorCode = ErrorCodes.FORBIDDEN, details?: Record<string, unknown>) =>
    new AppError(403, code, message, { details }),
  permissionDenied: (permission: string | string[]) =>
    new AppError(403, ErrorCodes.PERMISSION_DENIED, 'You do not have permission to perform this action', {
      details: { required: Array.isArray(permission) ? permission : [permission] },
    }),
  notFound: (entity = 'Resource') => new AppError(404, ErrorCodes.NOT_FOUND, `${entity} not found`),
  conflict: (message: string, details?: Record<string, unknown>) => new AppError(409, ErrorCodes.CONFLICT, message, { details }),
  invalidTransition: (from: string, to: string, entity = 'Record') =>
    new AppError(409, ErrorCodes.INVALID_STATE_TRANSITION, `${entity} cannot move from ${from} to ${to}`, {
      details: { from, to },
    }),
  moduleDisabled: (moduleKey: string) =>
    new AppError(403, ErrorCodes.MODULE_DISABLED, `The ${moduleKey} module is disabled for this society`, {
      details: { module: moduleKey },
    }),
  moduleNotInPlan: (moduleKey: string) =>
    new AppError(403, ErrorCodes.MODULE_NOT_IN_PLAN, `The ${moduleKey} module is not included in your plan`, {
      details: { module: moduleKey, upgrade: true },
    }),
  moduleInactive: (moduleKey: string) =>
    new AppError(403, ErrorCodes.MODULE_INACTIVE, `The ${moduleKey} module is currently unavailable`, {
      details: { module: moduleKey },
    }),
  featureDisabled: (flag: string) =>
    new AppError(403, ErrorCodes.FEATURE_DISABLED, `This feature is not enabled`, { details: { featureFlag: flag } }),
  subscription: (code: ErrorCode, message: string, details?: Record<string, unknown>) => new AppError(402, code, message, { details }),
  limitExceeded: (limitKey: string, limit: number, current: number) =>
    new AppError(403, ErrorCodes.PLAN_LIMIT_EXCEEDED, `Plan limit reached for ${limitKey} (${current}/${limit})`, {
      details: { limitKey, limit, current, upgrade: true },
    }),
  rateLimited: () => new AppError(429, ErrorCodes.RATE_LIMITED, 'Too many requests, please slow down'),
  internal: (message = 'Something went wrong') => new AppError(500, ErrorCodes.INTERNAL_ERROR, message, { expose: false }),
  custom: (status: number, code: ErrorCode | string, message: string, details?: Record<string, unknown>) =>
    new AppError(status, code, message, { details }),
};

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
