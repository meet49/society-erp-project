import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { registerSeedHooks } from '../../seed/hooks';
import { Incident } from '../../models/incident.model';
import { EmergencyAlert } from '../../models/emergency.model';
import { Unit } from '../../models/unit.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { incidentService, type Actor as IncidentActor } from './incidents.service';
import { emergencyService, type Actor as EmergencyActor } from './emergency.service';

/** Demo security desk: a few incidents in every state, default helplines, one resolved SOS and an expired broadcast. */
registerSeedHooks('security', async ({ societyId, adminUserId }) => {
  if (await Incident.countDocuments({ societyId })) return;
  const guardUser = await User.findOne({ email: 'guard@palmgrove.demo' }).select('_id').lean();
  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const units = await Unit.find({ societyId, deletedAt: null }).sort({ code: 1 }).select('_id code').limit(4).lean();
  const gates = await incidentService.listGates(societyId);
  const gateId = gates[0] ? String(gates[0]._id) : null;
  const guard: IncidentActor = { userId: String(guardUser?._id ?? adminUserId), canViewAll: false, canUpdate: false, canResolve: false, isGuard: true };
  const admin: IncidentActor = { userId: adminUserId, canViewAll: true, canUpdate: true, canResolve: true, isGuard: false };

  const open: any = await incidentService.create(societyId, { title: 'Unknown two-wheeler parked at the fire exit', typeKey: 'SECURITY_BREACH', severity: 'MEDIUM', location: 'Basement 1, near fire exit', gateId, occurredAt: dayjs().subtract(2, 'hour').toDate(), description: 'Bike without a society sticker blocking the exit. Owner not traceable.', involved: [{ name: 'KA 05 XX 4321', type: 'VEHICLE' }] }, guard);
  const investigating: any = await incidentService.create(societyId, { title: 'Cycle missing from Tower A stand', typeKey: 'THEFT', severity: 'HIGH', location: 'Tower A cycle stand', unitId: units[1] ? String(units[1]._id) : null, occurredAt: dayjs().subtract(1, 'day').toDate(), description: 'Resident reports a red Hercules cycle missing since last night. CCTV footage requested.', police: { reported: true, firNumber: 'FIR/2024/0132', station: 'Whitefield PS' } }, admin);
  await incidentService.assign(societyId, investigating.id, adminUserId, admin);
  await incidentService.addNote(societyId, investigating.id, { note: 'CCTV from 22:00-06:00 shared with the police. Awaiting their visit.' }, admin);
  const resolved: any = await incidentService.create(societyId, { title: 'Water leak from overhead tank flooding staircase', typeKey: 'PROPERTY_DAMAGE', severity: 'HIGH', location: 'Tower B terrace', occurredAt: dayjs().subtract(3, 'day').toDate(), description: 'Overflow valve stuck. Staircase slippery.' }, guard);
  await incidentService.resolve(societyId, resolved.id, { note: 'Valve replaced by the plumber; staircase cleaned and cordoned off until dry.', actionTaken: 'Plumber called, valve replaced' }, admin);
  const closed: any = await incidentService.create(societyId, { title: 'Argument between delivery rider and resident at gate', typeKey: 'DISPUTE', severity: 'LOW', location: 'Main gate', gateId, occurredAt: dayjs().subtract(9, 'day').toDate() }, guard);
  await incidentService.resolve(societyId, closed.id, { note: 'Both parties calmed down; rider left. No further action.', close: true }, admin);
  void open;

  // emergency: contacts come from platform defaults; add a resolved SOS and an expired broadcast for history
  await emergencyService.ensureDefaultContacts(societyId);
  await emergencyService.createContact(societyId, { name: 'Society office', phone: '080-4000-1234', category: 'COMMITTEE', notes: 'Weekdays 9am-6pm' }, adminUserId);
  await emergencyService.createContact(societyId, { name: 'Manipal Hospital, Whitefield', phone: '080-6666-7777', category: 'HOSPITAL', address: 'ITPL Main Road', notes: '24x7 emergency' }, adminUserId);
  if (memberUser && units[0] && !(await EmergencyAlert.countDocuments({ societyId }))) {
    const member: EmergencyActor = { userId: String(memberUser._id), unitIds: [String(units[0]._id)], roleKeys: ['MEMBER'], canRespond: false, canManage: false, canBroadcast: false, isGuard: false };
    const responder: EmergencyActor = { userId: adminUserId, unitIds: [], roleKeys: ['SOCIETY_ADMIN'], canRespond: true, canManage: true, canBroadcast: true, isGuard: false };
    const sos: any = await emergencyService.raiseSos(societyId, { category: 'MEDICAL', location: `Flat ${units[0].code}`, message: 'Elderly parent fainted, need help carrying to the car' }, member);
    await emergencyService.acknowledge(societyId, sos.id, 'Guard and committee member on the way', responder);
    await emergencyService.resolve(societyId, sos.id, { note: 'Taken to hospital in the society car; stable.' }, responder);
    await EmergencyAlert.collection.updateOne({ _id: new mongoose.Types.ObjectId(sos.id) }, { $set: { createdAt: dayjs().subtract(5, 'day').toDate(), acknowledgedAt: dayjs().subtract(5, 'day').add(3, 'minute').toDate(), resolvedAt: dayjs().subtract(5, 'day').add(40, 'minute').toDate() } });
    const bc: any = await emergencyService.broadcast(societyId, { title: 'Water supply cut for pipeline repair', message: 'BWSSB is repairing the main line. No water from 10am to 4pm today. Tankers arranged at the clubhouse.', category: 'OTHER', expiresInHours: 6 }, responder);
    await EmergencyAlert.collection.updateOne({ _id: new mongoose.Types.ObjectId(bc.id) }, { $set: { status: 'EXPIRED', createdAt: dayjs().subtract(12, 'day').toDate(), expiresAt: dayjs().subtract(12, 'day').add(6, 'hour').toDate() } });
  }
  logger.info({ societyId }, 'Demo incidents, emergency contacts and alerts created');
});
