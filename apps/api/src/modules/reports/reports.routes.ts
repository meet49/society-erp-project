import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { Errors } from '../../lib/errors';
import { auditService } from '../../core/audit/audit.service';
import { describeReport, REPORTS, REPORTS_BY_KEY, resolveParams, type ReportDefinition } from './reports.catalog';

const sid = (req: any) => req.tenant!.societyId as string;
const reportQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), asOf: z.coerce.date().optional(), months: z.coerce.number().int().min(1).max(24).optional() });
const keyParamSchema = z.object({ key: z.string().regex(/^[a-z0-9-]+$/) });

/** A report is available when its module is accessible for the society and the caller holds its extra permission (if any). */
function available(req: any, def: ReportDefinition): boolean {
  const modules: Set<string> = req.tenant!.accessibleModules ?? new Set();
  if (!modules.has(def.module)) return false;
  return !def.permission || hasPermission(req.tenant!.permissions, def.permission);
}

function load(req: any): ReportDefinition {
  const def = REPORTS_BY_KEY.get(req.params.key);
  if (!def || !available(req, def)) throw Errors.notFound('Report');
  return def;
}

export const reportsRouter = Router();
reportsRouter.use(authenticate, requireSociety, requireModule('reports'), requireSubscription());
reportsRouter.get('/', authorizePermission('reports:view'), asyncHandler(async (req, res) => ok(res, REPORTS.filter((r) => available(req, r)).map(describeReport))));
reportsRouter.get('/:key', authorizePermission('reports:view'), validate(keyParamSchema, 'params'), validate(reportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const def = load(req);
  const params = resolveParams(def, req.query as any);
  const result = await def.run(sid(req), params);
  return ok(res, { report: describeReport(def), params, ...result, generatedAt: new Date() });
}));
reportsRouter.get('/:key/export', authorizePermission('reports:export'), validate(keyParamSchema, 'params'), validate(reportQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const def = load(req);
  const params = resolveParams(def, req.query as any);
  const result = await def.run(sid(req), params);
  const rows = result.rows.map((r) => Object.fromEntries(def.columns.map((c) => [c.label, r[c.key] ?? ''])));
  if (result.totals) rows.push(Object.fromEntries(def.columns.map((c, i) => [c.label, i === 0 ? 'TOTAL' : (result.totals![c.key] ?? '')])));
  auditService.record({ action: 'report.exported', resource: 'Report', resourceId: def.key, societyId: sid(req), newValue: { params }, req });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${def.key}.csv"`);
  res.send(toCsv(rows));
}));
