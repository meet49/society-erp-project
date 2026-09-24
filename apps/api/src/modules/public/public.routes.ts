import { Router } from 'express';
import { z } from 'zod';
import { leadSchema, publicSupportTicketSchema, signupSchema } from '@society-erp/shared';
import { asyncHandler, authRateLimiter, publicFormRateLimiter, validate } from '../../middleware';
import { ok, created } from '../../lib/response';
import { landingService } from './landing.service';
import { leadService } from './leads.service';
import { supportService } from './support.service';
import { signupService } from './signup.service';
import { planService } from '../platform/plans.service';
import { configurationService } from '../../core/configuration/configuration.service';

export const publicRouter = Router();

publicRouter.get(
  '/landing',
  validate(z.object({ page: z.string().regex(/^[a-z-]+$/).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    ok(res, await landingService.publicPage((req.query.page as string) || 'home'));
  }),
);

publicRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const [plans, pricing] = await Promise.all([planService.publicPlans(), configurationService.getPlatformSetting('landing.pricing')]);
    ok(res, plans, { pricing });
  }),
);

publicRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    ok(res, await configurationService.getPublicPlatformSettings());
  }),
);

publicRouter.post(
  '/leads',
  publicFormRateLimiter,
  validate(leadSchema),
  asyncHandler(async (req, res) => {
    created(res, await leadService.createFromPublic(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] }));
  }),
);

publicRouter.post(
  '/support',
  publicFormRateLimiter,
  validate(publicSupportTicketSchema),
  asyncHandler(async (req, res) => {
    const ticket = await supportService.create({ source: 'PROSPECT', ...req.body });
    created(res, { ticketNumber: ticket.ticketNumber });
  }),
);

publicRouter.get(
  '/signup/config',
  asyncHandler(async (_req, res) => {
    ok(res, await signupService.config());
  }),
);

publicRouter.post(
  '/signup',
  authRateLimiter,
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    created(res, await signupService.signup(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] }));
  }),
);
