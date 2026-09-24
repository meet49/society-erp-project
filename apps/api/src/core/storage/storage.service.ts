import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { env } from '../../config/env';
import { hmacSha256, timingSafeEqual } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';

export interface StoredObject {
  storageKey: string;
  size: number;
  mimeType: string;
  name: string;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Time-limited download URL. Local driver signs a URL served by the API; S3 uses a presigned URL. */
  signedUrl(key: string, opts: { expiresInSeconds: number; fileName?: string }): Promise<string>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_\-.]+$/;
const assertKey = (key: string) => {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw Errors.badRequest('Invalid storage key');
};

/** Local disk driver (development / single-node). Files live under STORAGE_LOCAL_PATH and are only served through signed URLs. */
class LocalDriver implements StorageDriver {
  readonly name = 'local';
  private root = path.resolve(process.cwd(), env.STORAGE_LOCAL_PATH);

  private resolve(key: string) {
    assertKey(key);
    return path.join(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async signedUrl(key: string, opts: { expiresInSeconds: number; fileName?: string }): Promise<string> {
    assertKey(key);
    const expires = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    const sig = signLocal(key, expires);
    const q = new URLSearchParams({ key, expires: String(expires), sig, ...(opts.fileName ? { name: opts.fileName } : {}) });
    return `${env.API_URL ?? ''}/api/v1/files?${q.toString()}`;
  }
}

/** S3-compatible driver (AWS S3, MinIO, R2…). Loaded lazily so the SDK is only required in production. */
class S3Driver implements StorageDriver {
  readonly name = 's3';
  private client: any;
  private presign: any;

  private async sdk() {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      this.client = new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT || undefined, forcePathStyle: env.S3_FORCE_PATH_STYLE, credentials: env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } : undefined });
      this.presign = getSignedUrl;
    }
    return this.client;
  }

  async put(key: string, body: Buffer, mimeType: string): Promise<void> {
    assertKey(key);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await this.sdk()).send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: mimeType }));
  }

  async get(key: string): Promise<Buffer> {
    assertKey(key);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await (await this.sdk()).send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await this.sdk()).send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }

  async signedUrl(key: string, opts: { expiresInSeconds: number; fileName?: string }): Promise<string> {
    assertKey(key);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.sdk();
    return this.presign(client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ResponseContentDisposition: opts.fileName ? `attachment; filename="${opts.fileName}"` : undefined }), { expiresIn: opts.expiresInSeconds });
  }
}

function signLocal(key: string, expires: number): string {
  return hmacSha256(`${key}|${expires}`, env.SIGNED_URL_SECRET).slice(0, 40);
}

/** Verifies a locally signed URL (see LocalDriver.signedUrl). */
export function verifyLocalSignature(key: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(signLocal(key, expires), sig);
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.ms-excel']);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/csv': 'csv', 'text/plain': 'txt', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc', 'application/vnd.ms-excel': 'xls' };

/**
 * Storage abstraction. Keys are namespaced per society (`societies/<id>/<scope>/<random>.<ext>`), so a
 * key never reveals anything and cross-tenant access is impossible without a signed URL.
 */
class StorageService {
  readonly driver: StorageDriver = env.STORAGE_DRIVER === 's3' && env.S3_BUCKET ? new S3Driver() : new LocalDriver();

  async store(input: { societyId: string | null; scope: string; body: Buffer; mimeType: string; name: string; maxBytes?: number }): Promise<StoredObject> {
    const mime = input.mimeType.toLowerCase();
    if (!ALLOWED_MIME.has(mime)) throw Errors.validation({ file: [`File type ${mime} is not allowed`] });
    const max = (input.maxBytes ?? env.MAX_UPLOAD_MB * 1024 * 1024);
    if (input.body.length > max) throw Errors.validation({ file: [`File is larger than ${Math.round(max / 1024 / 1024)} MB`] });
    const key = `${input.societyId ? `societies/${input.societyId}` : 'platform'}/${input.scope.replace(/[^a-z0-9_-]/gi, '')}/${nanoid(16)}.${EXT[mime] ?? 'bin'}`;
    await this.driver.put(key, input.body, mime);
    return { storageKey: key, size: input.body.length, mimeType: mime, name: input.name.slice(0, 200) };
  }

  /** Stores a data-URL (base64) image captured on a phone camera (guard app), resized upstream by the client. */
  async storeDataUrl(input: { societyId: string | null; scope: string; dataUrl: string; name: string }): Promise<StoredObject> {
    const match = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(input.dataUrl);
    if (!match) throw Errors.validation({ photo: ['Expected a base64 data URL'] });
    return this.store({ societyId: input.societyId, scope: input.scope, body: Buffer.from(match[2], 'base64'), mimeType: match[1], name: input.name, maxBytes: 5 * 1024 * 1024 });
  }

  signedUrl(storageKey: string, opts: { expiresInSeconds?: number; fileName?: string } = {}): Promise<string> {
    return this.driver.signedUrl(storageKey, { expiresInSeconds: opts.expiresInSeconds ?? 15 * 60, fileName: opts.fileName });
  }

  get(storageKey: string): Promise<Buffer> {
    return this.driver.get(storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await this.driver.delete(storageKey);
    } catch (err) {
      logger.warn({ err, storageKey }, 'Storage delete failed');
    }
  }

  /** Tenant guard: a society may only sign keys inside its own namespace. */
  assertOwned(storageKey: string, societyId: string | null): void {
    const prefix = societyId ? `societies/${societyId}/` : 'platform/';
    if (!storageKey.startsWith(prefix)) throw Errors.forbidden('File does not belong to this society');
  }
}

export const storageService = new StorageService();
