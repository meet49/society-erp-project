import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from '../../../config/env';
import { logger } from '../../../lib/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id?: string }>;
}

/** Development provider: logs the message instead of sending (test hooks can inspect `sent`). */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<{ id?: string }> {
    this.sent.push(message);
    if (this.sent.length > 200) this.sent.shift();
    if (!isTest) logger.info({ to: message.to, subject: message.subject }, '[email:console] message logged (not sent)');
    return { id: `console-${Date.now()}` };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private transporter: Transporter;
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      // On a submission port the connection starts in the clear, so insist on STARTTLS before the
      // credentials go over it. Every modern relay advertises it; 465 is already encrypted.
      requireTLS: !env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // Fail fast and say so. A host that filters the port drops packets rather than refusing them,
      // so without these the job sits for two minutes before reporting ETIMEDOUT.
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 25_000,
    });
  }
  async send(message: EmailMessage): Promise<{ id?: string }> {
    const info = await this.transporter.sendMail({ from: env.EMAIL_FROM, to: message.to, subject: message.subject, html: message.html, text: message.text, replyTo: message.replyTo });
    return { id: info.messageId };
  }
}

/** Splits `Society ERP <no-reply@example.com>` into its parts; a bare address is returned as-is. */
export function parseFrom(from: string): { email: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2].trim() };
  return { email: from.trim() };
}

/**
 * Brevo's HTTPS API, for hosts that block outbound SMTP. Render, Vercel and most PaaS providers
 * filter ports 25, 465 and 587 to stop spam, which surfaces as an ETIMEDOUT on connect no matter how
 * correct the credentials are. This talks to port 443 instead, so it is unaffected.
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';
  async send(message: EmailMessage): Promise<{ id?: string }> {
    const sender = parseFrom(env.EMAIL_FROM);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        ...(message.text ? { textContent: message.text } : {}),
        ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (!res.ok) throw new Error(`Brevo rejected the message (${res.status}): ${body.message ?? body.code ?? 'unknown error'}`);
    return { id: body.messageId };
  }
}

function pickProvider(): EmailProvider {
  if (env.EMAIL_DRIVER === 'brevo') {
    if (env.BREVO_API_KEY) return new BrevoEmailProvider();
    logger.error('EMAIL_DRIVER=brevo but BREVO_API_KEY is empty; falling back to console (nothing will be sent)');
    return new ConsoleEmailProvider();
  }
  if (env.EMAIL_DRIVER === 'smtp') {
    if (env.SMTP_HOST) return new SmtpEmailProvider();
    logger.error('EMAIL_DRIVER=smtp but SMTP_HOST is empty; falling back to console (nothing will be sent)');
  }
  return new ConsoleEmailProvider();
}

export const emailProvider: EmailProvider = pickProvider();
