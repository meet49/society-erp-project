import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool.default(false),

  /** Public URLs */
  APP_URL: z.string().url().default('http://localhost:5174'),
  API_URL: z.string().url().default('http://localhost:4100'),
  CORS_ORIGINS: z.string().default('http://localhost:5174,http://127.0.0.1:5174'),

  /** Database. When empty in non-production, an embedded MongoDB replica set is started (persistent data dir). */
  MONGODB_URI: z.string().optional().default(''),
  MONGODB_DB_NAME: z.string().default('society_erp'),
  EMBEDDED_MONGO_PATH: z.string().default('.data/mongo'),

  /** Redis for BullMQ + cross-instance cache invalidation. Optional in development (in-process fallback). */
  REDIS_URL: z.string().optional().default(''),

  /** Auth */
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(15 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).default(30 * 24 * 3600),
  JWT_ISSUER: z.string().default('society-erp'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(11),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).default(8),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),

  /** Secrets for signed URLs and encrypting stored credentials (gateway keys) */
  SIGNED_URL_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),

  /** Storage */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('.data/uploads'),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('ap-south-1'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: bool.default(false),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(200).default(15),

  /** Email */
  EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('Society ERP <no-reply@societyerp.local>'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),

  /** WhatsApp */
  WHATSAPP_DRIVER: z.enum(['console', 'meta']).default('console'),
  WHATSAPP_META_TOKEN: z.string().optional().default(''),
  WHATSAPP_META_PHONE_ID: z.string().optional().default(''),

  /** Push (Web Push / VAPID) */
  PUSH_DRIVER: z.enum(['console', 'webpush']).default('console'),
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().optional().default('mailto:admin@societyerp.local'),

  /** Payments (platform-level gateway for subscription payments) */
  PAYMENT_DRIVER: z.enum(['mock', 'razorpay']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  MOCK_PAYMENT_SECRET: z.string().optional().default('mock-payment-secret'),

  /** Rate limiting */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().default(600),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(20),

  /** Seed */
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('superadmin@societyerp.local'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default('SuperAdmin@123'),
  SEED_DEMO_DATA: bool.default(true),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    console.error(`Invalid environment configuration:\n  ${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
