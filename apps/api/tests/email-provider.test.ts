import { describe, it, expect, vi, afterEach } from 'vitest';
import { BrevoEmailProvider, parseFrom } from '../src/core/notifications/providers/email.provider';

/**
 * The Brevo driver exists because Render and most PaaS hosts block outbound SMTP ports, so the
 * nodemailer transport times out on connect however correct the credentials are. These tests pin the
 * request shape and make sure a rejection surfaces as an error the job queue can retry.
 */
afterEach(() => vi.unstubAllGlobals());

describe('parseFrom', () => {
  it('splits a display name from the address and passes a bare address through', () => {
    expect(parseFrom('Society ERP <no-reply@societyerp.local>')).toEqual({ name: 'Society ERP', email: 'no-reply@societyerp.local' });
    expect(parseFrom('"Palm Grove" <office@palmgrove.test>')).toEqual({ name: 'Palm Grove', email: 'office@palmgrove.test' });
    expect(parseFrom('  plain@example.com ')).toEqual({ email: 'plain@example.com' });
    expect(parseFrom('<only@example.com>')).toEqual({ name: undefined, email: 'only@example.com' });
  });
});

describe('BrevoEmailProvider', () => {
  it('posts to the transactional endpoint with the api key and returns the message id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: '<abc@brevo>' }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await new BrevoEmailProvider().send({ to: 'asha@example.com', subject: 'Your invitation', html: '<p>Join</p>', text: 'Join', replyTo: 'office@example.com' });
    expect(res.id).toBe('<abc@brevo>');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual([{ email: 'asha@example.com' }]);
    expect(body.subject).toBe('Your invitation');
    expect(body.htmlContent).toBe('<p>Join</p>');
    expect(body.textContent).toBe('Join');
    expect(body.replyTo).toEqual({ email: 'office@example.com' });
    expect(body.sender.email).toBeTruthy();
  });

  it('omits optional fields that were not supplied', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: 'x' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await new BrevoEmailProvider().send({ to: 'a@b.test', subject: 'S', html: '<p>h</p>' });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('textContent');
    expect(body).not.toHaveProperty('replyTo');
  });

  it('throws with the provider message when the API rejects, so the job retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 })));
    await expect(new BrevoEmailProvider().send({ to: 'a@b.test', subject: 'S', html: 'h' })).rejects.toThrow(/401.*Key not found/);
  });

  it('throws on a non-JSON error body rather than swallowing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    await expect(new BrevoEmailProvider().send({ to: 'a@b.test', subject: 'S', html: 'h' })).rejects.toThrow(/502/);
  });
});
