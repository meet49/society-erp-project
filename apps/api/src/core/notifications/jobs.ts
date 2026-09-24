import { jobQueue } from '../jobs/queue';
import { JobNames, registerJobHandlers } from '../jobs/scheduler';
import { notificationService } from './notification.service';

registerJobHandlers(() => {
  jobQueue.register<{ notificationId: string; channel: 'EMAIL' | 'WHATSAPP' | 'PUSH' | 'IN_APP' }>(JobNames.NOTIFICATION_DELIVER, async (data) => {
    await notificationService.deliver(data.notificationId, data.channel);
  });
  jobQueue.register<{ to: string; templateKey: string; vars: Record<string, unknown>; societyId?: string | null; fallbackSubject?: string; fallbackBody?: string }>(
    JobNames.EMAIL_SEND,
    async (data) => {
      await notificationService.deliverTransactionalEmail(data);
    },
  );
});
