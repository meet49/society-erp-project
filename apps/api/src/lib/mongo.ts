import mongoose, { type ClientSession } from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { env, isProd } from '../config/env';
import { logger } from './logger';

let embedded: { stop: () => Promise<boolean> } | null = null;
let supportsTransactions = false;

/**
 * Starts an embedded MongoDB replica set (development / test convenience when no MONGODB_URI is configured).
 * Data is persisted under EMBEDDED_MONGO_PATH so developer data survives restarts.
 */
async function startEmbeddedMongo(): Promise<string> {
  if (isProd) throw new Error('MONGODB_URI is required in production');
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const dbPath = path.resolve(process.cwd(), env.EMBEDDED_MONGO_PATH);
  const persistent = env.NODE_ENV !== 'test';
  if (persistent) fs.mkdirSync(dbPath, { recursive: true });
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', dbName: env.MONGODB_DB_NAME },
    instanceOpts: persistent ? [{ dbPath, storageEngine: 'wiredTiger', port: 27117 }] : [{ storageEngine: 'wiredTiger' }],
  });
  embedded = replSet;
  const uri = replSet.getUri(env.MONGODB_DB_NAME);
  logger.warn({ dbPath: persistent ? dbPath : 'ephemeral' }, 'MONGODB_URI not set - started embedded MongoDB replica set');
  return uri;
}

export async function connectDatabase(uriOverride?: string): Promise<void> {
  const uri = uriOverride || env.MONGODB_URI || (await startEmbeddedMongo());
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: uri.includes(env.MONGODB_DB_NAME) ? undefined : env.MONGODB_DB_NAME,
    autoIndex: !isProd,
    serverSelectionTimeoutMS: 15000,
  });
  try {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    supportsTransactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    supportsTransactions = false;
  }
  logger.info({ transactions: supportsTransactions, db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect().catch(() => undefined);
  if (embedded) {
    await embedded.stop().catch(() => undefined);
    embedded = null;
  }
}

export function transactionsSupported(): boolean {
  return supportsTransactions;
}

/**
 * Runs `fn` inside a MongoDB transaction when the topology supports it. On standalone servers the
 * callback runs without a session; callers must then rely on compensating actions for atomicity.
 */
export async function withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!supportsTransactions) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export function toObjectId(id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
}

export function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && /^[a-fA-F0-9]{24}$/.test(id);
}

export { mongoose };
