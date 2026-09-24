import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { Document } from '../../models/document.model';
import { documentService } from './documents.service';

domainEvents.on('workflow.completed', async ({ payload, societyId, actorId }) => {
  if (!societyId || payload.entityType !== 'Document') return;
  await documentService.applyWorkflowOutcome(societyId, payload.entityId, payload.status as 'APPROVED' | 'REJECTED', actorId ?? null, payload.note);
});

domainEvents.on('workflow.step_pending', async ({ payload, societyId, actorId }) => {
  if (!societyId || payload.entityType !== 'Document') return;
  const ctx = payload.context ?? {};
  const recipients = payload.approverType === 'PERMISSION' ? { permission: payload.approverRef as string, excludeUserIds: actorId ? [actorId] : [] } : { userIds: ((payload.userIds as string[]) ?? []).filter((u) => u !== actorId) };
  await notificationService.notify({ societyId, recipients, type: 'document.review_requested', vars: { title: ctx.title ?? '', name: ctx.name ?? '' }, data: { instanceId: payload.instanceId, documentId: payload.entityId, entityType: 'Document', entityId: payload.entityId }, link: `/app/documents?document=${payload.entityId}`, priority: 'HIGH', socketEvent: 'approval.pending' });
  realtime.toSociety(societyId, 'approvals.changed', { instanceId: payload.instanceId });
});

domainEvents.on('document.reviewed', async ({ payload, societyId }) => {
  if (!societyId) return;
  if (payload.uploadedBy) await notificationService.notify({ societyId, recipients: [payload.uploadedBy], type: 'document.reviewed', vars: { title: payload.title, status: payload.status === 'ACTIVE' ? 'approved' : 'rejected', note: payload.note ?? '' }, data: { documentId: payload.documentId }, link: `/app/documents?document=${payload.documentId}`, channels: ['IN_APP', 'PUSH'] });
  realtime.toSociety(societyId, 'documents.changed', { documentId: payload.documentId });
});

domainEvents.on('document.uploaded', ({ payload, societyId }) => {
  if (societyId) realtime.toSociety(societyId, 'documents.changed', { documentId: payload.documentId });
});

/** Expiry reminders (insurance, AMC papers, licences…) go to whoever manages documents, once per document per window. */
registerJobHandlers(() => {
  jobQueue.register(JobNames.DOCUMENT_EXPIRY, async () => {
    const societies = await Document.distinct('societyId', { status: 'ACTIVE', expiresAt: { $ne: null } });
    let sent = 0;
    for (const sid of societies) {
      const societyId = String(sid);
      const cfg = await documentService.getConfig(societyId);
      if (!cfg.expiryReminderDays) continue;
      const docs = await Document.find({ societyId, status: 'ACTIVE', expiresAt: { $gt: new Date(), $lte: dayjs().add(cfg.expiryReminderDays, 'day').toDate() }, 'tags': { $ne: '__expiry-reminded' } });
      for (const d of docs) {
        await notificationService.notify({ societyId, recipients: { permission: 'documents:update' }, type: 'document.expiring', vars: { title: d.title, expiresAt: dayjs(d.expiresAt).format('DD MMM YYYY'), daysRemaining: dayjs(d.expiresAt).diff(dayjs(), 'day') }, data: { documentId: String(d._id) }, link: `/app/documents?document=${d._id}`, priority: 'HIGH' });
        await Document.updateOne({ _id: d._id }, { $addToSet: { tags: '__expiry-reminded' } });
        sent += 1;
      }
    }
    if (sent) logger.info({ sent }, 'Document expiry reminders');
  });
});
