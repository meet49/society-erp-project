import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Visitor } from '../../models/visitor.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { visitorService, type Actor } from './visitors.service';
import { deliveryService } from './deliveries.service';

/** Demo gate activity: pre-approved passes, walk-ins in every state, a couple of deliveries. */
registerSeedHooks('visitors', async ({ societyId, adminUserId }) => {
  if (await Visitor.countDocuments({ societyId })) return;
  await visitorService.ensureDefaultGate(societyId);
  const guardUser = await User.findOne({ email: 'guard@palmgrove.demo' }).select('_id').lean();
  const residents = await Resident.find({ societyId, userId: { $ne: null }, deletedAt: null }).select('userId unitId').limit(3).lean();
  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const hostRes = residents.find((r) => String(r.userId) === String(memberUser?._id)) ?? residents[0];
  if (!hostRes) return;
  const host: Actor = { userId: String(hostRes.userId), ownScope: true, unitIds: [String(hostRes.unitId)], residentId: String(hostRes._id), isGuard: false };
  const guard: Actor = { userId: String(guardUser?._id ?? adminUserId), ownScope: false, unitIds: [], residentId: null, isGuard: true };
  const gates = await visitorService.listGates(societyId);
  const gateId = String(gates[0]._id);
  let count = 0;
  // pre-approved passes (one used, one live, one recurring maid)
  const used: any = await visitorService.preApprove(societyId, { name: 'Anita Deshmukh', phone: '9812345601', categoryKey: 'GUEST', guestCount: 2, purpose: 'Family visit', expectedAt: dayjs().subtract(3, 'hour').toDate() }, host);
  await visitorService.checkIn(societyId, String(used._id ?? used.id), { gateId }, guard);
  await visitorService.checkOut(societyId, String(used._id ?? used.id), { gateId }, guard);
  await visitorService.preApprove(societyId, { name: 'Urban Company technician', phone: '9812345602', categoryKey: 'SERVICE_PROVIDER', companyName: 'Urban Company', purpose: 'AC servicing', expectedAt: dayjs().add(2, 'hour').toDate() }, host);
  await visitorService.preApprove(societyId, { name: 'Lakshmi (maid)', phone: '9812345603', categoryKey: 'DOMESTIC_HELP', recurring: { days: [1, 2, 3, 4, 5, 6], until: dayjs().add(90, 'day').toDate() } }, host);
  count += 3;
  // walk-ins: one inside (approved by phone), one pending, one denied
  const inside: any = await visitorService.walkIn(societyId, { name: 'Ravi Courier', categoryKey: 'DELIVERY', companyName: 'Flipkart', unitId: String(hostRes.unitId), gateId, approvedByPhone: true }, guard, { canApprove: true });
  void inside;
  await visitorService.walkIn(societyId, { name: 'Salesman Suresh', categoryKey: 'OTHER', unitId: String(hostRes.unitId), gateId, purpose: 'Water purifier demo' }, guard, { canApprove: false });
  const denied: any = await visitorService.walkIn(societyId, { name: 'Unknown caller', categoryKey: 'OTHER', unitId: String(hostRes.unitId), gateId }, guard, { canApprove: false });
  await visitorService.decide(societyId, String(denied._id ?? denied.id), 'DENIED', host, 'Not expecting anyone');
  count += 3;
  // deliveries
  await deliveryService.announce(societyId, { provider: 'Amazon', kind: 'PARCEL', trackingRef: 'AMZ-4471', leaveAtGate: true }, host);
  await deliveryService.arrive(societyId, { unitId: String(hostRes.unitId), provider: 'Amazon', trackingRef: 'AMZ-4471', deliveryPersonName: 'Delivery partner', gateId }, guard);
  await deliveryService.arrive(societyId, { unitId: String(hostRes.unitId), provider: 'Swiggy', kind: 'FOOD', gateId }, guard);
  logger.info({ visitors: count }, 'Demo visitors & deliveries created');
});
