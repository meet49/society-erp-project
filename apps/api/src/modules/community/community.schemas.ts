import { z } from 'zod';
import { booleanQuerySchema, paginationQuerySchema } from '@society-erp/shared';
import { audienceSchema } from '../../core/audience/audience.service';
import { NoticePriorities, NoticeStatuses } from '../../models/notice.model';
import { EventStatuses, RsvpStatuses } from '../../models/event.model';
import { PollStatuses } from '../../models/poll.model';
import { SurveyQuestionTypes, SurveyStatuses } from '../../models/survey.model';

const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });
const channels = z.array(z.enum(['IN_APP', 'EMAIL', 'WHATSAPP', 'PUSH'])).min(1).max(4);

// ------------------------------------------------------------------ notices
export const noticeCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(20000),
  categoryKey: z.string().trim().min(1).max(40).default('GENERAL'),
  priority: z.enum(NoticePriorities).default('NORMAL'),
  audience: audienceSchema.default({ type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] }),
  attachments: z.array(attachment).max(10).default([]),
  isPinned: z.boolean().default(false),
  requiresAcknowledgement: z.boolean().default(false),
  channels: channels.optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  /** publish immediately, or at a future time (scheduled) */
  publishNow: z.boolean().default(false),
  publishAt: z.coerce.date().nullable().optional(),
});
export const noticeUpdateSchema = noticeCreateSchema.omit({ publishNow: true }).partial();
export const noticeListQuerySchema = paginationQuerySchema.extend({ status: z.enum(NoticeStatuses).optional(), categoryKey: z.string().max(40).optional(), pinnedOnly: booleanQuerySchema, unreadOnly: booleanQuerySchema, includeExpired: booleanQuerySchema });
export const publishSchema = z.object({ publishAt: z.coerce.date().nullable().optional() });
export const noticesConfigSchema = z.object({ defaultChannels: channels, defaultExpiryDays: z.coerce.number().int().min(0).max(365), memberCanSeeArchived: z.boolean() }).partial();
export const audiencePreviewSchema = z.object({ audience: audienceSchema });

// ------------------------------------------------------------------ community
export const postCreateSchema = z.object({
  kind: z.enum(['POST', 'ANNOUNCEMENT']).default('POST'),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(5000),
  attachments: z.array(attachment).max(6).default([]),
  audience: audienceSchema.optional(),
  isPinned: z.boolean().optional(),
});
export const postListQuerySchema = paginationQuerySchema.extend({ kind: z.enum(['POST', 'ANNOUNCEMENT']).optional(), status: z.enum(['ACTIVE', 'PENDING', 'HIDDEN']).optional(), reportedOnly: booleanQuerySchema, mine: booleanQuerySchema });
export const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const reportSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const moderateSchema = z.object({ action: z.enum(['HIDE', 'UNHIDE', 'APPROVE', 'PIN', 'UNPIN', 'CLEAR_REPORTS', 'DELETE']), note: z.string().trim().max(300).optional() });
export const communityConfigSchema = z.object({ memberPostsEnabled: z.boolean(), moderateMemberPosts: z.boolean(), allowComments: z.boolean(), allowReports: z.boolean() }).partial();

// ------------------------------------------------------------------ events
export const eventCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).optional(),
  typeKey: z.string().trim().min(1).max(40).default('COMMUNITY'),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  venue: z.string().trim().max(200).optional(),
  audience: audienceSchema.optional(),
  coverImage: attachment.nullable().optional(),
  attachments: z.array(attachment).max(6).optional(),
  capacity: z.coerce.number().int().min(0).max(100000).default(0),
  maxGuestsPerRsvp: z.coerce.number().int().min(0).max(50).default(0),
  rsvpDeadline: z.coerce.date().nullable().optional(),
  allowRsvp: z.boolean().default(true),
  publishNow: z.boolean().default(false),
}).refine((v) => v.endAt > v.startAt, { message: 'End time must be after the start time', path: ['endAt'] });
export const eventUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  typeKey: z.string().trim().min(1).max(40).optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  venue: z.string().trim().max(200).optional(),
  audience: audienceSchema.optional(),
  coverImage: attachment.nullable().optional(),
  attachments: z.array(attachment).max(6).optional(),
  capacity: z.coerce.number().int().min(0).max(100000).optional(),
  maxGuestsPerRsvp: z.coerce.number().int().min(0).max(50).optional(),
  rsvpDeadline: z.coerce.date().nullable().optional(),
  allowRsvp: z.boolean().optional(),
});
export const eventListQuerySchema = paginationQuerySchema.extend({ status: z.enum(EventStatuses).optional(), upcoming: booleanQuerySchema, typeKey: z.string().max(40).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const rsvpSchema = z.object({ status: z.enum(RsvpStatuses), guests: z.coerce.number().int().min(0).max(50).default(0), note: z.string().trim().max(300).optional() });
export const cancelEventSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const eventsConfigSchema = z.object({ memberCanSeeAttendees: z.boolean(), reminderHours: z.coerce.number().int().min(1).max(168) }).partial();

// ------------------------------------------------------------------ polls
export const pollCreateSchema = z.object({
  question: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).optional(),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(12),
  audience: audienceSchema.optional(),
  anonymous: z.boolean().default(true),
  oneVotePerUnit: z.boolean().default(false),
  allowMultiple: z.boolean().default(false),
  showLiveResults: z.boolean().default(true),
  endAt: z.coerce.date().nullable().optional(),
  openNow: z.boolean().default(false),
});
export const pollUpdateSchema = pollCreateSchema.omit({ openNow: true }).partial();
export const pollListQuerySchema = paginationQuerySchema.extend({ status: z.enum(PollStatuses).optional() });
export const voteSchema = z.object({ optionKeys: z.array(z.string().trim().min(1).max(40)).min(1).max(12) });
export const openSchema = z.object({ endAt: z.coerce.date().nullable().optional() });

// ------------------------------------------------------------------ surveys
const questionSchema = z.object({
  key: z.string().trim().min(1).max(40).optional(),
  type: z.enum(SurveyQuestionTypes),
  label: z.string().trim().min(2).max(300),
  help: z.string().trim().max(300).optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  required: z.boolean().default(true),
  max: z.coerce.number().int().min(2).max(10).default(5),
}).refine((q) => !['SINGLE', 'MULTIPLE'].includes(q.type) || q.options.length >= 2, { message: 'Choice questions need at least two options', path: ['options'] });
export const surveyCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(3000).optional(),
  questions: z.array(questionSchema).min(1).max(40),
  audience: audienceSchema.optional(),
  anonymous: z.boolean().default(false),
  endAt: z.coerce.date().nullable().optional(),
  openNow: z.boolean().default(false),
});
export const surveyUpdateSchema = surveyCreateSchema.omit({ openNow: true }).partial();
export const surveyListQuerySchema = paginationQuerySchema.extend({ status: z.enum(SurveyStatuses).optional() });
export const respondSchema = z.object({ answers: z.array(z.object({ questionKey: z.string().trim().min(1).max(40), value: z.unknown() })).max(40) });
