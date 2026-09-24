import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok } from '../../lib/response';
import { workflowService } from '../../core/workflows/workflow.service';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const actor = (req: any) => ({ userId: uid(req), roleKeys: req.tenant!.roleKeys as string[], permissions: req.tenant!.permissions as Set<string> });

const conditionSchema = z.object({ field: z.string().trim().min(1).max(40), operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in']), value: z.unknown() }).nullable();
const stepSchema = z.object({
  order: z.coerce.number().int().min(1).default(1),
  name: z.string().trim().min(2).max(80),
  approverType: z.enum(['ROLE', 'USER', 'PERMISSION']),
  approverRef: z.string().trim().min(1).max(80),
  condition: conditionSchema.optional(),
  requiredApprovals: z.coerce.number().int().min(1).max(10).default(1),
});
const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  active: z.boolean().optional(),
  steps: z.array(stepSchema).max(10).optional(),
  autoApproveCondition: conditionSchema.optional(),
});
const keyParam = z.object({ key: z.string().regex(/^[a-z_]+$/) });
const decideSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() });

/** Settings → Workflows: per-society approval chains (steps, approvers, conditions). */
export const workflowsRouter = Router();
workflowsRouter.use(authenticate, requireSociety, requireSubscription());
workflowsRouter.get('/', authorizePermission('society:manage_workflows', 'society:manage_settings', 'society:view'), asyncHandler(async (req, res) => ok(res, await workflowService.list(sid(req)))));
workflowsRouter.get('/instances', authorizePermission('society:manage_workflows', 'society:manage_settings', 'society:view_audit'), validate(z.object({ entityType: z.string().max(40).optional(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }), 'query'), asyncHandler(async (req, res) => ok(res, await workflowService.listInstances(sid(req), req.query as any))));
workflowsRouter.get('/:key', authorizePermission('society:manage_workflows', 'society:manage_settings', 'society:view'), validate(keyParam, 'params'), asyncHandler(async (req, res) => ok(res, await workflowService.get(sid(req), req.params.key))));
workflowsRouter.put('/:key', authorizePermission('society:manage_workflows', 'society:manage_settings'), validate(keyParam, 'params'), validate(updateSchema), asyncHandler(async (req, res) => ok(res, await workflowService.update(sid(req), req.params.key, req.body as any, uid(req), req))));

/** Approvals inbox: requests waiting on the caller, and decisions. Any society member may have approvals depending on workflow config. */
export const approvalsRouter = Router();
approvalsRouter.use(authenticate, requireSociety, requireSubscription());
approvalsRouter.get('/', validate(z.object({ entityType: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }), 'query'), asyncHandler(async (req, res) => ok(res, await workflowService.pendingFor(sid(req), actor(req), req.query as any))));
approvalsRouter.post('/:id/decide', validate(idParamSchema, 'params'), validate(decideSchema), asyncHandler(async (req, res) => ok(res, (await workflowService.decide(sid(req), req.params.id, actor(req), req.body.decision, req.body.note, req)).toJSON())));
