import dayjs from 'dayjs';
import { ErrorCodes, type Priority } from '@society-erp/shared';
import { SupportTicket } from '../../models/support-ticket.model';
import { User } from '../../models/user.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { sequenceService } from '../../core/sequence/sequence.service';
import { configurationService } from '../../core/configuration/configuration.service';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';

type Source = 'PROSPECT' | 'SOCIETY' | 'SOCIETY_ADMIN' | 'MEMBER';

class SupportService {
  private async dueAt(priority: Priority): Promise<Date> {
    const hours = await configurationService.getPlatformSetting<Record<string, number>>('support.slaHours', { LOW: 72, NORMAL: 48, HIGH: 24, CRITICAL: 4 });
    return dayjs().add(hours[priority] ?? 48, 'hour').toDate();
  }

  async create(input: { source: Source; societyId?: string | null; requesterUserId?: string | null; name: string; email: string; phone?: string; subject: string; message: string; priority?: Priority; category?: string }) {
    const ticketNumber = await sequenceService.next(null, 'support_ticket', { prefix: 'SUP', padding: 5 });
    const autoAssign = await configurationService.getPlatformSetting<string | null>('support.autoAssignUserId', null);
    const priority = input.priority ?? 'NORMAL';
    const ticket = await SupportTicket.create({
      ticketNumber,
      source: input.source,
      societyId: input.societyId ?? null,
      requesterUserId: input.requesterUserId ?? null,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || undefined,
      subject: input.subject,
      message: input.message,
      category: input.category,
      priority,
      assignedTo: autoAssign || null,
      dueAt: await this.dueAt(priority),
      messages: [{ authorId: input.requesterUserId ?? null, authorType: 'REQUESTER', authorName: input.name, body: input.message }],
      lastActivityAt: new Date(),
      lastMessageBy: 'REQUESTER',
    });
    domainEvents.emit('support.ticket.created', { ticketId: String(ticket._id), ticketNumber, subject: ticket.subject, source: ticket.source, societyId: input.societyId ?? null, requesterUserId: input.requesterUserId ?? null, requesterEmail: input.requesterUserId ? null : ticket.email }, { societyId: input.societyId ?? null, actorId: input.requesterUserId ?? null });
    auditService.record({ action: 'support.ticket_created', resource: 'SupportTicket', resourceId: ticket._id, societyId: input.societyId ?? null, newValue: { ticketNumber, source: input.source, subject: input.subject }, actor: input.requesterUserId ? { id: input.requesterUserId, type: 'USER' } : { type: 'ANONYMOUS' } });
    return ticket.toJSON();
  }

  // ------------------------------------------------------------ platform inbox
  async list(query: { page?: number; limit?: number; search?: string; status?: string; priority?: string; source?: string; assignedTo?: string; societyId?: string; sort?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status === 'OPEN_ALL' ? { $in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } : query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.source) filter.source = query.source;
    if (query.assignedTo) filter.assignedTo = query.assignedTo === 'unassigned' ? null : query.assignedTo;
    if (query.societyId) filter.societyId = query.societyId;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ subject: rx }, { ticketNumber: rx }, { email: rx }, { name: rx }];
    return paginate(SupportTicket as any, filter, {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      defaultSort: '-lastActivityAt',
      allowedSorts: ['lastActivityAt', 'createdAt', 'priority', 'status', 'dueAt'],
      select: '-messages',
      populate: [{ path: 'assignedTo', select: 'name email' }, { path: 'societyId', select: 'name slug' }],
    });
  }

  async get(id: string, opts: { includeInternal: boolean }) {
    const ticket = await SupportTicket.findById(id).populate('assignedTo', 'name email').populate('societyId', 'name slug').populate('requesterUserId', 'name email').lean();
    if (!ticket) throw Errors.notFound('Ticket');
    return { ...ticket, id: String(ticket._id), messages: opts.includeInternal ? ticket.messages : ticket.messages.filter((m) => !m.internal) };
  }

  async update(id: string, patch: { status?: string; priority?: Priority; assignedTo?: string | null; category?: string; tags?: string[] }, byUserId: string, req?: any) {
    const ticket = await SupportTicket.findById(id);
    if (!ticket) throw Errors.notFound('Ticket');
    const old = { status: ticket.status, priority: ticket.priority, assignedTo: ticket.assignedTo };
    if (patch.assignedTo) {
      const exists = await User.exists({ _id: patch.assignedTo });
      if (!exists) throw Errors.validation({ assignedTo: ['Unknown user'] });
    }
    if (patch.status) {
      const allowed: Record<string, string[]> = { OPEN: ['IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'], IN_PROGRESS: ['WAITING', 'RESOLVED', 'CLOSED', 'OPEN'], WAITING: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'], RESOLVED: ['CLOSED', 'OPEN'], CLOSED: ['OPEN'] };
      if (patch.status !== ticket.status && !allowed[ticket.status]?.includes(patch.status)) throw Errors.invalidTransition(ticket.status, patch.status, 'Ticket');
      if (patch.status === 'RESOLVED') ticket.resolvedAt = new Date();
      if (patch.status === 'CLOSED') ticket.closedAt = new Date();
    }
    if (patch.priority && patch.priority !== ticket.priority) ticket.dueAt = await this.dueAt(patch.priority);
    ticket.set(patch);
    ticket.lastActivityAt = new Date();
    await ticket.save();
    auditService.record({ action: 'support.ticket_updated', resource: 'SupportTicket', resourceId: ticket._id, societyId: ticket.societyId ? String(ticket.societyId) : null, oldValue: old, newValue: patch, req });
    domainEvents.emit('support.ticket.updated', { ticketId: String(ticket._id), status: ticket.status, requesterUserId: ticket.requesterUserId ? String(ticket.requesterUserId) : null }, { societyId: ticket.societyId ? String(ticket.societyId) : null, actorId: byUserId });
    return this.get(id, { includeInternal: true });
  }

  /** Reply from a platform agent (public reply or internal note). */
  async replyAsPlatform(id: string, input: { body: string; internal?: boolean; status?: string }, byUserId: string, req?: any) {
    const ticket = await SupportTicket.findById(id);
    if (!ticket) throw Errors.notFound('Ticket');
    const author = await User.findById(byUserId).select('name').lean();
    ticket.messages.push({ authorId: byUserId, authorType: 'PLATFORM', authorName: author?.name, body: input.body, internal: Boolean(input.internal) } as any);
    if (!input.internal) {
      if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
      ticket.lastMessageBy = 'PLATFORM';
      ticket.status = (input.status as typeof ticket.status | undefined) ?? (ticket.status === 'OPEN' ? 'WAITING' : ticket.status);
    }
    ticket.lastActivityAt = new Date();
    await ticket.save();
    if (!input.internal) {
      domainEvents.emit('support.ticket.replied', { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber, subject: ticket.subject, excerpt: input.body.slice(0, 300), societyId: ticket.societyId ? String(ticket.societyId) : null, requesterUserId: ticket.requesterUserId ? String(ticket.requesterUserId) : null, requesterEmail: ticket.requesterUserId ? null : ticket.email, toPlatform: false }, { societyId: ticket.societyId ? String(ticket.societyId) : null, actorId: byUserId });
    }
    auditService.record({ action: input.internal ? 'support.internal_note' : 'support.replied', resource: 'SupportTicket', resourceId: ticket._id, societyId: ticket.societyId ? String(ticket.societyId) : null, req });
    return this.get(id, { includeInternal: true });
  }

  // ------------------------------------------------------------ requester side (society users)
  async listForRequester(societyId: string, userId: string, opts: { all: boolean; page?: number; limit?: number; status?: string }) {
    const filter: Record<string, unknown> = { societyId };
    if (!opts.all) filter.requesterUserId = userId;
    if (opts.status) filter.status = opts.status;
    return paginate(SupportTicket as any, filter, { page: opts.page, limit: opts.limit, defaultSort: '-lastActivityAt', select: '-messages', populate: { path: 'requesterUserId', select: 'name' } });
  }

  async getForRequester(societyId: string, userId: string, id: string, all: boolean) {
    const ticket = await SupportTicket.findOne({ _id: id, societyId, ...(all ? {} : { requesterUserId: userId }) }).lean();
    if (!ticket) throw Errors.notFound('Ticket');
    return { ...ticket, id: String(ticket._id), messages: ticket.messages.filter((m) => !m.internal) };
  }

  async replyAsRequester(societyId: string, userId: string, id: string, body: string, all: boolean, req?: any) {
    const ticket = await SupportTicket.findOne({ _id: id, societyId, ...(all ? {} : { requesterUserId: userId }) });
    if (!ticket) throw Errors.notFound('Ticket');
    if (ticket.status === 'CLOSED') throw Errors.custom(409, ErrorCodes.INVALID_STATE_TRANSITION, 'This ticket is closed. Please open a new ticket.');
    const author = await User.findById(userId).select('name').lean();
    ticket.messages.push({ authorId: userId, authorType: 'REQUESTER', authorName: author?.name, body } as any);
    ticket.status = ticket.status === 'WAITING' || ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status;
    ticket.lastMessageBy = 'REQUESTER';
    ticket.lastActivityAt = new Date();
    await ticket.save();
    domainEvents.emit('support.ticket.replied', { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber, subject: ticket.subject, excerpt: body.slice(0, 300), societyId, toPlatform: true }, { societyId, actorId: userId });
    auditService.record({ action: 'support.requester_replied', resource: 'SupportTicket', resourceId: ticket._id, societyId, req });
    return this.getForRequester(societyId, userId, id, all);
  }

  async stats() {
    const rows = await SupportTicket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const overdue = await SupportTicket.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { $lt: new Date() } });
    return { byStatus: Object.fromEntries(rows.map((r) => [r._id, r.count])), overdue };
  }
}

export const supportService = new SupportService();
