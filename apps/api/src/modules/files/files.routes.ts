import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { asyncHandler, authenticate, requireSociety, validate } from '../../middleware';
import { created } from '../../lib/response';
import { auditService } from '../../core/audit/audit.service';
import { env } from '../../config/env';
import { storageService, verifyLocalSignature } from '../../core/storage/storage.service';
import { Errors } from '../../lib/errors';

/**
 * Serves locally stored files through time-limited signed URLs (see StorageService). No session is
 * needed: the signature is the capability, exactly like an S3 presigned URL. Never lists or browses.
 */
export const filesRouter = Router();

filesRouter.get(
  '/',
  validate(z.object({ key: z.string().min(3).max(300), expires: z.coerce.number().int(), sig: z.string().min(10).max(80), name: z.string().max(200).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const { key, expires, sig, name } = req.query as any;
    if (storageService.driver.name !== 'local' || !verifyLocalSignature(key, Number(expires), sig)) throw Errors.forbidden('This link is invalid or has expired');
    const body = await storageService.get(key).catch(() => null);
    if (!body) throw Errors.notFound('File');
    const ext = key.split('.').pop()?.toLowerCase();
    const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'pdf' ? 'application/pdf' : ext === 'csv' ? 'text/csv' : ext === 'txt' ? 'text/plain; charset=utf-8' : ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (name) res.setHeader('Content-Disposition', `inline; filename="${String(name).replace(/"/g, '')}"`);
    res.send(body);
  }),
);

/**
 * Authenticated upload for attachments (complaints, notices, documents…). Files land in the caller's
 * society namespace; the response carries the storage key plus a short-lived preview URL. Modules
 * verify ownership of the key (`storageService.assertOwned`) before linking it to a record.
 */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
filesRouter.post(
  '/upload',
  authenticate,
  requireSociety,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
    if (!file) throw Errors.validation({ file: ['Choose a file to upload'] });
    const scope = String(req.body?.scope ?? 'uploads').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'uploads';
    const stored = await storageService.store({ societyId: req.tenant!.societyId, scope, body: file.buffer, mimeType: file.mimetype, name: file.originalname });
    auditService.record({ action: 'file.uploaded', resource: 'File', resourceId: stored.storageKey, societyId: req.tenant!.societyId, metadata: { scope, size: stored.size, mimeType: stored.mimeType }, req });
    created(res, { ...stored, url: await storageService.signedUrl(stored.storageKey, { expiresInSeconds: 10 * 60, fileName: stored.name }) });
  }),
);
