import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { ok, noContent } from '../../lib/response';

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

export const authController = {
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body, meta(req));
    ok(res, result);
  },
  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.body.refreshToken, meta(req));
    ok(res, result);
  },
  async logout(req: Request, res: Response) {
    await authService.logout({ refreshToken: req.body?.refreshToken, familyId: req.auth?.sessionId, userId: req.auth?.userId });
    noContent(res);
  },
  async switchContext(req: Request, res: Response) {
    const result = await authService.switchContext(req.auth!, req.body, meta(req));
    ok(res, result);
  },
  async me(req: Request, res: Response) {
    ok(res, await authService.me(req.auth!));
  },
  async sessions(req: Request, res: Response) {
    ok(res, await authService.listSessions(req.auth!.userId, req.auth!.sessionId));
  },
  async revokeSession(req: Request, res: Response) {
    await authService.revokeUserSession(req.auth!.userId, req.params.familyId);
    noContent(res);
  },
  async revokeAllSessions(req: Request, res: Response) {
    const count = await authService.revokeAllSessions(req.auth!.userId, req.auth!.sessionId);
    ok(res, { revoked: count });
  },
  async changePassword(req: Request, res: Response) {
    await authService.changePassword(req.auth!, req.body.currentPassword, req.body.newPassword);
    noContent(res);
  },
  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword(req.body.email);
    ok(res, { message: 'If an account exists for this email, a reset link has been sent.' });
  },
  async resetPassword(req: Request, res: Response) {
    await authService.resetPassword(req.body.token, req.body.password);
    noContent(res);
  },
  async getInvitation(req: Request, res: Response) {
    ok(res, await authService.getInvitation(req.params.token));
  },
  async acceptInvitation(req: Request, res: Response) {
    ok(res, await authService.acceptInvitation(req.body, meta(req)));
  },
  async updateProfile(req: Request, res: Response) {
    ok(res, await authService.updateProfile(req.auth!.userId, req.body));
  },
  async addPushSubscription(req: Request, res: Response) {
    await authService.addPushSubscription(req.auth!.userId, req.body, req.headers['user-agent']);
    noContent(res);
  },
  async removePushSubscription(req: Request, res: Response) {
    await authService.removePushSubscription(req.auth!.userId, req.body.endpoint);
    noContent(res);
  },
};
