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
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  async send(message: EmailMessage): Promise<{ id?: string }> {
    const info = await this.transporter.sendMail({ from: env.EMAIL_FROM, to: message.to, subject: message.subject, html: message.html, text: message.text, replyTo: message.replyTo });
    return { id: info.messageId };
  }
}

export const emailProvider: EmailProvider = env.EMAIL_DRIVER === 'smtp' && env.SMTP_HOST ? new SmtpEmailProvider() : new ConsoleEmailProvider();
