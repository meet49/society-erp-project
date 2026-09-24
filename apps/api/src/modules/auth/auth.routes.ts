import { Router } from 'express';
import { asyncHandler, authenticate, authRateLimiter, validate } from '../../middleware';
import { authController as c } from './auth.controller';
import {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
  switchSocietySchema,
  updateProfileSchema,
  pushSubscriptionSchema,
  familyParamSchema,
  inviteTokenParamSchema,
} from './auth.schemas';
import { z } from 'zod';

export const authRouter = Router();

authRouter.post('/login', authRateLimiter, validate(loginSchema), asyncHandler(c.login));
authRouter.post('/refresh', validate(refreshSchema), asyncHandler(c.refresh));
authRouter.post('/logout', validate(z.object({ refreshToken: z.string().optional() })), asyncHandler(c.logout));
authRouter.post('/forgot-password', authRateLimiter, validate(forgotPasswordSchema), asyncHandler(c.forgotPassword));
authRouter.post('/reset-password', authRateLimiter, validate(resetPasswordSchema), asyncHandler(c.resetPassword));
authRouter.get('/invitations/:token', validate(inviteTokenParamSchema, 'params'), asyncHandler(c.getInvitation));
authRouter.post('/invitations/accept', authRateLimiter, validate(acceptInviteSchema), asyncHandler(c.acceptInvitation));

authRouter.use(authenticate);
authRouter.get('/me', asyncHandler(c.me));
authRouter.post('/switch', validate(switchSocietySchema), asyncHandler(c.switchContext));
authRouter.get('/sessions', asyncHandler(c.sessions));
authRouter.delete('/sessions/:familyId', validate(familyParamSchema, 'params'), asyncHandler(c.revokeSession));
authRouter.post('/sessions/revoke-all', asyncHandler(c.revokeAllSessions));
authRouter.post('/change-password', validate(changePasswordSchema), asyncHandler(c.changePassword));
authRouter.patch('/profile', validate(updateProfileSchema), asyncHandler(c.updateProfile));
authRouter.post('/push-subscriptions', validate(pushSubscriptionSchema), asyncHandler(c.addPushSubscription));
authRouter.delete('/push-subscriptions', validate(z.object({ endpoint: z.string().url() })), asyncHandler(c.removePushSubscription));
