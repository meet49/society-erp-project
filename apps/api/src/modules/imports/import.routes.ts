import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { hasPermission, idParamSchema, paginationQuerySchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged } from '../../lib/response';
import { Errors } from '../../lib/errors';
import { env } from '../../config/env';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { ImportStatuses, ImportTypes } from '../../models/import-job.model';
import { importService } from './import.service';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
const typeParamSchema = z.object({ type: z.enum(ImportTypes) });
const listQuerySchema = paginationQuerySchema.extend({ type: z.enum(ImportTypes).optional(), status: z.enum(ImportStatuses).optional() });
const mappingSchema = z.object({ mapping: z.record(z.string().max(200)), options: z.object({ skipExisting: z.boolean().optional(), sendInvites: z.boolean().optional() }).optional() });

/** The per-type permission (units:import, residents:import…) is required on top of society:import, and the module must be enabled. */
function assertType(req: any, type: string) {
  const def = importService.definition(type);
  if (!req.tenant!.accessibleModules?.has(def.module)) throw Errors.moduleDisabled(def.module);
  if (!hasPermission(req.tenant!.permissions, def.permission)) throw Errors.permissionDenied(def.permission);
  return def;
}

export const importRouter = Router();
importRouter.use(authenticate, requireSociety, requireSubscription(), authorizePermission('society:import'));
importRouter.get('/types', asyncHandler(async (req, res) => ok(res, importService.definitions().filter((d) => req.tenant!.accessibleModules?.has(d.module) && hasPermission(req.tenant!.permissions, d.permission)))));
importRouter.get('/templates/:type', validate(typeParamSchema, 'params'), asyncHandler(async (req, res) => { assertType(req, req.params.type); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.type.toLowerCase()}-template.csv"`); res.send(importService.template(req.params.type)); }));
importRouter.get('/', validate(listQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await importService.list(sid(req), req.query as any))));
importRouter.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const type = String(req.body?.type ?? '');
  assertType(req, type);
  const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
  if (!file) throw Errors.validation({ file: ['Choose a .csv or .xlsx file'] });
  return created(res, await importService.upload(sid(req), type, file, uid(req), req));
}));
importRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await importService.get(sid(req), req.params.id))));
importRouter.get('/:id/errors.csv', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="import-errors.csv"'); res.send(await importService.errorsCsv(sid(req), req.params.id)); }));
importRouter.put('/:id/mapping', validate(idParamSchema, 'params'), validate(mappingSchema), asyncHandler(async (req, res) => { const job = await importService.get(sid(req), req.params.id); assertType(req, job.type); return ok(res, await importService.validate(sid(req), req.params.id, req.body, uid(req), req)); }));
importRouter.post('/:id/run', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { const job = await importService.get(sid(req), req.params.id); assertType(req, job.type); return ok(res, await importService.start(sid(req), req.params.id, uid(req), req)); }));
importRouter.post('/:id/cancel', validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await importService.cancel(sid(req), req.params.id, uid(req), req))));

registerJobHandlers(() => {
  jobQueue.register<{ importId: string }>(JobNames.IMPORT_RUN, async (data) => {
    const r = await importService.run(data.importId);
    if (r) logger.info({ importId: data.importId, ...r }, 'Import finished');
  });
});
