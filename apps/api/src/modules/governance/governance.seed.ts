import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Meeting } from '../../models/meeting.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { meetingService } from './meetings.service';
import { votingService } from './voting.service';
import { committeeService } from './committee.service';

/** Demo governance: the sitting committee, a past AGM with minutes, an upcoming committee meeting and an open resolution vote. */
registerSeedHooks('governance', async ({ societyId, adminUserId }) => {
  if (await Meeting.countDocuments({ societyId })) return;
  const admin = await User.findById(adminUserId).select('name').lean();
  const committee = await User.findOne({ email: 'committee@palmgrove.demo' }).select('_id name').lean();
  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const memberRes = memberUser ? await Resident.findOne({ societyId, userId: memberUser._id, deletedAt: null }).select('unitId').lean() : null;
  await committeeService.add(societyId, { userId: adminUserId, name: admin?.name ?? 'Society admin', positionKey: 'CHAIRPERSON', showContactToMembers: true, termStart: dayjs().subtract(8, 'month').toDate(), termEnd: dayjs().add(16, 'month').toDate() }, adminUserId);
  if (committee) await committeeService.add(societyId, { userId: String(committee._id), name: committee.name, positionKey: 'SECRETARY', showContactToMembers: true, termStart: dayjs().subtract(8, 'month').toDate(), termEnd: dayjs().add(16, 'month').toDate() }, adminUserId);
  await committeeService.add(societyId, { name: 'Sunita Iyer', positionKey: 'TREASURER', termStart: dayjs().subtract(8, 'month').toDate(), termEnd: dayjs().add(16, 'month').toDate() }, adminUserId);

  const agm = await meetingService.create(societyId, { title: 'Annual General Meeting', type: 'AGM', scheduledAt: dayjs().subtract(40, 'day').hour(18).minute(0).toDate(), venue: 'Community hall', agenda: [{ title: 'Adoption of audited accounts' }, { title: 'Budget for the coming year' }, { title: 'Election of committee' }], notify: false }, adminUserId);
  await meetingService.start(societyId, agm.id, adminUserId);
  await meetingService.markAttendance(societyId, agm.id, [{ userId: adminUserId, present: true }, ...(committee ? [{ userId: String(committee._id), present: true }] : []), ...(memberRes ? [{ userId: String(memberUser!._id), unitId: String(memberRes.unitId), present: true }] : [])], adminUserId);
  await meetingService.recordMinutes(societyId, agm.id, { body: 'The chairperson welcomed members. The audited accounts were presented by the treasurer and adopted. The budget was discussed and approved with a 5% increase in maintenance charges from April.', agendaOutcomes: [{ key: 'a1', outcome: 'Adopted unanimously' }, { key: 'a2', outcome: 'Approved with amendments' }, { key: 'a3', outcome: 'Committee re-elected unopposed' }], resolutions: [{ title: 'Adopt the audited accounts', proposedBy: 'Treasurer', secondedBy: 'A-203', votesFor: 38, votesAgainst: 0, abstained: 2, outcome: 'PASSED' }, { title: 'Increase maintenance by 5% from April', proposedBy: 'Chairperson', secondedBy: 'B-104', votesFor: 29, votesAgainst: 9, abstained: 2, outcome: 'PASSED' }], complete: true }, adminUserId);
  await meetingService.publishMinutes(societyId, agm.id, adminUserId);

  await meetingService.create(societyId, { title: 'Monthly committee meeting', type: 'COMMITTEE', scheduledAt: dayjs().add(6, 'day').hour(19).minute(30).toDate(), venue: 'Society office', mode: 'HYBRID', meetingLink: 'https://meet.example.com/palm-grove', agenda: [{ title: 'Pending complaints review', presenter: 'Secretary', durationMinutes: 20 }, { title: 'Lift AMC renewal quotes', presenter: 'Treasurer', durationMinutes: 15 }, { title: 'Diwali celebration budget', durationMinutes: 15 }], notify: false }, adminUserId);

  const vote = await votingService.create(societyId, { title: 'Install solar panels on Tower A and B rooftops', description: 'Capital expense of ₹18 lakh from the sinking fund, recovered over 6 years through lower common electricity bills.', type: 'RESOLUTION', endAt: dayjs().add(10, 'day').toDate(), openNow: true }, adminUserId);
  if (memberUser && memberRes) await votingService.vote(societyId, vote.id, ['FOR'], { userId: String(memberUser._id), unitIds: [String(memberRes.unitId)], roleKeys: ['MEMBER'], ownScope: true, canSeeResults: false });
  logger.info('Demo committee, meetings and voting created');
});
