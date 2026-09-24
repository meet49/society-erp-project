import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { hmacSha256, timingSafeEqual, decryptSecret } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { ErrorCodes } from '@society-erp/shared';
import { PaymentGatewayConfig } from '../../models/payment-gateway-config.model';

export interface CreateOrderInput {
  amount: number; // major units (e.g. rupees)
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreatedOrder {
  orderId: string;
  amount: number;
  currency: string;
  /** public key the client SDK needs (never the secret) */
  keyId?: string;
  provider: string;
}

export interface ParsedWebhook {
  eventId: string;
  type: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  status: 'PAID' | 'FAILED' | 'REFUNDED' | 'OTHER';
}

/**
 * Payment provider abstraction. Every implementation must verify signatures server-side:
 * the frontend's "success" callback is never trusted on its own.
 */
export interface PaymentProvider {
  readonly name: string;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean;
  parseWebhook(payload: any): ParsedWebhook;
  fetchPaymentStatus?(paymentId: string): Promise<{ status: 'PAID' | 'FAILED' | 'PENDING'; amount?: number; orderId?: string }>;
  refund(input: { paymentId: string; amount: number; notes?: Record<string, string> }): Promise<{ refundId: string }>;
}

/** Razorpay implementation over the REST API (no SDK dependency). Amounts are converted to paise. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  constructor(private readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string) {}

  private async request<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw Errors.custom(502, ErrorCodes.PAYMENT_PROVIDER_ERROR, json?.error?.description ?? `Razorpay error ${res.status}`);
    return json as T;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const order = await this.request<{ id: string; amount: number; currency: string }>('/orders', { amount: Math.round(input.amount * 100), currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes });
    return { orderId: order.id, amount: order.amount / 100, currency: order.currency, keyId: this.keyId, provider: this.name };
  }

  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }): boolean {
    return timingSafeEqual(hmacSha256(`${orderId}|${paymentId}`, this.keySecret), signature);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature || !this.webhookSecret) return false;
    return timingSafeEqual(hmacSha256(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'), this.webhookSecret), signature);
  }

  parseWebhook(payload: any): ParsedWebhook {
    const type = String(payload?.event ?? 'unknown');
    const payment = payload?.payload?.payment?.entity;
    const refund = payload?.payload?.refund?.entity;
    const status: ParsedWebhook['status'] = type === 'payment.captured' || type === 'order.paid' ? 'PAID' : type === 'payment.failed' ? 'FAILED' : type.startsWith('refund.') ? 'REFUNDED' : 'OTHER';
    return { eventId: String(payload?.id ?? payment?.id ?? refund?.id ?? `${type}:${payload?.created_at ?? Date.now()}`), type, orderId: payment?.order_id, paymentId: payment?.id ?? refund?.payment_id, amount: payment?.amount ? payment.amount / 100 : undefined, status };
  }

  async fetchPaymentStatus(paymentId: string) {
    const p = await this.request<{ status: string; amount: number; order_id: string }>(`/payments/${paymentId}`, undefined, 'GET');
    return { status: p.status === 'captured' ? ('PAID' as const) : p.status === 'failed' ? ('FAILED' as const) : ('PENDING' as const), amount: p.amount / 100, orderId: p.order_id };
  }

  async refund(input: { paymentId: string; amount: number; notes?: Record<string, string> }): Promise<{ refundId: string }> {
    const r = await this.request<{ id: string }>(`/payments/${input.paymentId}/refund`, { amount: Math.round(input.amount * 100), notes: input.notes });
    return { refundId: r.id };
  }
}

/**
 * Deterministic mock gateway for development and automated tests. It behaves like a real provider:
 * orders are created server-side, and a payment is only accepted when the HMAC signature
 * (secret known only to the server / test harness) verifies.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  constructor(private readonly secret: string) {}

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    return { orderId: `order_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`, amount: input.amount, currency: input.currency, keyId: 'mock_key', provider: this.name };
  }

  /** Test helper: what a "gateway" would sign. */
  sign(orderId: string, paymentId: string): string {
    return hmacSha256(`${orderId}|${paymentId}`, this.secret);
  }

  signWebhook(rawBody: string): string {
    return hmacSha256(rawBody, this.secret);
  }

  verifyPaymentSignature({ orderId, paymentId, signature }: { orderId: string; paymentId: string; signature: string }): boolean {
    return timingSafeEqual(this.sign(orderId, paymentId), signature);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
    if (!signature) return false;
    return timingSafeEqual(this.signWebhook(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')), signature);
  }

  parseWebhook(payload: any): ParsedWebhook {
    const type = String(payload?.event ?? 'unknown');
    return { eventId: String(payload?.id ?? `${type}:${payload?.paymentId ?? ''}`), type, orderId: payload?.orderId, paymentId: payload?.paymentId, amount: payload?.amount, status: type === 'payment.captured' ? 'PAID' : type === 'payment.failed' ? 'FAILED' : type === 'refund.processed' ? 'REFUNDED' : 'OTHER' };
  }

  async refund(input: { paymentId: string; amount: number }): Promise<{ refundId: string }> {
    return { refundId: `rfnd_mock_${input.paymentId.slice(-8)}_${Math.round(input.amount)}` };
  }
}

export const platformPaymentProvider: PaymentProvider = env.PAYMENT_DRIVER === 'razorpay' && env.RAZORPAY_KEY_ID ? new RazorpayProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET) : new MockPaymentProvider(env.MOCK_PAYMENT_SECRET);

/** Resolves the provider configured by a society (Settings → Payments). Throws when online payments are not enabled. */
export async function getSocietyPaymentProvider(societyId: string): Promise<{ provider: PaymentProvider; config: { displayName: string; allowedMethods: string[]; convenienceFeePercent: number; testMode: boolean } }> {
  const cfg = await PaymentGatewayConfig.findOne({ societyId }).select('+keySecretEncrypted +webhookSecretEncrypted').lean();
  if (!cfg || !cfg.enabled) throw Errors.custom(400, ErrorCodes.FEATURE_DISABLED, 'Online payments are not enabled for this society');
  const base = { displayName: cfg.displayName, allowedMethods: cfg.allowedMethods, convenienceFeePercent: cfg.convenienceFeePercent, testMode: cfg.testMode };
  if (cfg.provider === 'razorpay') {
    if (!cfg.keyId || !cfg.keySecretEncrypted) throw Errors.custom(400, ErrorCodes.PAYMENT_PROVIDER_ERROR, 'Payment gateway credentials are incomplete');
    return { provider: new RazorpayProvider(cfg.keyId, decryptSecret(cfg.keySecretEncrypted), cfg.webhookSecretEncrypted ? decryptSecret(cfg.webhookSecretEncrypted) : ''), config: base };
  }
  return { provider: new MockPaymentProvider(cfg.keySecretEncrypted ? decryptSecret(cfg.keySecretEncrypted) : env.MOCK_PAYMENT_SECRET), config: base };
}
