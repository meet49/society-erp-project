import { Router } from 'express';
import { z } from 'zod';
import { LandingSectionTypes, LeadStatus, LeadTypes, Priorities, SupportTicketSources, SupportTicketStatus, idParamSchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePlatformPermission as perm, requirePlatform, validate } from '../../middleware';
import { ok, created, noContent, paged } from '../../lib/response';
import { leadService } from '../public/leads.service';
import { supportService } from '../public/support.service';
import { landingService } from '../public/landing.service';
import { auditService } from '../../core/audit/audit.service';
import { toCsv } from '../../lib/csv';

export const crmRouter = Router();
crmRouter.use(authenticate, requirePlatform);

// ------------------------------------------------------------------ leads
const leadQuery = paginationQuerySchema.extend({ status: z.enum(Object.values(LeadStatus) as [string, ...string[]]).optional(), type: z.enum(LeadTypes).optional(), assignedTo: objectIdSchema.optional() });
const leadPatch = z.object({
  status: z.enum(Object.values(LeadStatus) as [string, ...string[]]).optional(),
  assignedTo: objectIdSchema.nullable().optional(),
  type: z.enum(LeadTypes).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  societyName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  message: z.string().trim().max(2000).optional(),
  convertedSocietyId: objectIdSchema.nullable().optional(),
});

crmRouter.get('/leads', perm('platform_leads:view'), validate(leadQuery, 'query'), asyncHandler(async (req, res) => paged(res, await leadService.list(req.query as any))));
crmRouter.get(
  '/leads/export',
  perm('platform_leads:export'),
  asyncHandler(async (req, res) => {
    const rows = await leadService.exportRows();
    auditService.record({ action: 'lead.exported', resource: 'Lead', metadata: { count: rows.length }, req });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(toCsv(rows));
  }),
);
crmRouter.get('/leads/:id', perm('platform_leads:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await leadService.get(req.params.id))));
crmRouter.patch('/leads/:id', perm('platform_leads:update', 'platform_leads:assign'), validate(idParamSchema, 'params'), validate(leadPatch), asyncHandler(async (req, res) => ok(res, await leadService.update(req.params.id, req.body, req.auth!.userId, req))));
crmRouter.post('/leads/:id/notes', perm('platform_leads:update'), validate(idParamSchema, 'params'), validate(z.object({ body: z.string().trim().min(1).max(2000) })), asyncHandler(async (req, res) => ok(res, await leadService.addNote(req.params.id, req.body.body, req.auth!.userId, req))));
crmRouter.delete('/leads/:id', perm('platform_leads:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await leadService.remove(req.params.id, req); noContent(res); }));

// ------------------------------------------------------------------ support inbox
const ticketQuery = paginationQuerySchema.extend({
  status: z.enum(['OPEN_ALL', 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(Priorities).optional(),
  source: z.enum(SupportTicketSources).optional(),
  assignedTo: z.union([objectIdSchema, z.literal('unassigned')]).optional(),
  societyId: objectIdSchema.optional(),
});
const ticketPatch = z.object({
  status: z.enum(Object.values(SupportTicketStatus) as [string, ...string[]]).optional(),
  priority: z.enum(Priorities).optional(),
  assignedTo: objectIdSchema.nullable().optional(),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().max(30)).max(20).optional(),
});
crmRouter.get('/support/stats', perm('platform_support:view'), asyncHandler(async (_req, res) => ok(res, await supportService.stats())));
crmRouter.get('/support', perm('platform_support:view'), validate(ticketQuery, 'query'), asyncHandler(async (req, res) => paged(res, await supportService.list(req.query as any))));
crmRouter.get('/support/:id', perm('platform_support:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await supportService.get(req.params.id, { includeInternal: true }))));
crmRouter.patch('/support/:id', perm('platform_support:update', 'platform_support:assign', 'platform_support:close'), validate(idParamSchema, 'params'), validate(ticketPatch), asyncHandler(async (req, res) => ok(res, await supportService.update(req.params.id, req.body, req.auth!.userId, req))));
crmRouter.post(
  '/support/:id/reply',
  perm('platform_support:reply'),
  validate(idParamSchema, 'params'),
  validate(z.object({ body: z.string().trim().min(1).max(8000), internal: z.boolean().optional(), status: z.enum(Object.values(SupportTicketStatus) as [string, ...string[]]).optional() })),
  asyncHandler(async (req, res) => ok(res, await supportService.replyAsPlatform(req.params.id, req.body, req.auth!.userId, req))),
);

// ------------------------------------------------------------------ landing CMS
const sectionBody = z.object({
  page: z.string().regex(/^[a-z-]+$/).max(40).optional(),
  type: z.enum(LandingSectionTypes).optional(),
  key: z.string().regex(/^[a-z0-9-]+$/).max(60).optional(),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  content: z.record(z.unknown()).optional(),
  image: z.string().max(500).optional(),
  icon: z.string().max(60).optional(),
  cta: z.object({ label: z.string().max(60).optional(), href: z.string().max(300).optional(), secondaryLabel: z.string().max(60).optional(), secondaryHref: z.string().max(300).optional() }).optional(),
  metadata: z.record(z.unknown()).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isVisible: z.boolean().optional(),
});
crmRouter.get('/landing/sections', perm('platform_landing:view'), validate(z.object({ page: z.string().optional() }), 'query'), asyncHandler(async (req, res) => ok(res, await landingService.list(req.query.page as string | undefined))));
crmRouter.get('/landing/preview', perm('platform_landing:view'), validate(z.object({ page: z.string().optional() }), 'query'), asyncHandler(async (req, res) => ok(res, await landingService.previewPage((req.query.page as string) || 'home'))));
crmRouter.post('/landing/sections', perm('platform_landing:update'), validate(sectionBody.required({ type: true, key: true })), asyncHandler(async (req, res) => created(res, await landingService.create(req.body, req.auth!.userId, req))));
crmRouter.put('/landing/sections/reorder', perm('platform_landing:update'), validate(z.object({ page: z.string().default('home'), orderedIds: z.array(objectIdSchema).min(1) })), asyncHandler(async (req, res) => { await landingService.reorder(req.body.page, req.body.orderedIds, req); noContent(res); }));
crmRouter.get('/landing/sections/:id', perm('platform_landing:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await landingService.get(req.params.id))));
crmRouter.patch('/landing/sections/:id', perm('platform_landing:update'), validate(idParamSchema, 'params'), validate(sectionBody), asyncHandler(async (req, res) => ok(res, await landingService.update(req.params.id, req.body, req.auth!.userId, req))));
crmRouter.post('/landing/sections/:id/publish', perm('platform_landing:publish'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await landingService.publish(req.params.id, req.auth!.userId, req))));
crmRouter.post('/landing/sections/:id/unpublish', perm('platform_landing:publish'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await landingService.unpublish(req.params.id, req.auth!.userId, req))));
crmRouter.post('/landing/sections/:id/discard-draft', perm('platform_landing:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await landingService.discardDraft(req.params.id))));
crmRouter.delete('/landing/sections/:id', perm('platform_landing:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await landingService.remove(req.params.id, req); noContent(res); }));
