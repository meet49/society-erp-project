import { Router } from 'express';
import { idParamSchema } from '@society-erp/shared';
import { asyncHandler, authenticate, authorizePermission, requireModule, requireSociety, requireSubscription, validate } from '../../middleware';
import { ok, created, paged, noContent } from '../../lib/response';
import { meetingService } from './meetings.service';
import { votingService } from './voting.service';
import { committeeService } from './committee.service';
import { attendanceSchema, ballotSchema, cancelMeetingSchema, committeeMemberSchema, committeeMemberUpdateSchema, handoverChecklistSchema, handoverCompleteSchema, handoverStartSchema, meetingCreateSchema, meetingListQuerySchema, meetingUpdateSchema, meetingsConfigSchema, minutesSchema, openResolutionVoteSchema, openVotingSchema, rsvpSchema, votingConfigSchema, votingCreateSchema, votingListQuerySchema, votingUpdateSchema } from './governance.schemas';
import './governance.events';

const sid = (req: any) => req.tenant!.societyId as string;
const uid = (req: any) => req.auth!.userId as string;
const perms = (req: any) => req.tenant!.permissions as Set<string>;
const member = (req: any) => ({ userId: uid(req), unitIds: (req.tenant!.unitIds ?? []) as string[], roleKeys: (req.tenant!.roleKeys ?? []) as string[] });
const hasAny = (req: any, ...keys: string[]) => keys.some((k) => perms(req).has(k));

// ------------------------------------------------------------------ meetings
const meetingActor = (req: any) => ({ ...member(req), ownScope: !hasAny(req, 'meetings:create', 'meetings:update', 'meetings:minutes') });
export const meetingsRouter = Router();
meetingsRouter.use(authenticate, requireSociety, requireModule('meetings'), requireSubscription());
meetingsRouter.get('/settings', authorizePermission('meetings:create', 'meetings:update', 'meetings:minutes'), asyncHandler(async (req, res) => ok(res, await meetingService.getConfig(sid(req)))));
meetingsRouter.put('/settings', authorizePermission('meetings:update'), validate(meetingsConfigSchema), asyncHandler(async (req, res) => ok(res, await meetingService.updateConfig(sid(req), req.body, uid(req), req))));
meetingsRouter.get('/stats', authorizePermission('meetings:create', 'meetings:update', 'meetings:minutes'), asyncHandler(async (req, res) => ok(res, await meetingService.stats(sid(req)))));
meetingsRouter.get('/', authorizePermission('meetings:view'), validate(meetingListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await meetingService.list(sid(req), req.query as any, meetingActor(req)))));
meetingsRouter.post('/', authorizePermission('meetings:create'), validate(meetingCreateSchema), asyncHandler(async (req, res) => created(res, await meetingService.create(sid(req), req.body, uid(req), req))));
meetingsRouter.get('/:id', authorizePermission('meetings:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await meetingService.get(sid(req), req.params.id, meetingActor(req)))));
meetingsRouter.get('/:id/ics', authorizePermission('meetings:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { const ics = await meetingService.ics(sid(req), req.params.id, meetingActor(req)); res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="meeting.ics"'); res.send(ics); }));
meetingsRouter.patch('/:id', authorizePermission('meetings:update'), validate(idParamSchema, 'params'), validate(meetingUpdateSchema), asyncHandler(async (req, res) => ok(res, await meetingService.update(sid(req), req.params.id, req.body, uid(req), req))));
meetingsRouter.delete('/:id', authorizePermission('meetings:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await meetingService.remove(sid(req), req.params.id, req); noContent(res); }));
meetingsRouter.post('/:id/rsvp', authorizePermission('meetings:view'), validate(idParamSchema, 'params'), validate(rsvpSchema), asyncHandler(async (req, res) => ok(res, await meetingService.rsvp(sid(req), req.params.id, req.body.rsvp, meetingActor(req)))));
meetingsRouter.post('/:id/start', authorizePermission('meetings:update', 'meetings:minutes'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await meetingService.start(sid(req), req.params.id, uid(req), req))));
meetingsRouter.post('/:id/attendance', authorizePermission('meetings:minutes', 'meetings:update'), validate(idParamSchema, 'params'), validate(attendanceSchema), asyncHandler(async (req, res) => ok(res, await meetingService.markAttendance(sid(req), req.params.id, req.body.attendees, uid(req), req))));
meetingsRouter.post('/:id/minutes', authorizePermission('meetings:minutes'), validate(idParamSchema, 'params'), validate(minutesSchema), asyncHandler(async (req, res) => ok(res, await meetingService.recordMinutes(sid(req), req.params.id, req.body, uid(req), req))));
meetingsRouter.post('/:id/minutes/publish', authorizePermission('meetings:minutes'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await meetingService.publishMinutes(sid(req), req.params.id, uid(req), req))));
meetingsRouter.post('/:id/cancel', authorizePermission('meetings:update'), validate(idParamSchema, 'params'), validate(cancelMeetingSchema), asyncHandler(async (req, res) => ok(res, await meetingService.cancel(sid(req), req.params.id, req.body.reason, uid(req), req))));
meetingsRouter.post('/:id/resolutions/vote', authorizePermission('meetings:minutes', 'meetings:update'), validate(idParamSchema, 'params'), validate(openResolutionVoteSchema), asyncHandler(async (req, res) => created(res, await meetingService.openResolutionVote(sid(req), req.params.id, req.body, uid(req), req))));

// ------------------------------------------------------------------ voting
const votingActor = (req: any) => ({ ...member(req), ownScope: !hasAny(req, 'voting:create', 'voting:update', 'voting:close'), canSeeResults: perms(req).has('voting:results') });
export const votingRouter = Router();
votingRouter.use(authenticate, requireSociety, requireModule('voting'), requireSubscription());
votingRouter.get('/settings', authorizePermission('voting:create', 'voting:close'), asyncHandler(async (req, res) => ok(res, await votingService.getConfig(sid(req)))));
votingRouter.put('/settings', authorizePermission('voting:close', 'voting:create'), validate(votingConfigSchema), asyncHandler(async (req, res) => ok(res, await votingService.updateConfig(sid(req), req.body, uid(req), req))));
votingRouter.get('/', authorizePermission('voting:view'), validate(votingListQuerySchema, 'query'), asyncHandler(async (req, res) => paged(res, await votingService.list(sid(req), req.query as any, votingActor(req)))));
votingRouter.post('/', authorizePermission('voting:create'), validate(votingCreateSchema), asyncHandler(async (req, res) => created(res, await votingService.create(sid(req), req.body, uid(req), req))));
votingRouter.get('/:id', authorizePermission('voting:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await votingService.get(sid(req), req.params.id, votingActor(req)))));
votingRouter.patch('/:id', authorizePermission('voting:update'), validate(idParamSchema, 'params'), validate(votingUpdateSchema), asyncHandler(async (req, res) => ok(res, await votingService.update(sid(req), req.params.id, req.body, uid(req), req))));
votingRouter.delete('/:id', authorizePermission('voting:delete'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await votingService.remove(sid(req), req.params.id, req); noContent(res); }));
votingRouter.post('/:id/open', authorizePermission('voting:close', 'voting:create'), validate(idParamSchema, 'params'), validate(openVotingSchema), asyncHandler(async (req, res) => ok(res, await votingService.open(sid(req), req.params.id, req.body, uid(req), req))));
votingRouter.post('/:id/close', authorizePermission('voting:close'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await votingService.close(sid(req), req.params.id, uid(req), req))));
votingRouter.post('/:id/cancel', authorizePermission('voting:close', 'voting:update'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await votingService.cancel(sid(req), req.params.id, uid(req), req))));
votingRouter.post('/:id/vote', authorizePermission('voting:vote'), validate(idParamSchema, 'params'), validate(ballotSchema), asyncHandler(async (req, res) => ok(res, await votingService.vote(sid(req), req.params.id, req.body.choices, votingActor(req)))));
votingRouter.get('/:id/results', authorizePermission('voting:view'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => ok(res, await votingService.results(sid(req), req.params.id, votingActor(req)))));

// ------------------------------------------------------------------ committee & handover
export const committeeRouter = Router();
committeeRouter.use(authenticate, requireSociety, requireModule('governance'), requireSubscription());
committeeRouter.get('/', authorizePermission('governance:view', 'governance:manage', 'meetings:view'), asyncHandler(async (req, res) => ok(res, await committeeService.list(sid(req), { status: req.query.status as string | undefined, forMembers: !hasAny(req, 'governance:view', 'governance:manage') }))));
committeeRouter.get('/positions', authorizePermission('governance:view', 'governance:manage', 'meetings:view'), asyncHandler(async (req, res) => ok(res, await committeeService.positions(sid(req)))));
committeeRouter.get('/overview', authorizePermission('governance:view', 'governance:manage', 'meetings:view'), asyncHandler(async (req, res) => ok(res, await committeeService.overview(sid(req), !hasAny(req, 'governance:view', 'governance:manage')))));
committeeRouter.post('/', authorizePermission('governance:manage'), validate(committeeMemberSchema), asyncHandler(async (req, res) => created(res, await committeeService.add(sid(req), req.body, uid(req), req))));
committeeRouter.patch('/:id', authorizePermission('governance:manage'), validate(idParamSchema, 'params'), validate(committeeMemberUpdateSchema), asyncHandler(async (req, res) => ok(res, await committeeService.update(sid(req), req.params.id, req.body, req))));
committeeRouter.delete('/:id', authorizePermission('governance:manage'), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => { await committeeService.remove(sid(req), req.params.id, req); noContent(res); }));
committeeRouter.post('/handover/start', authorizePermission('governance:manage'), validate(handoverStartSchema), asyncHandler(async (req, res) => ok(res, await committeeService.startHandover(sid(req), req.body, uid(req), req))));
committeeRouter.post('/handover/checklist', authorizePermission('governance:manage'), validate(handoverChecklistSchema), asyncHandler(async (req, res) => ok(res, await committeeService.tickHandover(sid(req), req.body.key, req.body.done, uid(req), req))));
committeeRouter.post('/handover/complete', authorizePermission('governance:manage'), validate(handoverCompleteSchema), asyncHandler(async (req, res) => ok(res, await committeeService.completeHandover(sid(req), req.body, uid(req), req))));
