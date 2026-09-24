import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { contractService } from './contracts.service';
import { assetService } from './assets.service';
import { inventoryService } from './inventory.service';
import { assetCreateSchema, assetListQuerySchema, assetMaintenanceSchema, assetStatusSchema, assetUpdateSchema, assetsConfigSchema, contractCreateSchema, contractListQuerySchema, contractPaymentSchema, contractRenewSchema, contractTerminateSchema, contractUpdateSchema, contractVisitSchema, contractsConfigSchema, inventoryConfigSchema, itemCreateSchema, itemListQuerySchema, itemUpdateSchema, stockTransactionSchema, transactionListQuerySchema } from './assets.schemas';
import './assets.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const csv = (res: any, name: string, rows: Record<string, unknown>[]) => { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.send(toCsv(rows)); };

// ------------------------------------------------------------------ contracts & AMC
export const contractsRouter = Router();
contractsRouter.use(authenticate, requireSociety, requireModule('contracts'), requireSubscription());
contractsRouter.get('/settings', authorizePermission('contracts:view'), asyncHandler(async (req, res) => ok(res, await contractService.getConfig(sid(req)))));
contractsRouter.put('/settings', authorizePermission('contracts:update'), validate(contractsConfigSchema), asyncHandler(async (req, res) => ok(res, await contractService.updateConfig(sid(req), req.body, uid(req), req))));
contractsRouter.get('/stats', authorizePermission('contracts:view'), asyncHandler(async (req, res) => ok(res, await contractService.stats(sid(req)))));
contractsRouter.get('/export', authorizePermission('contracts:view'), validate(contractListQuerySchema, 'query'), asyncHandler(async (req, res) => csv(res, 'contracts.csv', await contractService.exportRows(sid(req), req.query as any))));
contractsRouter.get('/', authorizePermission('contracts:view'), validate(contractListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await contractService.list(sid(req), req.query as any))));
contractsRouter.post('/', authorizePermission('contracts:create'), validate(contractCreateSchema), asyncHandler(async (req, res) => created(res, await contractService.create(sid(req), req.body, uid(req), req))));
contractsRouter.get('/:id', authorizePermission('contracts:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await contractService.get(sid(req), req.params.id))));
contractsRouter.patch('/:id', authorizePermission('contracts:update'), validate(idParamSchema, 'params'), validate(contractUpdateSchema), asyncHandler(async (req, res) => ok(res, await contractService.update(sid(req), req.params.id, req.body, uid(req), req))));
contractsRouter.delete('/:id', authorizePermission('contracts:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await contractService.remove(sid(req), req.params.id, uid(req), req); return noContent(res); }));
contractsRouter.post('/:id/activate', authorizePermission('contracts:update', 'contracts:create'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await contractService.activate(sid(req), req.params.id, uid(req), req))));
contractsRouter.post('/:id/renew', authorizePermission('contracts:renew'), validate(idParamSchema, 'params'), validate(contractRenewSchema), asyncHandler(async (req, res) => created(res, await contractService.renew(sid(req), req.params.id, req.body, uid(req), req))));
contractsRouter.post('/:id/terminate', authorizePermission('contracts:update'), validate(idParamSchema, 'params'), validate(contractTerminateSchema), asyncHandler(async (req, res) => ok(res, await contractService.terminate(sid(req), req.params.id, req.body, uid(req), req))));
contractsRouter.post('/:id/visits', authorizePermission('contracts:update'), validate(idParamSchema, 'params'), validate(contractVisitSchema), asyncHandler(async (req, res) => ok(res, await contractService.logVisit(sid(req), req.params.id, req.body, uid(req), req))));
contractsRouter.get('/:id/payments', authorizePermission('contracts:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await contractService.paymentSummary(sid(req), req.params.id))));
contractsRouter.post('/:id/payments', authorizePermission('contracts:update'), validate(idParamSchema, 'params'), validate(contractPaymentSchema), asyncHandler(async (req, res) => created(res, await contractService.recordPayment(sid(req), req.params.id, req.body, uid(req), req))));

// ------------------------------------------------------------------ assets
export const assetsRouter = Router();
assetsRouter.use(authenticate, requireSociety, requireModule('assets'), requireSubscription());
assetsRouter.get('/settings', authorizePermission('assets:view'), asyncHandler(async (req, res) => ok(res, await assetService.getConfig(sid(req)))));
assetsRouter.put('/settings', authorizePermission('assets:update'), validate(assetsConfigSchema), asyncHandler(async (req, res) => ok(res, await assetService.updateConfig(sid(req), req.body, uid(req), req))));
assetsRouter.get('/categories', authorizePermission('assets:view', 'assets:create'), asyncHandler(async (req, res) => ok(res, await assetService.categories(sid(req)))));
assetsRouter.get('/stats', authorizePermission('assets:view'), asyncHandler(async (req, res) => ok(res, await assetService.stats(sid(req)))));
assetsRouter.get('/export', authorizePermission('assets:view'), validate(assetListQuerySchema, 'query'), asyncHandler(async (req, res) => csv(res, 'assets.csv', await assetService.exportRows(sid(req), req.query as any))));
assetsRouter.get('/', authorizePermission('assets:view'), validate(assetListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await assetService.list(sid(req), req.query as any))));
assetsRouter.post('/', authorizePermission('assets:create'), validate(assetCreateSchema), asyncHandler(async (req, res) => created(res, await assetService.create(sid(req), req.body, uid(req), req))));
assetsRouter.get('/:id', authorizePermission('assets:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await assetService.get(sid(req), req.params.id))));
assetsRouter.patch('/:id', authorizePermission('assets:update'), validate(idParamSchema, 'params'), validate(assetUpdateSchema), asyncHandler(async (req, res) => ok(res, await assetService.update(sid(req), req.params.id, req.body, uid(req), req))));
assetsRouter.delete('/:id', authorizePermission('assets:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await assetService.remove(sid(req), req.params.id, uid(req), req); return noContent(res); }));
assetsRouter.post('/:id/status', authorizePermission('assets:maintain', 'assets:update'), validate(idParamSchema, 'params'), validate(assetStatusSchema), asyncHandler(async (req, res) => ok(res, await assetService.setStatus(sid(req), req.params.id, req.body, uid(req), req))));
assetsRouter.post('/:id/maintenance', authorizePermission('assets:maintain'), validate(idParamSchema, 'params'), validate(assetMaintenanceSchema), asyncHandler(async (req, res) => ok(res, await assetService.logMaintenance(sid(req), req.params.id, req.body, uid(req), req))));

// ------------------------------------------------------------------ inventory
export const inventoryRouter = Router();
inventoryRouter.use(authenticate, requireSociety, requireModule('inventory'), requireSubscription());
inventoryRouter.get('/settings', authorizePermission('inventory:view'), asyncHandler(async (req, res) => ok(res, await inventoryService.getConfig(sid(req)))));
inventoryRouter.put('/settings', authorizePermission('inventory:update'), validate(inventoryConfigSchema), asyncHandler(async (req, res) => ok(res, await inventoryService.updateConfig(sid(req), req.body, uid(req), req))));
inventoryRouter.get('/categories', authorizePermission('inventory:view', 'inventory:create'), asyncHandler(async (req, res) => ok(res, await inventoryService.categories(sid(req)))));
inventoryRouter.get('/stats', authorizePermission('inventory:view'), asyncHandler(async (req, res) => ok(res, await inventoryService.stats(sid(req)))));
inventoryRouter.get('/export', authorizePermission('inventory:view'), validate(itemListQuerySchema, 'query'), asyncHandler(async (req, res) => csv(res, 'inventory.csv', await inventoryService.exportRows(sid(req), req.query as any))));
inventoryRouter.get('/transactions', authorizePermission('inventory:view'), validate(transactionListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await inventoryService.transactions(sid(req), req.query as any))));
inventoryRouter.get('/items', authorizePermission('inventory:view', 'inventory:transact'), validate(itemListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await inventoryService.list(sid(req), req.query as any))));
inventoryRouter.post('/items', authorizePermission('inventory:create'), validate(itemCreateSchema), asyncHandler(async (req, res) => created(res, await inventoryService.create(sid(req), req.body, uid(req), req))));
inventoryRouter.get('/items/:id', authorizePermission('inventory:view', 'inventory:transact'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await inventoryService.get(sid(req), req.params.id))));
inventoryRouter.patch('/items/:id', authorizePermission('inventory:update'), validate(idParamSchema, 'params'), validate(itemUpdateSchema), asyncHandler(async (req, res) => ok(res, await inventoryService.update(sid(req), req.params.id, req.body, uid(req), req))));
inventoryRouter.delete('/items/:id', authorizePermission('inventory:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await inventoryService.remove(sid(req), req.params.id, uid(req), req); return noContent(res); }));
inventoryRouter.post('/items/:id/transactions', authorizePermission('inventory:transact'), validate(idParamSchema, 'params'), validate(stockTransactionSchema), asyncHandler(async (req, res) => { const r: any = await inventoryService.transact(sid(req), req.params.id, req.body, uid(req), req); return r.replayed ? ok(res, r) : created(res, r); }));
