import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Complaint } from '../../models/complaint.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { complaintService, type Actor } from './complaints.service';

/** Demo helpdesk: a spread of tickets across categories, statuses and SLA states. */
registerSeedHooks('complaints', async ({ societyId, adminUserId }) => {
  if (await Complaint.countDocuments({ societyId })) return;
  const residents = await Resident.find({ societyId, userId: { $ne: null }, deletedAt: null }).select('userId unitId').limit(5).lean();
  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const memberResident = residents.find((r) => String(r.userId) === String(memberUser?._id)) ?? residents[0];
  const member: Actor | null = memberResident ? { userId: String(memberResident.userId), ownScope: true, unitIds: [String(memberResident.unitId)], residentId: String(memberResident._id), canViewInternal: false } : null;
  const admin: Actor = { userId: adminUserId, ownScope: false, unitIds: [], residentId: null, canViewInternal: true };
  const staffUser = await User.findOne({ email: 'committee@palmgrove.demo' }).select('_id').lean();
  const seed = [
    { by: member, title: 'Water leakage from bathroom ceiling', categoryKey: 'PLUMBING', priority: 'HIGH', description: 'Dripping steadily since last night; the flat above may have a broken joint.', flow: 'in_progress', daysAgo: 1 },
    { by: member, title: 'Corridor light not working on 1st floor', categoryKey: 'ELECTRICAL', priority: 'NORMAL', isPublic: true, flow: 'resolved', daysAgo: 6 },
    { by: admin, title: 'Lift B making grinding noise', categoryKey: 'LIFT', priority: 'CRITICAL', isPublic: true, flow: 'open_overdue', daysAgo: 2 },
    { by: admin, title: 'Garbage not collected from Tower B on Sunday', categoryKey: 'HOUSEKEEPING', priority: 'NORMAL', isPublic: true, flow: 'closed', daysAgo: 12 },
    { by: member, title: 'Visitor parking blocked by unknown car', categoryKey: 'PARKING', priority: 'LOW', flow: 'open', daysAgo: 0 },
    { by: admin, title: 'Gym treadmill belt slipping', categoryKey: 'COMMON_AREA', priority: 'NORMAL', isPublic: true, flow: 'in_progress', daysAgo: 3 },
  ];
  let count = 0;
  for (const t of seed) {
    const actor = t.by ?? admin;
    const created: any = await complaintService.create(societyId, { title: t.title, description: t.description, categoryKey: t.categoryKey, priority: t.priority, isPublic: Boolean(t.isPublic) }, actor);
    const id = String(created._id ?? created.id);
    const createdAt = dayjs().subtract(t.daysAgo, 'day').subtract(3, 'hour').toDate();
    await Complaint.updateOne({ _id: id }, { $set: { createdAt, 'sla.responseDueAt': dayjs(createdAt).add(created.sla?.responseMinutes ?? 240, 'minute').toDate(), 'sla.resolutionDueAt': dayjs(createdAt).add(created.sla?.resolutionMinutes ?? 2880, 'minute').toDate() } });
    if (['in_progress', 'resolved', 'closed'].includes(t.flow) && staffUser) await complaintService.assign(societyId, id, { assignedTo: String(staffUser._id), note: 'Please take this up' }, adminUserId);
    if (t.flow === 'in_progress') await complaintService.comment(societyId, id, { body: 'Technician scheduled for tomorrow morning.' }, admin);
    if (t.flow === 'resolved' || t.flow === 'closed') await complaintService.changeStatus(societyId, id, { status: 'RESOLVED', note: 'Fixed and verified.' }, admin);
    if (t.flow === 'closed') {
      await complaintService.changeStatus(societyId, id, { status: 'CLOSED' }, admin);
      if (member && String(created.raisedBy) === member.userId) await complaintService.rate(societyId, id, { score: 5, comment: 'Quick and clean' }, member);
    }
    count += 1;
  }
  await complaintService.escalateOverdue();
  logger.info({ complaints: count }, 'Demo complaints created');
});
