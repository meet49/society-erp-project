import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

/** Starts one embedded MongoDB replica set for the whole test run (transactions supported). */
export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = replSet.getUri('society_erp_test');
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
}
