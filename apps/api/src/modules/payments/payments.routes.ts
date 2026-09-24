import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema, paginationQuerySchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, authorizePlatformPermission, requireModule, requirePlatform, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { auditService } from '../../core/audit/audit.service';
import { webhookRateLimiter } from '../../middleware/rate-limit';
import { paymentService } from './payments.service';
import { platformBillingService } from './platform-billing.service';
import { createOrderSchema, gatewayConfigSchema, paymentListQuerySchema, reconcileSchema, recordPaymentSchema, recordPlatformPaymentSchema, refundSchema, subscriptionOrderSchema, verifyOrderSchema } from './payments.schemas';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const scope = (req: any) => (req.ownScope ? { unitIds: req.tenant!.unitIds as string[] } : {});
const actor = (req: any) => ({ userId: uid(req), ownScope: Boolean(req.ownScope), unitIds: (req.tenant!.unitIds ?? []) as string[] });

// ------------------------------------------------------------------ society payments
export const paymentsRouter = Router();
paymentsRouter.use(authenticate, requireSociety, requireModule('payments'), requireSubscription());

paymentsRouter.get('/stats', authorizePermission('payments:view'), asyncHandler(async (req, res) => ok(res, await paymentService.stats(sid(req)))));
paymentsRouter.get(
  '/export',
  authorizePermission('payments:export'),
  validate(paymentListQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const rows = await paymentService.exportRows(sid(req), req.query as any);
    auditService.record({ action: 'payment.exported', resource: 'Payment', societyId: sid(req), metadata: { count: rows.length }, req });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.send(toCsv(rows));
  }),
);

// gateway configuration (secrets are write-only)
paymentsRouter.get('/gateway', authorizePermission('payments:configure'), asyncHandler(async (req, res) => ok(res, await paymentService.getGatewayConfig(sid(req)))));
paymentsRouter.put('/gateway', authorizePermission('payments:configure'), validate(gatewayConfigSchema), asyncHandler(async (req, res) => ok(res, await paymentService.setGatewayConfig(sid(req), req.body, uid(req), req))));
paymentsRouter.get('/gateway/public', authorizePermission('payments:pay_own', 'payments:view', 'payments:create'), asyncHandler(async (req, res) => ok(res, await paymentService.publicGatewayInfo(sid(req)))));

// online orders (members pay their own dues; admins may start a payment on behalf of a unit)
paymentsRouter.get('/orders', authorizePermission('payments:view', 'payments:pay_own'), validate(paginationQuerySchema.extend({ status: z.enum(['CREATED', 'PAID', 'FAILED', 'EXPIRED']).optional() }), 'query'), asyncHandler(async (req, res) => paged(res, await paymentService.listOrders(sid(req), req.query as any, actor(req)))));
paymentsRouter.post('/orders', authorizePermission('payments:create', 'payments:pay_own'), validate(createOrderSchema), asyncHandler(async (req, res) => created(res, await paymentService.createOrder(sid(req), req.body, actor(req), req))));
paymentsRouter.post('/orders/:id/verify', authorizePermission('payments:create', 'payments:pay_own'), validate(idParamSchema, 'params'), validate(verifyOrderSchema), asyncHandler(async (req, res) => ok(res, await paymentService.verifyOrder(sid(req), req.params.id, req.body, actor(req), req))));
paymentsRouter.post('/orders/:id/simulate', authorizePermission('payments:create', 'payments:pay_own'), validate(idParamSchema, 'params'), validate(z.object({ outcome: z.enum(['success', 'failure']).default('success') })), asyncHandler(async (req, res) => ok(res, await paymentService.simulateGateway(sid(req), req.params.id, actor(req), req.body.outcome))));

// recorded payments
paymentsRouter.get('/', authorizePermission('payments:view', 'payments:view_own'), validate(paymentListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await paymentService.list(sid(req), req.query as any, scope(req)))));
paymentsRouter.post('/', authorizePermission('payments:create'), validate(recordPaymentSchema), asyncHandler(async (req, res) => created(res, (await paymentService.recordPayment(sid(req), req.body, uid(req), req)).toJSON())));
paymentsRouter.get('/:id', authorizePermission('payments:view', 'payments:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await paymentService.get(sid(req), req.params.id, scope(req)))));
paymentsRouter.get('/:id/receipt', authorizePermission('payments:view', 'payments:view_own'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await paymentService.receipt(sid(req), req.params.id, scope(req)))));
paymentsRouter.post('/:id/refund', authorizePermission('payments:refund'), validate(idParamSchema, 'params'), validate(refundSchema), asyncHandler(async (req, res) => ok(res, await paymentService.refund(sid(req), req.params.id, req.body, uid(req), req))));
paymentsRouter.post('/:id/reconcile', authorizePermission('payments:reconcile'), validate(idParamSchema, 'params'), validate(reconcileSchema), asyncHandler(async (req, res) => ok(res, await paymentService.reconcile(sid(req), req.params.id, req.body, uid(req), req))));

// ------------------------------------------------------------------ society → platform subscription payments
// Mounted without requireSubscription so a lapsed society can still pay to recover.
export const subscriptionPaymentsRouter = Router();
subscriptionPaymentsRouter.use(authenticate, requireSociety);
subscriptionPaymentsRouter.get('/quote', authorizePermission('society:manage_subscription', 'society:view_subscription'), validate(subscriptionOrderSchema, 'query'), asyncHandler(async (req, res) => ok(res, await platformBillingService.quote(sid(req), (req.query as any).billingCycle))));
subscriptionPaymentsRouter.get('/history', authorizePermission('society:manage_subscription', 'society:view_subscription'), validate(paginationQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await platformBillingService.listForSociety(sid(req), req.query as any))));
subscriptionPaymentsRouter.post('/order', authorizePermission('society:manage_subscription'), validate(subscriptionOrderSchema), asyncHandler(async (req, res) => created(res, await platformBillingService.createSubscriptionOrder(sid(req), uid(req), req.body, req))));
subscriptionPaymentsRouter.post('/order/:id/verify', authorizePermission('society:manage_subscription'), validate(idParamSchema, 'params'), validate(verifyOrderSchema), asyncHandler(async (req, res) => ok(res, await platformBillingService.verifySubscriptionOrder(sid(req), req.params.id, req.body, uid(req), req))));
subscriptionPaymentsRouter.post('/order/:id/simulate', authorizePermission('society:manage_subscription'), validate(idParamSchema, 'params'), validate(z.object({ outcome: z.enum(['success', 'failure']).default('success') })), asyncHandler(async (req, res) => ok(res, await platformBillingService.simulateSubscriptionGateway(sid(req), req.params.id, req.body.outcome))));

// ------------------------------------------------------------------ platform console: offline subscription payments
export const platformPaymentsRouter = Router();
platformPaymentsRouter.use(authenticate, requirePlatform);
platformPaymentsRouter.post('/payments/record', authorizePlatformPermission('platform_payments:record'), validate(recordPlatformPaymentSchema), asyncHandler(async (req, res) => created(res, await platformBillingService.recordOfflinePayment(req.body, uid(req), req))));

// ------------------------------------------------------------------ inbound webhooks (no auth; signature verified per provider; idempotent by event id)
export const webhooksRouter = Router();
webhooksRouter.use(webhookRateLimiter);
const signatureOf = (req: any): string | undefined => req.get('x-razorpay-signature') ?? req.get('x-webhook-signature') ?? req.get('x-mock-signature');

webhooksRouter.post(
  '/payments/platform/:provider',
  asyncHandler(async (req, res) => {
    const result = await paymentService.handleWebhook({ scope: 'platform', providerName: req.params.provider, rawBody: req.rawBody ?? JSON.stringify(req.body), signature: signatureOf(req), payload: req.body });
    res.status(200).json({ ok: true, ...result });
  }),
);
webhooksRouter.post(
  '/payments/:provider/:societyId',
  validate(z.object({ provider: z.string().max(20), societyId: idParamSchema.shape.id }), 'params'),
  asyncHandler(async (req, res) => {
    const result = await paymentService.handleWebhook({ scope: 'society', societyId: req.params.societyId, providerName: req.params.provider, rawBody: req.rawBody ?? JSON.stringify(req.body), signature: signatureOf(req), payload: req.body });
    res.status(200).json({ ok: true, ...result });
  }),
);
