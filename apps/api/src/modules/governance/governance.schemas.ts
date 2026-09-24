import { z } from 'zod';
import { MeetingStatus, MeetingTypes, VotingStatus, VotingTypes, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { audienceSchema } from '../../core/audience/audience.service';
import { CommitteeMemberStatuses } from '../../models/committee.model';

const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });
const agendaItem = z.object({ key: z.string().trim().max(40).optional(), title: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).optional(), presenter: z.string().trim().max(120).optional(), durationMinutes: z.coerce.number().int().min(0).max(600).optional() });

// ------------------------------------------------------------------ meetings
export const meetingCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  type: z.enum(MeetingTypes).default('COMMITTEE'),
  description: z.string().trim().max(3000).optional(),
  scheduledAt: z.coerce.date(),
  endAt: z.coerce.date().nullable().optional(),
  venue: z.string().trim().max(200).optional(),
  mode: z.enum(['IN_PERSON', 'ONLINE', 'HYBRID']).default('IN_PERSON'),
  meetingLink: z.string().trim().url().max(500).optional().or(z.literal('')),
  audience: audienceSchema.optional(),
  agenda: z.array(agendaItem).max(50).default([]),
  attachments: z.array(attachment).max(10).default([]),
  quorumPercent: z.coerce.number().min(0).max(100).optional(),
  notify: z.boolean().default(true),
});
export const meetingUpdateSchema = meetingCreateSchema.omit({ notify: true }).partial();
export const meetingListQuerySchema = paginationQuerySchema.extend({ type: z.enum(MeetingTypes).optional(), status: z.enum(MeetingStatus).optional(), upcoming: booleanQuerySchema, from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const rsvpSchema = z.object({ rsvp: z.enum(['YES', 'NO', 'MAYBE']) });
export const attendanceSchema = z.object({ attendees: z.array(z.object({ userId: objectIdSchema.nullable().optional(), unitId: objectIdSchema.nullable().optional(), name: z.string().trim().max(120).optional(), present: z.boolean(), proxyFor: z.string().trim().max(120).optional() })).max(2000) });
export const minutesSchema = z.object({
  body: z.string().trim().min(1).max(50000),
  agendaOutcomes: z.array(z.object({ key: z.string().trim().min(1).max(40), outcome: z.string().trim().max(2000) })).max(50).optional(),
  resolutions: z.array(z.object({ key: z.string().trim().max(40).optional(), title: z.string().trim().min(2).max(300), description: z.string().trim().max(3000).optional(), proposedBy: z.string().trim().max(120).optional(), secondedBy: z.string().trim().max(120).optional(), votesFor: z.coerce.number().int().min(0).optional(), votesAgainst: z.coerce.number().int().min(0).optional(), abstained: z.coerce.number().int().min(0).optional(), outcome: z.enum(['PENDING', 'PASSED', 'FAILED', 'DEFERRED']).optional() })).max(50).optional(),
  complete: z.boolean().default(true),
});
export const cancelMeetingSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const openResolutionVoteSchema = z.object({ resolutionKey: z.string().trim().min(1).max(40), endAt: z.coerce.date(), audience: audienceSchema.optional() });
export const meetingsConfigSchema = z.object({ reminderHours: z.coerce.number().int().min(1).max(168), agmQuorumPercent: z.coerce.number().min(0).max(100), memberCanSeeCommitteeMinutes: z.boolean() }).partial();

// ------------------------------------------------------------------ voting
const candidate = z.object({ key: z.string().trim().max(40).optional(), label: z.string().trim().min(1).max(200), unitCode: z.string().trim().max(40).optional(), userId: objectIdSchema.nullable().optional(), statement: z.string().trim().max(1000).optional() });
export const votingCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  type: z.enum(VotingTypes).default('RESOLUTION'),
  audience: audienceSchema.optional(),
  candidates: z.array(candidate).max(50).optional(),
  seats: z.coerce.number().int().min(1).max(50).default(1),
  oneVotePerUnit: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  passThresholdPercent: z.coerce.number().min(0).max(100).optional(),
  quorumPercent: z.coerce.number().min(0).max(100).optional(),
  endAt: z.coerce.date().nullable().optional(),
  openNow: z.boolean().default(false),
}).refine((v) => v.type !== 'ELECTION' || (v.candidates?.length ?? 0) >= 2, { message: 'Elections need at least two candidates', path: ['candidates'] });
export const votingUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  audience: audienceSchema.optional(),
  candidates: z.array(candidate).max(50).optional(),
  seats: z.coerce.number().int().min(1).max(50).optional(),
  oneVotePerUnit: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  passThresholdPercent: z.coerce.number().min(0).max(100).optional(),
  quorumPercent: z.coerce.number().min(0).max(100).optional(),
  endAt: z.coerce.date().nullable().optional(),
});
export const votingListQuerySchema = paginationQuerySchema.extend({ type: z.enum(VotingTypes).optional(), status: z.enum(VotingStatus).optional() });
export const ballotSchema = z.object({ choices: z.array(z.string().trim().min(1).max(40)).min(1).max(50) });
export const openVotingSchema = z.object({ endAt: z.coerce.date().nullable().optional() });
export const votingConfigSchema = z.object({ oneVotePerUnit: z.boolean(), anonymous: z.boolean(), passThresholdPercent: z.coerce.number().min(0).max(100), quorumPercent: z.coerce.number().min(0).max(100) }).partial();

// ------------------------------------------------------------------ committee
export const committeeMemberSchema = z.object({
  userId: objectIdSchema.nullable().optional(),
  residentId: objectIdSchema.nullable().optional(),
  unitId: objectIdSchema.nullable().optional(),
  name: z.string().trim().min(2).max(120),
  positionKey: z.string().trim().min(1).max(40),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  showContactToMembers: z.boolean().default(false),
  termStart: z.coerce.date().nullable().optional(),
  termEnd: z.coerce.date().nullable().optional(),
  status: z.enum(CommitteeMemberStatuses).default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  notes: z.string().trim().max(500).optional(),
});
export const committeeMemberUpdateSchema = committeeMemberSchema.partial();
export const handoverStartSchema = z.object({ note: z.string().trim().max(1000).optional(), checklist: z.array(z.string().trim().min(1).max(200)).max(30).optional() });
export const handoverChecklistSchema = z.object({ key: z.string().trim().min(1).max(60), done: z.boolean() });
export const handoverCompleteSchema = z.object({ termStart: z.coerce.date().optional(), termEnd: z.coerce.date().nullable().optional(), note: z.string().trim().max(1000).optional() });
