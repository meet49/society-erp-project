import mongoose from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { connectDatabase, disconnectDatabase } from '../../src/lib/mongo';
import { createApp } from '../../src/app';
import { ensureBootstrapData } from '../../src/seed/bootstrap';
import { societyService } from '../../src/core/tenancy/society.service';
import { Plan } from '../../src/models/plan.model';
import { accessCache, configCache } from '../../src/lib/cache';
import { jobQueue } from '../../src/core/jobs/queue';
import { startJobs } from '../../src/core/jobs/scheduler';
import '../../src/core/notifications/subscribers';

export const SUPER = { email: 'superadmin@societyerp.local', password: 'SuperAdmin@123' };

let app: Express | null = null;

export async function setupTestApp(): Promise<{ app: Express; api: ReturnType<typeof request> }> {
  if (mongoose.connection.readyState !== 1) await connectDatabase(process.env.MONGODB_URI);
  await mongoose.connection.db!.dropDatabase();
  // dropDatabase removes indexes; rebuild them so unique constraints hold in tests
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  accessCache.clear();
  configCache.clear();
  await ensureBootstrapData();
  await startJobs({ processJobs: true, schedule: false });
  app = createApp();
  return { app, api: request(app) };
}

export async function teardownTestApp(): Promise<void> {
  await jobQueue.stop();
  await disconnectDatabase();
  app = null;
}

export function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function login(api: ReturnType<typeof request>, email: string, password: string, societyId?: string) {
  const res = await api.post('/api/v1/auth/login').send({ email, password, societyId });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { accessToken: string; refreshToken: string; context: any };
}

export async function planIdBySlug(slug: string): Promise<string> {
  const plan = await Plan.findOne({ slug }).select('_id').lean();
  if (!plan) throw new Error(`Plan ${slug} not found`);
  return String(plan._id);
}

let counter = 0;
export async function createSociety(opts: { name?: string; adminEmail?: string; adminPassword?: string; planSlug?: string; billingCycle?: 'MONTHLY' | 'ANNUAL'; startTrial?: boolean } = {}) {
  counter += 1;
  const name = opts.name ?? `Test Society ${counter}`;
  const adminEmail = opts.adminEmail ?? `admin${counter}-${Date.now()}@test.local`;
  const adminPassword = opts.adminPassword ?? 'Admin@12345';
  const planId = await planIdBySlug(opts.planSlug ?? 'growth');
  const result = await societyService.createSociety({
    society: { name, city: 'Bengaluru', type: 'APARTMENT' },
    admin: { name: 'Society Admin', email: adminEmail, password: adminPassword },
    planId,
    billingCycle: opts.billingCycle ?? 'MONTHLY',
    startTrial: opts.startTrial ?? true,
    source: 'SEED',
    allowExistingAdmin: true,
  });
  return { societyId: String(result.society._id), slug: result.society.slug, adminUserId: String(result.adminUser._id), adminEmail, adminPassword, planId };
}

/** Waits for in-process jobs / event handlers that run on the next ticks. */
export const flush = (ms = 50) => new Promise((r) => setTimeout(r, ms));
