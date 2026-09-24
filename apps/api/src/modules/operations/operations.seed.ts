import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Staff } from '../../models/staff.model';
import { Unit } from '../../models/unit.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { staffService } from './staff.service';
import { domesticHelpService } from './domestic-help.service';
import { parkingService, vehicleService } from './vehicles.service';

/** Demo operations: staff with a week of attendance, domestic help, vehicles and parking allocations. */
registerSeedHooks('operations', async ({ societyId, adminUserId }) => {
  if (await Staff.countDocuments({ societyId })) return;
  const staffSpecs = [
    { name: 'Ramu Yadav', categoryKey: 'HOUSEKEEPING', designation: 'Housekeeping', shiftKey: 'MORNING', salary: { amount: 13000 } },
    { name: 'Sunita Devi', categoryKey: 'HOUSEKEEPING', designation: 'Housekeeping', shiftKey: 'MORNING', salary: { amount: 13000 } },
    { name: 'Mahesh Kumar', categoryKey: 'SECURITY', designation: 'Security supervisor', employmentType: 'AGENCY', shiftKey: 'GENERAL', salary: { amount: 18000 } },
    { name: 'Vijay Singh', categoryKey: 'SECURITY', designation: 'Security guard', employmentType: 'AGENCY', shiftKey: 'NIGHT', salary: { amount: 15000 } },
    { name: 'Anil Electrician', categoryKey: 'MAINTENANCE', designation: 'Electrician', shiftKey: 'GENERAL', salary: { amount: 16000 } },
  ];
  const staff = [];
  for (const spec of staffSpecs) staff.push(await staffService.create(societyId, { ...spec, phone: `98${Math.floor(10000000 + Math.random() * 89999999)}`, joinedAt: dayjs().subtract(1, 'year').toDate(), weeklyOff: [0] }, adminUserId));
  for (let d = 7; d >= 1; d -= 1) {
    const date = dayjs().subtract(d, 'day');
    const key = date.format('YYYY-MM-DD');
    await staffService.markAttendance(societyId, { date: key, entries: staff.map((s, i) => (date.day() === 0 ? { staffId: s.id, status: 'WEEK_OFF' } : i === 1 && d === 3 ? { staffId: s.id, status: 'LEAVE' } : { staffId: s.id, status: 'PRESENT', checkInAt: date.hour(i % 2 ? 6 : 9).minute(i === 2 ? 25 : 5).toDate(), checkOutAt: date.hour(i % 2 ? 14 : 18).minute(10).toDate() })) }, adminUserId);
  }

  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const memberRes = memberUser ? await Resident.findOne({ societyId, userId: memberUser._id, deletedAt: null }).select('unitId').lean() : null;
  const units = await Unit.find({ societyId, deletedAt: null }).sort({ code: 1 }).select('_id code').limit(6).lean();
  if (memberUser && memberRes) {
    const member = { userId: String(memberUser._id), ownScope: true, unitIds: [String(memberRes.unitId)], isGuard: false };
    const maid = await domesticHelpService.register(societyId, { name: 'Lakshmi Bai', phone: '9811122233', typeKey: 'MAID', schedule: 'Daily 7:00–9:00' }, member);
    await domesticHelpService.verify(societyId, maid.id, { status: 'VERIFIED', note: 'Aadhaar verified at the office' }, adminUserId);
    await domesticHelpService.register(societyId, { name: 'Ravi Driver', phone: '9811144455', typeKey: 'DRIVER', schedule: 'Weekdays 8:00–20:00' }, member);
    await vehicleService.create(societyId, { number: 'KA01MJ4521', type: 'CAR', make: 'Hyundai', model: 'Creta', color: 'White' }, member);
    await vehicleService.create(societyId, { number: 'KA01EQ7788', type: 'SCOOTER', make: 'Honda', model: 'Activa', color: 'Grey' }, member);
  }
  const admin = { userId: adminUserId, ownScope: false, unitIds: [], isGuard: false };
  if (units[1]) await vehicleService.create(societyId, { unitId: String(units[1]._id), number: 'KA02AB9090', type: 'EV', make: 'Tata', model: 'Nexon EV', color: 'Blue', stickerNumber: 'PG-0002' }, admin);
  await parkingService.bulkCreate(societyId, { prefix: 'B1-', from: 1, to: 24, level: 'Basement 1', type: 'CAR' });
  await parkingService.bulkCreate(societyId, { prefix: 'EV-', from: 1, to: 4, level: 'Basement 1', type: 'EV' });
  await parkingService.bulkCreate(societyId, { prefix: 'V-', from: 1, to: 6, level: 'Ground', type: 'VISITOR' });
  const slots = await parkingService.list(societyId, { limit: 50 });
  const car = memberRes ? (await vehicleService.list(societyId, { unitId: String(memberRes.unitId), type: 'CAR' }, admin)).items[0] : null;
  const b11 = slots.items.find((x: any) => x.code === 'B1-1');
  if (b11 && memberRes) await parkingService.allocate(societyId, b11.id ?? String(b11._id), { unitId: String(memberRes.unitId), vehicleId: car ? String(car._id ?? car.id) : null }, adminUserId);
  const ev1 = slots.items.find((x: any) => x.code === 'EV-1');
  if (ev1 && units[1]) await parkingService.allocate(societyId, ev1.id ?? String(ev1._id), { unitId: String(units[1]._id) }, adminUserId);
  logger.info({ staff: staff.length }, 'Demo staff, domestic help, vehicles and parking created');
});
