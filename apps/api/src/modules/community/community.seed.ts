import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Notice } from '../../models/notice.model';
import { Building } from '../../models/building.model';
import { Resident } from '../../models/resident.model';
import { User } from '../../models/user.model';
import { logger } from '../../lib/logger';
import { noticeService } from './notices.service';
import { communityService } from './posts.service';
import { eventService } from './events.service';
import { pollService } from './polls.service';
import { surveyService } from './surveys.service';

/** Demo communication: notices in every state, a lively feed, an upcoming event, an open poll and a survey. */
registerSeedHooks('community', async ({ societyId, adminUserId }) => {
  if (await Notice.countDocuments({ societyId })) return;
  const towerA = await Building.findOne({ societyId, code: 'A' }).select('_id').lean();
  const memberUser = await User.findOne({ email: 'member@palmgrove.demo' }).select('_id').lean();
  const memberRes = memberUser ? await Resident.findOne({ societyId, userId: memberUser._id, deletedAt: null }).select('unitId').lean() : null;
  const member = memberUser && memberRes ? { userId: String(memberUser._id), unitIds: [String(memberRes.unitId)], roleKeys: ['MEMBER'] } : null;

  await noticeService.create(societyId, { title: 'Water supply interruption on Saturday', body: 'The overhead tanks will be cleaned on Saturday between 10:00 and 14:00. Please store water in advance. The pump room will be closed during the work.', categoryKey: 'MAINTENANCE', priority: 'IMPORTANT', isPinned: true, publishNow: true }, adminUserId);
  await noticeService.create(societyId, { title: 'Annual General Meeting - 28th', body: 'The AGM will be held in the community hall at 6 pm. Agenda: audited accounts, budget for the coming year, committee elections. Every unit should attend or send a proxy.', categoryKey: 'MEETING', priority: 'NORMAL', requiresAcknowledgement: true, publishNow: true }, adminUserId);
  if (towerA) await noticeService.create(societyId, { title: 'Tower A lift maintenance', body: 'Lift 2 in Tower A will be under annual maintenance on Tuesday from 9 am to 1 pm. Please use lift 1 or the stairs.', categoryKey: 'MAINTENANCE', audience: { type: 'BUILDING', buildingIds: [String(towerA._id)], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] }, publishNow: true }, adminUserId);
  await noticeService.create(societyId, { title: 'Diwali celebrations - volunteers needed', body: 'We are planning a two-day celebration. Volunteers for decoration, food stalls and cultural programme are welcome. Reply on the community feed.', categoryKey: 'FESTIVAL', publishAt: dayjs().add(2, 'day').hour(9).minute(0).toDate() }, adminUserId);
  await noticeService.create(societyId, { title: 'Revised parking rules (draft)', body: 'Draft rules for visitor parking slots. To be discussed by the committee before publishing.', categoryKey: 'CIRCULAR' }, adminUserId);

  const admin = { userId: adminUserId, unitIds: [] as string[], roleKeys: ['SOCIETY_ADMIN'], isModerator: true, canAnnounce: true, canCreate: true };
  const welcome = await communityService.create(societyId, { kind: 'ANNOUNCEMENT', title: 'Welcome to the Palm Grove community feed', body: 'Use this space for neighbourly updates, recommendations and lost-and-found. Keep it kind; the committee moderates reported posts.', isPinned: true }, admin);
  if (member) {
    const post = await communityService.create(societyId, { body: 'Does anyone have a recommendation for a reliable plumber? The society vendor is booked till next week.' }, { ...member, isModerator: false, canAnnounce: false, canCreate: true });
    await communityService.comment(societyId, post.id, 'Try Ravi from Block B; he did our bathroom last month. Number is with the office.', admin);
    await communityService.toggleLike(societyId, welcome.id, { ...member, isModerator: false, canAnnounce: false, canCreate: true });
  }

  const ev = await eventService.create(societyId, { title: 'Sunday yoga on the lawn', description: 'Beginner-friendly session led by a resident instructor. Bring your own mat.', typeKey: 'COMMUNITY', startAt: dayjs().add(5, 'day').hour(7).minute(0).toDate(), endAt: dayjs().add(5, 'day').hour(8).minute(0).toDate(), venue: 'Central lawn', capacity: 30, maxGuestsPerRsvp: 2, publishNow: true }, adminUserId);
  if (member) await eventService.rsvp(societyId, ev.id, { status: 'GOING', guests: 1 }, { ...member, ownScope: true });

  const poll = await pollService.create(societyId, { question: 'Which day suits you best for the monthly committee open house?', options: ['Saturday morning', 'Saturday evening', 'Sunday morning'], anonymous: true, oneVotePerUnit: true, endAt: dayjs().add(7, 'day').toDate(), openNow: true }, adminUserId);
  if (member) await pollService.vote(societyId, poll.id, ['o3'], { ...member, ownScope: true, canSeeResults: false });

  const survey = await surveyService.create(societyId, { title: 'Housekeeping satisfaction survey', description: 'Two minutes to tell us how the housekeeping team is doing.', questions: [{ type: 'RATING', label: 'How clean are the common areas?', max: 5 }, { type: 'SINGLE', label: 'How often do you see the staff on your floor?', options: ['Daily', 'A few times a week', 'Rarely'] }, { type: 'TEXT', label: 'Anything we should fix first?', required: false }], anonymous: true, endAt: dayjs().add(14, 'day').toDate(), openNow: true }, adminUserId);
  if (member) await surveyService.respond(societyId, survey.id, [{ questionKey: 'q1', value: 4 }, { questionKey: 'q2', value: 'Daily' }, { questionKey: 'q3', value: 'The basement corridor needs better lighting.' }], { ...member, ownScope: true, canSeeResults: false });
  logger.info('Demo notices, feed, event, poll and survey created');
});
