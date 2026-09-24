import dayjs from 'dayjs';
import './jobs';
import { domainEvents } from '../events/event-bus';
import { notificationService } from './notification.service';
import { realtime } from '../realtime/socket';
import { Subscription } from '../../models/subscription.model';
import { Society } from '../../models/society.model';
import { configurationService } from '../configuration/configuration.service';

const fmtDate = (d?: Date | string | null) => (d ? dayjs(d).format('DD MMM YYYY') : '');

async function subscriptionVars(societyId: string) {
  const [society, sub] = await Promise.all([Society.findById(societyId).select('name').lean(), Subscription.findOne({ societyId }).lean()]);
  const plan = sub ? await configurationService.getPlanConfiguration(String(sub.planId)) : null;
  return { societyName: society?.name, planName: plan?.name, renewalDate: fmtDate(sub?.renewalDate), gracePeriodEndsAt: fmtDate(sub?.gracePeriodEndsAt), status: sub?.status };
}

// ---- auth
domainEvents.on('auth.password_reset_requested', async ({ payload }) => {
  await notificationService.sendTransactionalEmail({
    to: payload.email,
    templateKey: 'auth.password_reset',
    vars: { name: payload.name, resetUrl: payload.resetUrl, expiresInMinutes: payload.expiresInMinutes },
    fallbackSubject: 'Reset your password',
    fallbackBody: '<p>Reset your password: <a href="{{resetUrl}}">{{resetUrl}}</a></p>',
  });
});

domainEvents.on('user.invited', async ({ payload }) => {
  await notificationService.sendTransactionalEmail({
    to: payload.email,
    societyId: payload.societyId,
    templateKey: 'user.invited',
    vars: { name: payload.name, inviterName: payload.inviterName, societyName: payload.societyName, roles: payload.roles, inviteUrl: payload.inviteUrl, expiresAt: fmtDate(payload.expiresAt), message: payload.message },
    fallbackSubject: 'You have been invited',
    fallbackBody: '<p>Accept your invitation: <a href="{{inviteUrl}}">{{inviteUrl}}</a></p>',
  });
});

domainEvents.on('user.joined', async ({ payload, societyId }) => {
  const society = await Society.findById(societyId).select('name').lean();
  await notificationService.notify({
    societyId,
    recipients: { userIds: payload.invitedBy ? [payload.invitedBy] : [], permission: 'society:manage_users', excludeUserIds: [payload.userId] },
    type: 'user.joined',
    vars: { name: payload.name ?? 'A new user', societyName: society?.name },
    link: '/app/settings/users',
    channels: ['IN_APP'],
  });
});

// ---- society lifecycle
domainEvents.on('society.created', async ({ payload }) => {
  await notificationService.notify({
    societyId: null,
    recipients: { platformAdmins: true },
    type: 'society.created',
    vars: { societyName: payload.societyName, planName: payload.planName },
    link: `/admin/societies/${payload.societyId}`,
    channels: ['IN_APP', 'PUSH'],
  });
  realtime.toPlatform('society.created', { societyId: payload.societyId, name: payload.societyName });
  if (payload.adminEmail) {
    await notificationService.sendTransactionalEmail({
      to: payload.adminEmail,
      societyId: payload.societyId,
      templateKey: 'society.welcome',
      vars: { name: payload.adminName, societyName: payload.societyName, planName: payload.planName, trialEndDate: fmtDate(payload.trialEndDate) },
      fallbackSubject: 'Welcome to Society ERP',
      fallbackBody: '<p>Your society {{societyName}} is ready.</p>',
    });
  }
});

// ---- subscription lifecycle → society admins + platform
for (const event of ['subscription.expiring', 'subscription.expired', 'subscription.past_due', 'subscription.activated', 'subscription.reactivated', 'subscription.extended', 'subscription.plan_changed', 'subscription.suspended', 'subscription.cancelled']) {
  domainEvents.on(event, async ({ payload, societyId }) => {
    if (!societyId) return;
    const vars = { ...(await subscriptionVars(societyId)), daysRemaining: payload.daysRemaining };
    const templateKey = ['subscription.expiring', 'subscription.expired', 'subscription.past_due', 'subscription.activated'].includes(event) ? event : null;
    const labels: Record<string, string> = {
      'subscription.reactivated': 'Subscription reactivated',
      'subscription.extended': `Subscription extended by ${payload.days ?? ''} days`,
      'subscription.plan_changed': `Plan changed to ${payload.planName ?? vars.planName ?? ''}`,
      'subscription.suspended': 'Subscription suspended',
      'subscription.cancelled': 'Subscription cancelled',
    };
    await notificationService.notify({
      societyId,
      recipients: { permission: 'society:manage_subscription' },
      type: event,
      title: templateKey ? undefined : labels[event],
      body: templateKey ? undefined : `${vars.societyName ?? 'Your society'} is now ${vars.status ?? ''} on the ${vars.planName ?? ''} plan (renews ${vars.renewalDate}).`,
      vars,
      link: '/app/settings/subscription',
      priority: event === 'subscription.expired' || event === 'subscription.suspended' ? 'HIGH' : 'NORMAL',
      socketEvent: event,
    });
    realtime.toPlatform(event, { societyId, ...payload });
    if (event === 'subscription.expiring' || event === 'subscription.expired') {
      await notificationService.notify({ societyId: null, recipients: { platformAdmins: true }, type: event, vars, link: '/admin/subscriptions/expiry', channels: ['IN_APP'] });
    }
  });
}

// ---- leads & support
domainEvents.on('lead.created', async ({ payload }) => {
  await notificationService.notify({ societyId: null, recipients: { platformAdmins: true }, type: 'lead.created', vars: { name: payload.name, type: payload.type, societyName: payload.societyName ?? '-' }, link: `/admin/leads/${payload.leadId}`, channels: ['IN_APP', 'PUSH'] });
  realtime.toPlatform('lead.created', payload);
});

domainEvents.on('support.ticket.created', async ({ payload }) => {
  await notificationService.notify({ societyId: null, recipients: { platformAdmins: true }, type: 'support.ticket.created', vars: { ticketNumber: payload.ticketNumber, subject: payload.subject }, link: `/admin/support/${payload.ticketId}`, channels: ['IN_APP', 'PUSH'] });
  realtime.toPlatform('support.ticket.created', payload);
  if (payload.requesterUserId) {
    await notificationService.notify({ societyId: payload.societyId ?? null, recipients: [payload.requesterUserId], type: 'support.ticket.created', vars: { ticketNumber: payload.ticketNumber, subject: payload.subject }, link: payload.societyId ? '/app/support' : undefined, channels: ['IN_APP', 'EMAIL'] });
  } else if (payload.requesterEmail) {
    await notificationService.sendTransactionalEmail({ to: payload.requesterEmail, templateKey: 'support.ticket.created', vars: { ticketNumber: payload.ticketNumber, subject: payload.subject }, fallbackSubject: 'We received your request', fallbackBody: '<p>Your ticket {{ticketNumber}} has been created.</p>' });
  }
});

domainEvents.on('support.ticket.replied', async ({ payload }) => {
  realtime.toPlatform('support.ticket.updated', { ticketId: payload.ticketId });
  if (payload.toPlatform) {
    await notificationService.notify({ societyId: null, recipients: { platformAdmins: true }, type: 'support.ticket.replied', vars: { ticketNumber: payload.ticketNumber, subject: payload.subject, excerpt: payload.excerpt }, link: `/admin/support/${payload.ticketId}`, channels: ['IN_APP'] });
    return;
  }
  if (payload.requesterUserId) {
    await notificationService.notify({ societyId: payload.societyId ?? null, recipients: [payload.requesterUserId], type: 'support.ticket.replied', vars: { ticketNumber: payload.ticketNumber, subject: payload.subject, excerpt: payload.excerpt }, link: payload.societyId ? '/app/support' : undefined, channels: ['IN_APP', 'EMAIL'], socketEvent: 'support.ticket.updated' });
  } else if (payload.requesterEmail) {
    await notificationService.sendTransactionalEmail({ to: payload.requesterEmail, templateKey: 'support.ticket.replied', vars: { ticketNumber: payload.ticketNumber, subject: payload.subject, excerpt: payload.excerpt }, fallbackSubject: 'New reply on your ticket', fallbackBody: '<p>{{excerpt}}</p>' });
  }
});
