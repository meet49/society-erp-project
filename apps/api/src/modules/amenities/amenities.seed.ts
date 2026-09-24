import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Amenity } from '../../models/amenity.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { amenityService, type Actor } from './amenities.service';

/** Demo amenities with different pricing / approval rules plus a few bookings in every state. */
registerSeedHooks('amenities', async ({ societyId, adminUserId }) => {
  if (await Amenity.countDocuments({ societyId })) return;
  const admin: Actor = { userId: adminUserId, ownScope: false, unitIds: [], residentId: null, canCancelAny: true, canManage: true };
  const gym = await amenityService.createAmenity(societyId, { name: 'Gym', typeKey: 'GYM', location: 'Clubhouse, ground floor', capacity: 10, schedule: { openTime: '05:30', closeTime: '22:30', slotMinutes: 60, maxSlotsPerBooking: 2 }, rules: 'Carry a towel. Wipe equipment after use.', description: 'Cardio and free weights. Book a slot to guarantee your machine time.' }, adminUserId);
  const hall = await amenityService.createAmenity(societyId, { name: 'Community Hall', typeKey: 'HALL', location: 'Clubhouse, first floor', bookingMode: 'FULL_DAY', maxGuests: 150, requiresApproval: true, pricing: { mode: 'PER_BOOKING', amount: 5000, deposit: 3000 }, cancellationHours: 72, schedule: { openTime: '08:00', closeTime: '23:00', minNoticeHours: 48, maxAdvanceDays: 90 }, rules: 'No loud music after 10 pm. Decorations must be removed the same night.' }, adminUserId);
  const court = await amenityService.createAmenity(societyId, { name: 'Badminton Court', typeKey: 'COURT', location: 'Block B basement', capacity: 1, pricing: { mode: 'PER_SLOT', amount: 100 }, schedule: { openTime: '06:00', closeTime: '21:00', slotMinutes: 60, maxSlotsPerBooking: 2 } }, adminUserId);
  await amenityService.createAmenity(societyId, { name: 'Swimming Pool', typeKey: 'POOL', location: 'Podium level', capacity: 20, schedule: { openTime: '06:00', closeTime: '20:00', slotMinutes: 60, maxSlotsPerBooking: 1, daysOpen: [0, 2, 3, 4, 5, 6] }, rules: 'Swimming caps mandatory. Closed on Mondays for cleaning.' }, adminUserId);
  await amenityService.createAmenity(societyId, { name: 'Guest Room', typeKey: 'GUEST_ROOM', location: 'Block A, ground floor', bookingMode: 'FULL_DAY', maxGuests: 3, requiresApproval: true, pricing: { mode: 'PER_BOOKING', amount: 1200, deposit: 1000 }, schedule: { openTime: '12:00', closeTime: '11:00', maxAdvanceDays: 60 } }, adminUserId);

  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const residents = await Resident.find({ societyId, userId: { $ne: null }, deletedAt: null }).select('userId unitId').limit(4).lean();
  const memberRes = residents.find((r) => String(r.userId) === String(memberUser?._id)) ?? residents[0];
  if (!memberRes) return;
  const member: Actor = { userId: String(memberRes.userId), ownScope: true, unitIds: [String(memberRes.unitId)], residentId: String(memberRes._id), canCancelAny: false, canManage: false };
  const at = (days: number, hour: number, minute = 0) => dayjs().add(days, 'day').hour(hour).minute(minute).second(0).millisecond(0).toDate();
  let count = 0;
  try {
    await amenityService.book(societyId, { amenityId: gym.id, startAt: at(1, 7, 30), slots: 1 }, member); // confirmed
    await amenityService.book(societyId, { amenityId: court.id, startAt: at(2, 18), slots: 1, purpose: 'Weekly game' }, member); // awaiting payment
    await amenityService.book(societyId, { amenityId: hall.id, startAt: at(10, 8), guests: 80, purpose: 'Housewarming' }, member); // awaiting approval
    count += 3;
    const other = residents.find((r) => String(r._id) !== String(memberRes._id));
    if (other) {
      await amenityService.book(societyId, { amenityId: court.id, unitId: String(other.unitId), startAt: at(1, 19), slots: 1 }, admin);
      count += 1;
    }
  } catch (err) {
    logger.warn({ err }, 'Demo amenity bookings partially created');
  }
  logger.info({ bookings: count }, 'Demo amenities created');
});
