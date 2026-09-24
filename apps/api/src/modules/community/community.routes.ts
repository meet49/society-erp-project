import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { toCsv } from '../../lib/csv';
import { logger } from '../../lib/logger';
import { auditService } from '../../core/audit/audit.service';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { noticeService } from './notices.service';
import { communityService } from './posts.service';
import { eventService } from './events.service';
import { pollService } from './polls.service';
import { surveyService } from './surveys.service';
import { audiencePreviewSchema, cancelEventSchema, commentSchema, communityConfigSchema, eventCreateSchema, eventListQuerySchema, eventUpdateSchema, eventsConfigSchema, moderateSchema, noticeCreateSchema, noticeListQuerySchema, noticeUpdateSchema, noticesConfigSchema, openSchema, pollCreateSchema, pollListQuerySchema, pollUpdateSchema, postCreateSchema, postListQuerySchema, publishSchema, reportSchema, respondSchema, rsvpSchema, surveyCreateSchema, surveyListQuerySchema, surveyUpdateSchema, voteSchema } from './community.schemas';
import './community.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const perms = (req: any) => req.tenant!.permissions as Set<string>;
const member = (req: any) => ({ userId: uid(req), unitIds: (req.tenant!.unitIds ?? []) as string[], roleKeys: (req.tenant!.roleKeys ?? []) as string[] });
const hasAny = (req: any, ...keys: string[]) => keys.some((k) => perms(req).has(k));

// ------------------------------------------------------------------ notices
const noticeActor = (req: any) => ({ ...member(req), ownScope: !hasAny(req, 'notices:create', 'notices:publish', 'notices:update') });
export const noticesRouter = Router();
noticesRouter.use(authenticate, requireSociety, requireModule('notices'), requireSubscription());
noticesRouter.get('/settings', authorizePermission('notices:create', 'notices:publish', 'notices:update'), asyncHandler(async (req, res) => ok(res, await noticeService.getConfig(sid(req)))));
noticesRouter.put('/settings', authorizePermission('notices:update', 'notices:publish'), validate(noticesConfigSchema), asyncHandler(async (req, res) => ok(res, await noticeService.updateConfig(sid(req), req.body, uid(req), req))));
noticesRouter.get('/categories', authorizePermission('notices:view'), asyncHandler(async (req, res) => ok(res, await noticeService.categories(sid(req)))));
noticesRouter.get('/stats', authorizePermission('notices:create', 'notices:publish', 'notices:update'), asyncHandler(async (req, res) => ok(res, await noticeService.stats(sid(req)))));
noticesRouter.post('/audience/preview', authorizePermission('notices:create', 'notices:publish', 'communication:announce', 'events:create', 'polls:create', 'surveys:create'), validate(audiencePreviewSchema), asyncHandler(async (req, res) => ok(res, await noticeService.previewAudience(sid(req), req.body.audience))));
noticesRouter.get('/', authorizePermission('notices:view'), validate(noticeListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await noticeService.list(sid(req), req.query as any, noticeActor(req)))));
noticesRouter.post('/', authorizePermission('notices:create'), validate(noticeCreateSchema), asyncHandler(async (req, res) => { if (req.body.publishNow && !perms(req).has('notices:publish')) req.body.publishNow = false; created(res, await noticeService.create(sid(req), req.body, uid(req), req)); }));
noticesRouter.get('/:id', authorizePermission('notices:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await noticeService.get(sid(req), req.params.id, noticeActor(req)))));
noticesRouter.patch('/:id', authorizePermission('notices:update'), validate(idParamSchema, 'params'), validate(noticeUpdateSchema), asyncHandler(async (req, res) => ok(res, await noticeService.update(sid(req), req.params.id, req.body, uid(req), req))));
noticesRouter.delete('/:id', authorizePermission('notices:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await noticeService.remove(sid(req), req.params.id, req); noContent(res); }));
noticesRouter.post('/:id/publish', authorizePermission('notices:publish'), validate(idParamSchema, 'params'), validate(publishSchema), asyncHandler(async (req, res) => ok(res, await noticeService.publish(sid(req), req.params.id, req.body, uid(req), req))));
noticesRouter.post('/:id/archive', authorizePermission('notices:publish'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await noticeService.archive(sid(req), req.params.id, uid(req), req))));
noticesRouter.post('/:id/acknowledge', authorizePermission('notices:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await noticeService.acknowledge(sid(req), req.params.id, noticeActor(req)))));
noticesRouter.get('/:id/readers', authorizePermission('notices:create', 'notices:publish', 'notices:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await noticeService.readers(sid(req), req.params.id))));

// ------------------------------------------------------------------ community feed
const communityActor = (req: any) => ({ ...member(req), isModerator: perms(req).has('communication:moderate'), canAnnounce: perms(req).has('communication:announce'), canCreate: perms(req).has('communication:create') });
export const communityRouter = Router();
communityRouter.use(authenticate, requireSociety, requireModule('communication'), requireSubscription());
communityRouter.get('/settings', authorizePermission('communication:view'), asyncHandler(async (req, res) => ok(res, await communityService.getConfig(sid(req)))));
communityRouter.put('/settings', authorizePermission('communication:moderate'), validate(communityConfigSchema), asyncHandler(async (req, res) => ok(res, await communityService.updateConfig(sid(req), req.body, uid(req), req))));
communityRouter.get('/stats', authorizePermission('communication:moderate', 'communication:announce'), asyncHandler(async (req, res) => ok(res, await communityService.stats(sid(req)))));
communityRouter.get('/posts', authorizePermission('communication:view'), validate(postListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await communityService.feed(sid(req), req.query as any, communityActor(req)))));
communityRouter.post('/posts', authorizePermission('communication:create', 'communication:announce'), validate(postCreateSchema), asyncHandler(async (req, res) => created(res, await communityService.create(sid(req), req.body, communityActor(req), req))));
communityRouter.get('/posts/:id', authorizePermission('communication:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await communityService.get(sid(req), req.params.id, communityActor(req)))));
communityRouter.delete('/posts/:id', authorizePermission('communication:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await communityService.remove(sid(req), req.params.id, communityActor(req), req); noContent(res); }));
communityRouter.post('/posts/:id/comments', authorizePermission('communication:view'), validate(idParamSchema, 'params'), validate(commentSchema), asyncHandler(async (req, res) => created(res, await communityService.comment(sid(req), req.params.id, req.body.body, communityActor(req), req))));
communityRouter.delete('/posts/:id/comments/:commentId', authorizePermission('communication:view'), validate(idParamSchema.extend({ commentId: idParamSchema.shape.id }), 'params'), asyncHandler(async (req, res) => ok(res, await communityService.removeComment(sid(req), req.params.id, req.params.commentId, communityActor(req)))));
communityRouter.post('/posts/:id/like', authorizePermission('communication:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await communityService.toggleLike(sid(req), req.params.id, communityActor(req)))));
communityRouter.post('/posts/:id/report', authorizePermission('communication:view'), validate(idParamSchema, 'params'), validate(reportSchema), asyncHandler(async (req, res) => ok(res, await communityService.report(sid(req), req.params.id, req.body.reason, communityActor(req)))));
communityRouter.post('/posts/:id/moderate', authorizePermission('communication:moderate'), validate(idParamSchema, 'params'), validate(moderateSchema), asyncHandler(async (req, res) => ok(res, await communityService.moderate(sid(req), req.params.id, req.body, uid(req), req))));

// ------------------------------------------------------------------ events
const eventActor = (req: any) => ({ ...member(req), ownScope: !hasAny(req, 'events:create', 'events:update') });
export const eventsRouter = Router();
eventsRouter.use(authenticate, requireSociety, requireModule('events'), requireSubscription());
eventsRouter.get('/settings', authorizePermission('events:create', 'events:update'), asyncHandler(async (req, res) => ok(res, await eventService.getConfig(sid(req)))));
eventsRouter.put('/settings', authorizePermission('events:update'), validate(eventsConfigSchema), asyncHandler(async (req, res) => ok(res, await eventService.updateConfig(sid(req), req.body, uid(req), req))));
eventsRouter.get('/types', authorizePermission('events:view'), asyncHandler(async (req, res) => ok(res, await eventService.types(sid(req)))));
eventsRouter.get('/stats', authorizePermission('events:create', 'events:update'), asyncHandler(async (req, res) => ok(res, await eventService.stats(sid(req)))));
eventsRouter.get('/', authorizePermission('events:view'), validate(eventListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await eventService.list(sid(req), req.query as any, eventActor(req)))));
eventsRouter.post('/', authorizePermission('events:create'), validate(eventCreateSchema), asyncHandler(async (req, res) => created(res, await eventService.create(sid(req), req.body, uid(req), req))));
eventsRouter.get('/:id', authorizePermission('events:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await eventService.get(sid(req), req.params.id, eventActor(req)))));
eventsRouter.patch('/:id', authorizePermission('events:update'), validate(idParamSchema, 'params'), validate(eventUpdateSchema), asyncHandler(async (req, res) => ok(res, await eventService.update(sid(req), req.params.id, req.body, uid(req), req))));
eventsRouter.delete('/:id', authorizePermission('events:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await eventService.remove(sid(req), req.params.id, req); noContent(res); }));
eventsRouter.post('/:id/publish', authorizePermission('events:create', 'events:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await eventService.publish(sid(req), req.params.id, uid(req), req))));
eventsRouter.post('/:id/cancel', authorizePermission('events:update'), validate(idParamSchema, 'params'), validate(cancelEventSchema), asyncHandler(async (req, res) => ok(res, await eventService.cancel(sid(req), req.params.id, req.body.reason, uid(req), req))));
eventsRouter.post('/:id/rsvp', authorizePermission('events:rsvp'), validate(idParamSchema, 'params'), validate(rsvpSchema), asyncHandler(async (req, res) => ok(res, await eventService.rsvp(sid(req), req.params.id, req.body, eventActor(req)))));
eventsRouter.get('/:id/attendees', authorizePermission('events:create', 'events:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await eventService.attendees(sid(req), req.params.id))));
eventsRouter.get('/:id/attendees/export', authorizePermission('events:export'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { const rows = await eventService.exportRows(sid(req), req.params.id); auditService.record({ action: 'event.attendees_exported', resource: 'Event', resourceId: req.params.id, societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="attendees.csv"'); res.send(toCsv(rows)); }));

// ------------------------------------------------------------------ polls
const pollActor = (req: any) => ({ ...member(req), ownScope: !hasAny(req, 'polls:create', 'polls:update'), canSeeResults: perms(req).has('polls:results') });
export const pollsRouter = Router();
pollsRouter.use(authenticate, requireSociety, requireModule('polls'), requireSubscription());
pollsRouter.get('/', authorizePermission('polls:view'), validate(pollListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await pollService.list(sid(req), req.query as any, pollActor(req)))));
pollsRouter.post('/', authorizePermission('polls:create'), validate(pollCreateSchema), asyncHandler(async (req, res) => created(res, await pollService.create(sid(req), req.body, uid(req), req))));
pollsRouter.get('/:id', authorizePermission('polls:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await pollService.get(sid(req), req.params.id, pollActor(req)))));
pollsRouter.patch('/:id', authorizePermission('polls:update'), validate(idParamSchema, 'params'), validate(pollUpdateSchema), asyncHandler(async (req, res) => ok(res, await pollService.update(sid(req), req.params.id, req.body, uid(req), req))));
pollsRouter.delete('/:id', authorizePermission('polls:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await pollService.remove(sid(req), req.params.id, req); noContent(res); }));
pollsRouter.post('/:id/open', authorizePermission('polls:create', 'polls:update'), validate(idParamSchema, 'params'), validate(openSchema), asyncHandler(async (req, res) => ok(res, await pollService.open(sid(req), req.params.id, req.body, uid(req), req))));
pollsRouter.post('/:id/close', authorizePermission('polls:create', 'polls:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await pollService.close(sid(req), req.params.id, uid(req), req))));
pollsRouter.post('/:id/vote', authorizePermission('polls:vote'), validate(idParamSchema, 'params'), validate(voteSchema), asyncHandler(async (req, res) => ok(res, await pollService.vote(sid(req), req.params.id, req.body.optionKeys, pollActor(req)))));
pollsRouter.get('/:id/results', authorizePermission('polls:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await pollService.results(sid(req), req.params.id, pollActor(req)))));

// ------------------------------------------------------------------ surveys
const surveyActor = (req: any) => ({ ...member(req), ownScope: !hasAny(req, 'surveys:create', 'surveys:update'), canSeeResults: perms(req).has('surveys:results') });
export const surveysRouter = Router();
surveysRouter.use(authenticate, requireSociety, requireModule('surveys'), requireSubscription());
surveysRouter.get('/', authorizePermission('surveys:view'), validate(surveyListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await surveyService.list(sid(req), req.query as any, surveyActor(req)))));
surveysRouter.post('/', authorizePermission('surveys:create'), validate(surveyCreateSchema), asyncHandler(async (req, res) => created(res, await surveyService.create(sid(req), req.body, uid(req), req))));
surveysRouter.get('/:id', authorizePermission('surveys:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await surveyService.get(sid(req), req.params.id, surveyActor(req)))));
surveysRouter.patch('/:id', authorizePermission('surveys:update'), validate(idParamSchema, 'params'), validate(surveyUpdateSchema), asyncHandler(async (req, res) => ok(res, await surveyService.update(sid(req), req.params.id, req.body, uid(req), req))));
surveysRouter.delete('/:id', authorizePermission('surveys:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await surveyService.remove(sid(req), req.params.id, req); noContent(res); }));
surveysRouter.post('/:id/open', authorizePermission('surveys:create', 'surveys:update'), validate(idParamSchema, 'params'), validate(openSchema), asyncHandler(async (req, res) => ok(res, await surveyService.open(sid(req), req.params.id, req.body, uid(req), req))));
surveysRouter.post('/:id/close', authorizePermission('surveys:create', 'surveys:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await surveyService.close(sid(req), req.params.id, uid(req), req))));
surveysRouter.post('/:id/respond', authorizePermission('surveys:respond'), validate(idParamSchema, 'params'), validate(respondSchema), asyncHandler(async (req, res) => ok(res, await surveyService.respond(sid(req), req.params.id, req.body.answers, surveyActor(req)))));
surveysRouter.get('/:id/results', authorizePermission('surveys:results'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await surveyService.results(sid(req), req.params.id, surveyActor(req)))));
surveysRouter.get('/:id/export', authorizePermission('surveys:export', 'surveys:results'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { const rows = await surveyService.exportRows(sid(req), req.params.id, { ...surveyActor(req), canSeeResults: true }); auditService.record({ action: 'survey.exported', resource: 'Survey', resourceId: req.params.id, societyId: sid(req), metadata: { count: rows.length }, req }); res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="survey-responses.csv"'); res.send(toCsv(rows)); }));

// ------------------------------------------------------------------ sweep job: scheduled notices, ended polls / surveys, past events
registerJobHandlers(() => {
  jobQueue.register(JobNames.COMMUNITY_SWEEP, async () => {
    const [notices, events, polls, surveys] = await Promise.all([noticeService.publishScheduled(), eventService.complete(), pollService.closeEnded(), surveyService.closeEnded()]);
    if (notices || events || polls || surveys) logger.info({ notices, events, polls, surveys }, 'Community sweep');
  });
});
