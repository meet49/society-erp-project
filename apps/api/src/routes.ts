import { Router } from 'express';
import mongoose from 'mongoose';
import { authRouter } from './modules/auth/auth.routes';
import { societyRouter } from './modules/society/society.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { crmRouter } from './modules/platform/crm.routes';
import { publicRouter } from './modules/public/public.routes';
import { societySupportRouter } from './modules/society/support.routes';
import { buildingsRouter, unitsRouter } from './modules/units/units.routes';
import { residentsRouter } from './modules/residents/residents.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { paymentsRouter, platformPaymentsRouter, subscriptionPaymentsRouter, webhooksRouter } from './modules/payments/payments.routes';
import { accountingRouter } from './modules/accounting/accounting.routes';
import { approvalsRouter, workflowsRouter } from './modules/workflows/workflows.routes';
import { expensesRouter, vendorsRouter } from './modules/expenses/expenses.routes';
import { complaintsRouter } from './modules/complaints/complaints.routes';
import { amenitiesRouter } from './modules/amenities/amenities.routes';
import { communityRouter, eventsRouter, noticesRouter, pollsRouter, surveysRouter } from './modules/community/community.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { committeeRouter, meetingsRouter, votingRouter } from './modules/governance/governance.routes';
import { domesticHelpRouter, parkingRouter, staffRouter, vehiclesRouter } from './modules/operations/operations.routes';
import { filesRouter } from './modules/files/files.routes';
import { emergencyRouter, securityRouter } from './modules/security/security.routes';
import { assetsRouter, contractsRouter, inventoryRouter } from './modules/assets/assets.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { importRouter } from './modules/imports/import.routes';
import { deliveriesRouter, visitorsRouter } from './modules/visitors/visitors.routes';
import { jobQueue } from './core/jobs/queue';
import { redisConfigured } from './lib/redis';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks: { database: dbState === 1 ? 'up' : 'down', redis: redisConfigured() ? 'configured' : 'not-configured', jobs: jobQueue.driver },
  });
});

apiRouter.use('/public', publicRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/society/support', societySupportRouter);
apiRouter.use('/society/subscription/pay', subscriptionPaymentsRouter);
apiRouter.use('/society/workflows', workflowsRouter);
apiRouter.use('/society/import', importRouter);
apiRouter.use('/society', societyRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/platform', platformPaymentsRouter);
apiRouter.use('/platform', platformRouter);
apiRouter.use('/platform', crmRouter);
apiRouter.use('/buildings', buildingsRouter);
apiRouter.use('/units', unitsRouter);
apiRouter.use('/residents', residentsRouter);
apiRouter.use('/billing', billingRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/webhooks', webhooksRouter);
apiRouter.use('/accounting', accountingRouter);
apiRouter.use('/approvals', approvalsRouter);
apiRouter.use('/vendors', vendorsRouter);
apiRouter.use('/expenses', expensesRouter);
apiRouter.use('/complaints', complaintsRouter);
apiRouter.use('/amenities', amenitiesRouter);
apiRouter.use('/notices', noticesRouter);
apiRouter.use('/community', communityRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/polls', pollsRouter);
apiRouter.use('/surveys', surveysRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/meetings', meetingsRouter);
apiRouter.use('/voting', votingRouter);
apiRouter.use('/committee', committeeRouter);
apiRouter.use('/staff', staffRouter);
apiRouter.use('/domestic-help', domesticHelpRouter);
apiRouter.use('/vehicles', vehiclesRouter);
apiRouter.use('/parking', parkingRouter);
apiRouter.use('/security', securityRouter);
apiRouter.use('/emergency', emergencyRouter);
apiRouter.use('/contracts', contractsRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/files', filesRouter);
apiRouter.use('/visitors', visitorsRouter);
apiRouter.use('/deliveries', deliveriesRouter);
