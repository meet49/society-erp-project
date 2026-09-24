import webpush from 'web-push';
import { env, isTest } from '../../../config/env';
import { logger } from '../../../lib/logger';

export interface PushSubscriptionInfo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  readonly name: string;
  send(subscription: PushSubscriptionInfo, payload: PushPayload): Promise<{ gone?: boolean }>;
}

export class ConsolePushProvider implements PushProvider {
  readonly name = 'console';
  readonly sent: { endpoint: string; payload: PushPayload }[] = [];
  async send(subscription: PushSubscriptionInfo, payload: PushPayload): Promise<{ gone?: boolean }> {
    this.sent.push({ endpoint: subscription.endpoint, payload });
    if (this.sent.length > 200) this.sent.shift();
    if (!isTest) logger.info({ title: payload.title }, '[push:console] message logged (not sent)');
    return {};
  }
}

export class WebPushProvider implements PushProvider {
  readonly name = 'webpush';
  constructor() {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  }
  async send(subscription: PushSubscriptionInfo, payload: PushPayload): Promise<{ gone?: boolean }> {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600 });
      return {};
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) return { gone: true };
      throw err;
    }
  }
}

export const pushProvider: PushProvider = env.PUSH_DRIVER === 'webpush' && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? new WebPushProvider() : new ConsolePushProvider();
