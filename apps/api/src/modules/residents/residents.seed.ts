import { registerSeedHooks } from '../../seed/hooks';
import { Resident } from '../../models/resident.model';
import { Unit } from '../../models/unit.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { residentService } from './residents.service';

const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vivaan', 'Isha', 'Arjun', 'Nisha', 'Dev', 'Sara', 'Kunal', 'Riya', 'Aditya', 'Pooja', 'Nikhil', 'Tara', 'Manav', 'Zoya', 'Rahul', 'Kavya', 'Sameer', 'Neha'];
const LAST = ['Sharma', 'Iyer', 'Khan', 'Patel', 'Reddy', 'Nair', 'Gupta', 'Das', 'Mehta', 'Joshi', 'Bose', 'Kulkarni'];

/** Demo residents: an owner for most units, a few tenants, and the demo member login linked to unit A-101. */
registerSeedHooks('residents', async ({ societyId, adminUserId }) => {
  if (await Resident.countDocuments({ societyId })) return;
  const units = await Unit.find({ societyId, deletedAt: null }).sort({ code: 1 }).lean();
  let created = 0;
  for (const [i, unit] of units.entries()) {
    if (i % 6 === 5) continue; // leave a few units vacant
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const phone = `98${String(10000000 + i * 3571).slice(-8)}`;
    await residentService.create(societyId, { unitId: String(unit._id), name, phone, email: `${name.toLowerCase().replace(/\s+/g, '.')}@palmgrove.demo`, type: 'OWNER', isPrimary: true, moveInDate: new Date(2023, i % 12, 1) }, adminUserId);
    created += 1;
    if (i % 4 === 3) {
      const tenant = `${FIRST[(i + 5) % FIRST.length]} ${LAST[(i + 3) % LAST.length]}`;
      await residentService.create(societyId, { unitId: String(unit._id), name: tenant, phone: `97${String(10000000 + i * 1237).slice(-8)}`, type: 'TENANT', isPrimary: false, tenancy: { rent: 18000 + (i % 5) * 2500, deposit: 100000 } }, adminUserId);
      created += 1;
    }
  }
  // link the demo member login to the owner of the first unit (household access)
  const member = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id name').lean();
  const firstUnit = units[0];
  if (member && firstUnit) {
    const owner = await Resident.findOne({ societyId, unitId: firstUnit._id, type: 'OWNER' });
    if (owner) {
      owner.userId = member._id;
      owner.name = member.name;
      owner.email = 'member@palmgrove.demo';
      await owner.save();
    }
  }
  logger.info({ residents: created }, 'Demo residents created');
});
