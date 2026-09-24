/**
 * Demo seed: creates a realistic society with structure, users and configuration so the app is
 * usable right after `npm run seed`. Safe to re-run (idempotent by society slug).
 *
 *   Super admin  superadmin@societyerp.local / SuperAdmin@123
 *   Society admin admin@palmgrove.demo / Admin@12345
 *   Committee    committee@palmgrove.demo / Committee@123
 *   Guard        guard@palmgrove.demo / Guard@12345
 *   Member       member@palmgrove.demo / Member@12345
 */
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { connectDatabase, disconnectDatabase } from '../lib/mongo';
import { ensureBootstrapData } from './bootstrap';
import { Society } from '../models/society.model';
import { Role } from '../models/role.model';
import { User } from '../models/user.model';
import { Membership } from '../models/membership.model';
import { UserRole } from '../models/user-role.model';
import { Plan } from '../models/plan.model';
import { Lead } from '../models/lead.model';
import { hashPassword } from '../lib/crypto';
import { societyService } from '../core/tenancy/society.service';
import { unitService } from '../modules/units/units.service';
import { supportService } from '../modules/public/support.service';
import { registerSeedHooks, runSeedHooks } from './hooks';
import '../core/notifications/subscribers';
import '../core/categories/category.service';
import '../modules/residents/residents.seed';
import '../modules/billing/billing.seed';
import '../modules/expenses/expenses.seed';
import '../modules/complaints/complaints.seed';
import '../modules/visitors/visitors.seed';
import '../modules/amenities/amenities.seed';
import '../modules/community/community.seed';
import '../modules/documents/documents.seed';
import '../modules/governance/governance.seed';
import '../modules/operations/operations.seed';
import '../modules/security/security.seed';
import '../modules/assets/assets.seed';

export const DEMO = {
  society: { name: 'Palm Grove Residency', slug: 'palm-grove', city: 'Bengaluru' },
  admin: { name: 'Anita Rao', email: 'admin@palmgrove.demo', password: 'Admin@12345' },
  users: [
    { name: 'Vikram Committee', email: 'committee@palmgrove.demo', password: 'Committee@123', role: 'COMMITTEE' },
    { name: 'Ramesh Guard', email: 'guard@palmgrove.demo', password: 'Guard@12345', role: 'SECURITY_GUARD' },
    { name: 'Priya Member', email: 'member@palmgrove.demo', password: 'Member@12345', role: 'MEMBER' },
  ],
};

async function ensureUser(societyId: string, input: { name: string; email: string; password: string; role: string }) {
  let user = await User.findOne({ email: input.email });
  if (!user) user = await User.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), status: 'ACTIVE', emailVerifiedAt: new Date() });
  const role = await Role.findOne({ societyId, key: input.role });
  if (!role) throw new Error(`Role ${input.role} missing`);
  await Membership.updateOne({ userId: user._id, societyId }, { $setOnInsert: { status: 'ACTIVE', joinedAt: new Date() } }, { upsert: true });
  await UserRole.updateOne({ userId: user._id, roleId: role._id, societyId }, { $setOnInsert: { assignedAt: new Date() } }, { upsert: true });
  return user;
}

export async function seedDemo(): Promise<{ societyId: string }> {
  let society = await Society.findOne({ slug: DEMO.society.slug });
  if (!society) {
    const plan = await Plan.findOne({ slug: 'growth' }).lean();
    if (!plan) throw new Error('Growth plan missing - run bootstrap first');
    const created = await societyService.createSociety({
      society: { name: DEMO.society.name, slug: DEMO.society.slug, city: DEMO.society.city, state: 'Karnataka', pincode: '560103', addressLine1: '12, Outer Ring Road', type: 'APARTMENT', totalUnits: 48 },
      admin: DEMO.admin,
      planId: String(plan._id),
      billingCycle: 'ANNUAL',
      startTrial: true,
      source: 'SEED',
      allowExistingAdmin: true,
    });
    society = created.society;
    logger.info({ slug: society.slug }, 'Demo society created');
  }
  const societyId = String(society._id);
  const adminUser = await User.findOne({ email: DEMO.admin.email });
  if (!adminUser) throw new Error('Demo admin missing');
  const adminId = String(adminUser._id);

  // structure: 2 towers × 4 floors × 6 units
  const existingBuildings = await unitService.listBuildings(societyId);
  if (!existingBuildings.length) {
    for (const [name, code] of [['Tower A', 'A'], ['Tower B', 'B']] as const) {
      const b: any = await unitService.createBuilding(societyId, { name, code, type: 'TOWER', floors: 4 }, adminId);
      await unitService.bulkCreate(societyId, { buildingId: String(b.id ?? b._id), floorFrom: 1, floorTo: 4, unitsPerFloor: 6, numberPattern: '{floor}{seq2}', type: 'FLAT', areaSqft: 1150 }, adminId);
    }
    logger.info('Demo buildings & units created');
  }

  for (const u of DEMO.users) await ensureUser(societyId, u);

  if (!(await Lead.countDocuments())) {
    await Lead.insertMany([
      { type: 'DEMO_REQUEST', name: 'Suresh Menon', email: 'suresh@lakeview.example', phone: '9876501234', societyName: 'Lake View Residency', city: 'Kochi', message: 'We manage 220 flats and want to move off Excel.', source: 'website', status: 'NEW' },
      { type: 'PLAN_ENQUIRY', name: 'Neha Kulkarni', email: 'neha@greenmeadows.example', societyName: 'Green Meadows RWA', city: 'Pune', message: 'Does the Growth plan include visitor QR passes?', source: 'pricing', status: 'CONTACTED' },
    ]);
  }
  const existingTicket = await (await import('../models/support-ticket.model')).SupportTicket.countDocuments({ societyId });
  if (!existingTicket) {
    await supportService.create({ source: 'SOCIETY_ADMIN', societyId, requesterUserId: adminId, name: adminUser.name, email: adminUser.email, subject: 'How do we import last year’s opening balances?', message: 'We have a Tally export with unit-wise dues. What is the recommended way to bring it in?', priority: 'NORMAL' });
  }

  await runSeedHooks({ societyId, adminUserId: adminId });
  await societyService.computeStats(societyId);
  return { societyId };
}

async function main(): Promise<void> {
  await connectDatabase();
  await ensureBootstrapData();
  const { societyId } = await seedDemo();
  logger.info({ societyId, superAdmin: env.SEED_SUPER_ADMIN_EMAIL, societyAdmin: DEMO.admin.email }, 'Seed complete');
  await disconnectDatabase();
  process.exit(0);
}

export { registerSeedHooks };

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('seed/index.ts') || process.argv[1]?.replace(/\\/g, '/').endsWith('dist/seed.js');
if (isDirectRun) {
  main().catch((err) => {
    logger.fatal({ err }, 'Seed failed');
    process.exit(1);
  });
}
