import { env, isTest } from '../../../config/env';
import { logger } from '../../../lib/logger';

export interface WhatsAppMessage {
  to: string;
  text: string;
  /** optional pre-approved template (Meta Cloud API) */
  templateName?: string;
  templateParams?: string[];
  languageCode?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  send(message: WhatsAppMessage): Promise<{ id?: string }>;
}

export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'console';
  readonly sent: WhatsAppMessage[] = [];
  async send(message: WhatsAppMessage): Promise<{ id?: string }> {
    this.sent.push(message);
    if (this.sent.length > 200) this.sent.shift();
    if (!isTest) logger.info({ to: message.to }, '[whatsapp:console] message logged (not sent)');
    return { id: `console-${Date.now()}` };
  }
}

/** Meta WhatsApp Cloud API provider (text or template messages). */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta';
  async send(message: WhatsAppMessage): Promise<{ id?: string }> {
    const to = message.to.replace(/[^0-9]/g, '');
    const body = message.templateName
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: message.templateName,
            language: { code: message.languageCode ?? 'en' },
            components: message.templateParams?.length ? [{ type: 'body', parameters: message.templateParams.map((p) => ({ type: 'text', text: p })) }] : [],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: message.text } };
    const res = await fetch(`https://graph.facebook.com/v19.0/${env.WHATSAPP_META_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_META_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`WhatsApp API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { id: json.messages?.[0]?.id };
  }
}

export const whatsappProvider: WhatsAppProvider = env.WHATSAPP_DRIVER === 'meta' && env.WHATSAPP_META_TOKEN ? new MetaWhatsAppProvider() : new ConsoleWhatsAppProvider();
