import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, noContent, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { vendorService } from './vendors.service';
import { expenseService } from './expenses.service';
import { purchaseOrderService } from './purchase-orders.service';
import { expenseCreateSchema, expenseListQuerySchema, expensePaymentSchema, expenseUpdateSchema, poConvertSchema, poCreateSchema, poListQuerySchema, poReceiveSchema, poUpdateSchema, rejectSchema, vendorCreateSchema, vendorListQuerySchema, vendorUpdateSchema } from './expenses.schemas';
import './expenses.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const actor = (req: any) => ({ userId: uid(req), roleKeys: req.tenant!.roleKeys as string[], permissions: req.tenant!.permissions as Set<string> });
const decideSchema = z.object({ note: z.string().trim().max(500).optional() });

// ------------------------------------------------------------------ vendors
export const vendorsRouter = Router();
vendorsRouter.use(authenticate, requireSociety, requireModule('vendors'), requireSubscription());
vendorsRouter.get('/options', authorizePermission('vendors:view', 'expenses:create', 'expenses:view', 'contracts:view', 'assets:view'), asyncHandler(async (req, res) => ok(res, await vendorService.options(sid(req)))));
vendorsRouter.get('/export', authorizePermission('vendors:export'), asyncHandler(async (req, res) => { const rows = await vendorService.exportRows(sid(req)); auditService.record({ action: 'vendor.exported', resource: 'Vendor', societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="vendors.csv"'); res.send(toCsv(rows)); }));
vendorsRouter.get('/', authorizePermission('vendors:view'), validate(vendorListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await vendorService.list(sid(req), req.query as any))));
vendorsRouter.post('/', authorizePermission('vendors:create'), validate(vendorCreateSchema), asyncHandler(async (req, res) => created(res, await vendorService.create(sid(req), req.body, uid(req), req))));
vendorsRouter.get('/:id', authorizePermission('vendors:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await vendorService.get(sid(req), req.params.id))));
vendorsRouter.patch('/:id', authorizePermission('vendors:update'), validate(idParamSchema, 'params'), validate(vendorUpdateSchema), asyncHandler(async (req, res) => ok(res, await vendorService.update(sid(req), req.params.id, req.body, req))));
vendorsRouter.delete('/:id', authorizePermission('vendors:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await vendorService.remove(sid(req), req.params.id, uid(req), req); noContent(res); }));

// ------------------------------------------------------------------ expenses & purchase orders
export const expensesRouter = Router();
expensesRouter.use(authenticate, requireSociety, requireModule('expenses'), requireSubscription());

expensesRouter.get('/stats', authorizePermission('expenses:view'), asyncHandler(async (req, res) => ok(res, await expenseService.stats(sid(req)))));
expensesRouter.get('/export', authorizePermission('expenses:export'), validate(expenseListQuerySchema, 'query'), asyncHandler(async (req, res) => { const rows = await expenseService.exportRows(sid(req), req.query as any); auditService.record({ action: 'expense.exported', resource: 'Expense', societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"'); res.send(toCsv(rows)); }));

// purchase orders (before /:id)
expensesRouter.get('/purchase-orders', authorizePermission('expenses:view'), validate(poListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await purchaseOrderService.list(sid(req), req.query as any))));
expensesRouter.post('/purchase-orders', authorizePermission('expenses:create', 'expenses:submit'), validate(poCreateSchema), asyncHandler(async (req, res) => created(res, await purchaseOrderService.create(sid(req), req.body, uid(req), req))));
expensesRouter.get('/purchase-orders/:id', authorizePermission('expenses:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.get(sid(req), req.params.id))));
expensesRouter.patch('/purchase-orders/:id', authorizePermission('expenses:update', 'expenses:create'), validate(idParamSchema, 'params'), validate(poUpdateSchema), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.update(sid(req), req.params.id, req.body, req))));
expensesRouter.post('/purchase-orders/:id/submit', authorizePermission('expenses:submit', 'expenses:create'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.submit(sid(req), req.params.id, uid(req), req))));
expensesRouter.post('/purchase-orders/:id/approve', authorizePermission('expenses:approve'), validate(idParamSchema, 'params'), validate(decideSchema), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.decide(sid(req), req.params.id, actor(req), 'APPROVED', req.body.note, req))));
expensesRouter.post('/purchase-orders/:id/reject', authorizePermission('expenses:approve'), validate(idParamSchema, 'params'), validate(rejectSchema), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.decide(sid(req), req.params.id, actor(req), 'REJECTED', req.body.reason, req))));
expensesRouter.post('/purchase-orders/:id/order', authorizePermission('expenses:update', 'expenses:approve'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.markOrdered(sid(req), req.params.id, uid(req), req))));
expensesRouter.post('/purchase-orders/:id/receive', authorizePermission('expenses:update', 'inventory:transact'), validate(idParamSchema, 'params'), validate(poReceiveSchema), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.receive(sid(req), req.params.id, req.body, uid(req), req))));
expensesRouter.post('/purchase-orders/:id/convert', authorizePermission('expenses:create', 'expenses:approve'), validate(idParamSchema, 'params'), validate(poConvertSchema), asyncHandler(async (req, res) => created(res, await purchaseOrderService.convertToExpense(sid(req), req.params.id, req.body, uid(req), req))));
expensesRouter.post('/purchase-orders/:id/cancel', authorizePermission('expenses:update', 'expenses:approve'), validate(idParamSchema, 'params'), validate(rejectSchema), asyncHandler(async (req, res) => ok(res, await purchaseOrderService.cancel(sid(req), req.params.id, req.body.reason, uid(req), req))));

// expenses
expensesRouter.get('/', authorizePermission('expenses:view'), validate(expenseListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await expenseService.list(sid(req), req.query as any))));
expensesRouter.post('/', authorizePermission('expenses:create'), validate(expenseCreateSchema), asyncHandler(async (req, res) => created(res, await expenseService.create(sid(req), { ...req.body, submit: req.body.submit && req.tenant!.permissions.has('expenses:submit') }, uid(req), req))));
expensesRouter.get('/:id', authorizePermission('expenses:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await expenseService.get(sid(req), req.params.id))));
expensesRouter.patch('/:id', authorizePermission('expenses:update', 'expenses:create'), validate(idParamSchema, 'params'), validate(expenseUpdateSchema), asyncHandler(async (req, res) => ok(res, await expenseService.update(sid(req), req.params.id, req.body, req))));
expensesRouter.delete('/:id', authorizePermission('expenses:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await expenseService.remove(sid(req), req.params.id, req); noContent(res); }));
expensesRouter.post('/:id/submit', authorizePermission('expenses:submit'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await expenseService.submit(sid(req), req.params.id, uid(req), req))));
expensesRouter.post('/:id/withdraw', authorizePermission('expenses:submit', 'expenses:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await expenseService.withdraw(sid(req), req.params.id, uid(req), req))));
expensesRouter.post('/:id/approve', authorizePermission('expenses:approve'), validate(idParamSchema, 'params'), validate(decideSchema), asyncHandler(async (req, res) => ok(res, await expenseService.decide(sid(req), req.params.id, actor(req), 'APPROVED', req.body.note, req))));
expensesRouter.post('/:id/reject', authorizePermission('expenses:approve'), validate(idParamSchema, 'params'), validate(rejectSchema), asyncHandler(async (req, res) => ok(res, await expenseService.decide(sid(req), req.params.id, actor(req), 'REJECTED', req.body.reason, req))));
expensesRouter.post('/:id/payments', authorizePermission('expenses:pay'), validate(idParamSchema, 'params'), validate(expensePaymentSchema), asyncHandler(async (req, res) => created(res, await expenseService.recordPayment(sid(req), req.params.id, req.body, uid(req), req))));
