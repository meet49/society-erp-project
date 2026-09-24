import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { documentService, type Actor } from './documents.service';
import { documentCreateSchema, documentListQuerySchema, documentUpdateSchema, documentsConfigSchema, folderSchema, folderUpdateSchema, newVersionSchema, reviewSchema } from './documents.schemas';
import './documents.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const perms = (req: any) => req.tenant!.permissions as Set<string>;
/** ADMIN = can manage folders / delete; COMMITTEE = can upload or update; MEMBERS = everyone else (residents). */
const actor = (req: any): Actor => {
  const p = perms(req);
  const level = p.has('documents:manage_folders') || p.has('documents:delete') ? 'ADMIN' : p.has('documents:create') || p.has('documents:update') || p.has('documents:archive') ? 'COMMITTEE' : 'MEMBERS';
  return { userId: uid(req), level, unitIds: (req.tenant!.unitIds ?? []) as string[], canApprove: p.has('documents:update') };
};
const wfUser = (req: any) => ({ userId: uid(req), roleKeys: req.tenant!.roleKeys as string[], permissions: perms(req) });
const VIEW = ['documents:view', 'documents:view_own'] as const;

export const documentsRouter = Router();
documentsRouter.use(authenticate, requireSociety, requireModule('documents'), requireSubscription());

documentsRouter.get('/settings', authorizePermission('documents:update', 'documents:manage_folders'), asyncHandler(async (req, res) => ok(res, await documentService.getConfig(sid(req)))));
documentsRouter.put('/settings', authorizePermission('documents:manage_folders', 'documents:update'), validate(documentsConfigSchema), asyncHandler(async (req, res) => ok(res, await documentService.updateConfig(sid(req), req.body, uid(req), req))));
documentsRouter.get('/categories', authorizePermission(...VIEW), asyncHandler(async (req, res) => ok(res, await documentService.categories(sid(req)))));
documentsRouter.get('/stats', authorizePermission('documents:create', 'documents:update', 'documents:manage_folders'), asyncHandler(async (req, res) => ok(res, await documentService.stats(sid(req)))));

// folders
documentsRouter.get('/folders', authorizePermission(...VIEW), asyncHandler(async (req, res) => ok(res, await documentService.folders(sid(req), actor(req)))));
documentsRouter.post('/folders', authorizePermission('documents:manage_folders'), validate(folderSchema), asyncHandler(async (req, res) => created(res, await documentService.createFolder(sid(req), req.body, uid(req), req))));
documentsRouter.patch('/folders/:id', authorizePermission('documents:manage_folders'), validate(idParamSchema, 'params'), validate(folderUpdateSchema), asyncHandler(async (req, res) => ok(res, await documentService.updateFolder(sid(req), req.params.id, req.body, req))));
documentsRouter.delete('/folders/:id', authorizePermission('documents:manage_folders'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await documentService.removeFolder(sid(req), req.params.id, req); noContent(res); }));

// documents
documentsRouter.get('/', authorizePermission(...VIEW), validate(documentListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await documentService.list(sid(req), req.query as any, actor(req)))));
documentsRouter.post('/', authorizePermission('documents:create'), validate(documentCreateSchema), asyncHandler(async (req, res) => created(res, await documentService.create(sid(req), req.body, actor(req), req))));
documentsRouter.get('/:id', authorizePermission(...VIEW), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await documentService.get(sid(req), req.params.id, actor(req)))));
documentsRouter.patch('/:id', authorizePermission('documents:update'), validate(idParamSchema, 'params'), validate(documentUpdateSchema), asyncHandler(async (req, res) => ok(res, await documentService.update(sid(req), req.params.id, req.body, actor(req), req))));
documentsRouter.delete('/:id', authorizePermission('documents:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await documentService.remove(sid(req), req.params.id, req); noContent(res); }));
documentsRouter.post('/:id/versions', authorizePermission('documents:update', 'documents:create'), validate(idParamSchema, 'params'), validate(newVersionSchema), asyncHandler(async (req, res) => created(res, await documentService.addVersion(sid(req), req.params.id, req.body, actor(req), req))));
documentsRouter.post('/:id/download', authorizePermission('documents:download', 'documents:view_own'), validate(idParamSchema, 'params'), validate(z.object({ version: z.coerce.number().int().min(1).optional() })), asyncHandler(async (req, res) => ok(res, await documentService.downloadUrl(sid(req), req.params.id, actor(req), req.body.version, req))));
documentsRouter.post('/:id/archive', authorizePermission('documents:archive', 'documents:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await documentService.archive(sid(req), req.params.id, uid(req), req))));
documentsRouter.post('/:id/review', authorizePermission('documents:update'), validate(idParamSchema, 'params'), validate(reviewSchema), asyncHandler(async (req, res) => ok(res, await documentService.review(sid(req), req.params.id, req.body, wfUser(req), req))));
