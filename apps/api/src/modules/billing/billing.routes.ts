import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, noContent, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { Errors } from '../../lib/errors';
import { billingService } from './billing.service';
import { meterService } from './meter.service';
import { FORMULA_VARIABLES, evaluateFormula } from './charge-calculator';
import { billingConfigSchema, cancelSchema, chargeHeadSchema, chargeHeadUpdateSchema, invoiceCreateSchema, invoiceListQuerySchema, invoiceUpdateSchema, ledgerQuerySchema, meterBulkSchema, meterImportSchema, meterListQuerySchema, meterReadingSchema, runCreateSchema, runListQuerySchema } from './billing.schemas';
import './billing.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const scope = (req: any) => (req.ownScope ? { unitIds: req.tenant!.unitIds as string[] } : {});

export const billingRouter = Router();
billingRouter.use(authenticate, requireSociety, requireModule('billing'), requireSubscription());

// ---- configuration & charge heads
billingRouter.get('/config', authorizePermission('billing:configure', 'billing:view', 'billing:view_own'), asyncHandler(async (req, res) => ok(res, await billingService.getConfig(sid(req)))));
billingRouter.put('/config', authorizePermission('billing:configure'), validate(billingConfigSchema.partial()), asyncHandler(async (req, res) => ok(res, await billingService.setConfig(sid(req), req.body, uid(req), req))));
billingRouter.post(
  '/config/formula-test',
  authorizePermission('billing:configure'),
  validate(z.object({ formula: z.string().min(1).max(200), vars: z.record(z.coerce.number()).optional() })),
  asyncHandler(async (req, res) => {
    const vars = { area: 1000, floor: 1, bedrooms: 2, consumption: 10, amount: 100, rate: 1, units: 1, ...(req.body.vars ?? {}) };
    try {
      ok(res, { result: evaluateFormula(req.body.formula, vars), vars, variables: FORMULA_VARIABLES });
    } catch (err) {
      ok(res, { error: (err as Error).message, vars, variables: FORMULA_VARIABLES });
    }
  }),
);
billingRouter.get('/charge-heads', authorizePermission('billing:view', 'billing:configure'), asyncHandler(async (req, res) => ok(res, await billingService.listChargeHeads(sid(req), req.query.includeInactive === 'true'))));
billingRouter.post('/charge-heads', authorizePermission('billing:configure'), validate(chargeHeadSchema), asyncHandler(async (req, res) => created(res, await billingService.createChargeHead(sid(req), req.body, uid(req), req))));
billingRouter.patch('/charge-heads/:id', authorizePermission('billing:configure'), validate(idParamSchema, 'params'), validate(chargeHeadUpdateSchema), asyncHandler(async (req, res) => ok(res, await billingService.updateChargeHead(sid(req), req.params.id, req.body, req))));
billingRouter.delete('/charge-heads/:id', authorizePermission('billing:configure'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await billingService.deactivateChargeHead(sid(req), req.params.id, req); noContent(res); }));

// ---- stats & export
billingRouter.get('/stats', authorizePermission('billing:view'), asyncHandler(async (req, res) => ok(res, await billingService.stats(sid(req)))));
billingRouter.get(
  '/export',
  authorizePermission('billing:export'),
  validate(invoiceListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const rows = await billingService.exportRows(sid(req), req.query as any);
    auditService.record({ action: 'billing.exported', resource: 'Invoice', societyId: sid(req), metadata: { count: rows.length }, req });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
    res.send(toCsv(rows));
  }),
);

// ---- billing runs
billingRouter.get('/runs', authorizePermission('billing:view', 'billing:generate'), validate(runListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await billingService.listRuns(sid(req), req.query as any))));
billingRouter.post('/runs/preview', authorizePermission('billing:generate'), validate(runCreateSchema), asyncHandler(async (req, res) => ok(res, await billingService.previewRun(sid(req), req.body))));
billingRouter.post('/runs', authorizePermission('billing:generate'), validate(runCreateSchema), asyncHandler(async (req, res) => created(res, (await billingService.generateRun(sid(req), req.body, uid(req), req)).toJSON())));
billingRouter.get('/runs/:id', authorizePermission('billing:view', 'billing:generate'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await billingService.getRun(sid(req), req.params.id))));
billingRouter.post('/runs/:id/issue', authorizePermission('billing:issue'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, (await billingService.issueRun(sid(req), req.params.id, uid(req), req)).toJSON())));
billingRouter.post('/runs/:id/cancel', authorizePermission('billing:cancel'), validate(idParamSchema, 'params'), validate(cancelSchema), asyncHandler(async (req, res) => ok(res, (await billingService.cancelRun(sid(req), req.params.id, req.body.reason, uid(req), req)).toJSON())));

// ---- unit ledger
billingRouter.get(
  '/units/:id/ledger',
  authorizePermission('billing:view', 'billing:view_own'),
  validate(idParamSchema, 'params'),
  validate(ledgerQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const s = scope(req);
    if (s.unitIds && !s.unitIds.includes(req.params.id)) throw Errors.notFound('Unit');
    ok(res, await billingService.unitLedger(sid(req), req.params.id, req.query as any));
  }),
);
billingRouter.get(
  '/units/:id/balance',
  authorizePermission('billing:view', 'billing:view_own'),
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const s = scope(req);
    if (s.unitIds && !s.unitIds.includes(req.params.id)) throw Errors.notFound('Unit');
    ok(res, { unitId: req.params.id, balance: await billingService.getUnitBalance(sid(req), req.params.id) });
  }),
);

// ---- meter readings
billingRouter.get('/meters/types', authorizePermission('billing:meter_readings', 'billing:configure', 'billing:view'), asyncHandler(async (req, res) => ok(res, await meterService.meterTypes(sid(req)))));
billingRouter.get('/meters', authorizePermission('billing:meter_readings', 'billing:view', 'billing:view_own'), validate(meterListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await meterService.list(sid(req), req.query as any, scope(req)))));
billingRouter.post('/meters', authorizePermission('billing:meter_readings'), validate(meterReadingSchema), asyncHandler(async (req, res) => created(res, await meterService.record(sid(req), req.body, uid(req), 'MANUAL', req))));
billingRouter.post('/meters/bulk', authorizePermission('billing:meter_readings'), validate(meterBulkSchema), asyncHandler(async (req, res) => ok(res, await meterService.bulk(sid(req), req.body.readings, uid(req), req))));
billingRouter.post('/meters/import', authorizePermission('billing:meter_readings'), validate(meterImportSchema), asyncHandler(async (req, res) => ok(res, await meterService.importCsv(sid(req), req.body, uid(req), req))));
billingRouter.delete('/meters/:id', authorizePermission('billing:meter_readings'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await meterService.remove(sid(req), req.params.id, req); noContent(res); }));

// ---- invoices
billingRouter.get('/invoices', authorizePermission('billing:view', 'billing:view_own'), validate(invoiceListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await billingService.listInvoices(sid(req), req.query as any, scope(req)))));
billingRouter.post('/invoices', authorizePermission('billing:create'), validate(invoiceCreateSchema), asyncHandler(async (req, res) => created(res, await billingService.createInvoice(sid(req), req.body, uid(req), req))));
billingRouter.get('/invoices/:id', authorizePermission('billing:view', 'billing:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await billingService.getInvoice(sid(req), req.params.id, scope(req)))));
billingRouter.patch('/invoices/:id', authorizePermission('billing:update'), validate(idParamSchema, 'params'), validate(invoiceUpdateSchema), asyncHandler(async (req, res) => ok(res, await billingService.updateInvoice(sid(req), req.params.id, req.body, req))));
billingRouter.post('/invoices/:id/issue', authorizePermission('billing:issue'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await billingService.issueInvoice(sid(req), req.params.id, uid(req), req))));
billingRouter.post('/invoices/:id/cancel', authorizePermission('billing:cancel'), validate(idParamSchema, 'params'), validate(cancelSchema), asyncHandler(async (req, res) => ok(res, await billingService.cancelInvoice(sid(req), req.params.id, req.body.reason, uid(req), req))));
billingRouter.post('/invoices/:id/remind', authorizePermission('billing:issue', 'billing:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await billingService.sendReminder(sid(req), req.params.id, uid(req), req); ok(res, { sent: true }); }));
