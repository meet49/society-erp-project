import { Lead } from '../../models/lead.model';
import { User } from '../../models/user.model';
import { Errors } from '../../lib/errors';
import { paginate, searchRegex } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { domainEvents } from '../../core/events/event-bus';
import { configurationService } from '../../core/configuration/configuration.service';

class LeadService {
  async createFromPublic(input: Record<string, any>, meta: { ip?: string; userAgent?: string }) {
    const autoAssign = await configurationService.getPlatformSetting<string | null>('support.autoAssignUserId', null);
    const lead = await Lead.create({ ...input, phone: input.phone || undefined, assignedTo: autoAssign || null, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 200) });
    domainEvents.emit('lead.created', { leadId: String(lead._id), name: lead.name, email: lead.email, type: lead.type, societyName: lead.societyName });
    auditService.record({ action: 'lead.created', resource: 'Lead', resourceId: lead._id, newValue: { type: lead.type, email: lead.email }, actor: { type: 'ANONYMOUS' } });
    return { id: String(lead._id) };
  }

  async list(query: { page?: number; limit?: number; search?: string; status?: string; type?: string; assignedTo?: string; sort?: string }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    const rx = searchRegex(query.search);
    if (rx) filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { societyName: rx }, { city: rx }];
    return paginate(Lead as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'status', 'name', 'type'], populate: { path: 'assignedTo', select: 'name email' } });
  }

  async get(id: string) {
    const lead = await Lead.findById(id).populate('assignedTo', 'name email').populate('convertedSocietyId', 'name slug').lean();
    if (!lead) throw Errors.notFound('Lead');
    return { ...lead, id: String(lead._id) };
  }

  async update(id: string, patch: { status?: string; assignedTo?: string | null; type?: string; name?: string; phone?: string; societyName?: string; city?: string; message?: string; convertedSocietyId?: string | null }, byUserId: string, req?: any) {
    const lead = await Lead.findById(id);
    if (!lead) throw Errors.notFound('Lead');
    const old = { status: lead.status, assignedTo: lead.assignedTo };
    if (patch.assignedTo !== undefined && patch.assignedTo) {
      const user = await User.findById(patch.assignedTo).select('_id').lean();
      if (!user) throw Errors.validation({ assignedTo: ['Unknown user'] });
    }
    lead.set(patch);
    if (patch.status === 'CONTACTED') lead.lastContactedAt = new Date();
    await lead.save();
    auditService.record({ action: 'lead.updated', resource: 'Lead', resourceId: lead._id, oldValue: old, newValue: patch, req });
    return this.get(id);
  }

  async addNote(id: string, body: string, byUserId: string, req?: any) {
    const author = await User.findById(byUserId).select('name').lean();
    const lead = await Lead.findByIdAndUpdate(id, { $push: { notes: { body, authorId: byUserId, authorName: author?.name } } }, { new: true });
    if (!lead) throw Errors.notFound('Lead');
    auditService.record({ action: 'lead.note_added', resource: 'Lead', resourceId: lead._id, req });
    return this.get(id);
  }

  async remove(id: string, req?: any): Promise<void> {
    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) throw Errors.notFound('Lead');
    auditService.record({ action: 'lead.deleted', resource: 'Lead', resourceId: id, oldValue: { email: lead.email, name: lead.name }, req });
  }

  async exportRows(filter: Record<string, unknown> = {}) {
    const rows = await Lead.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    return rows.map((l) => ({ name: l.name, email: l.email, phone: l.phone ?? '', type: l.type, societyName: l.societyName ?? '', city: l.city ?? '', status: l.status, source: l.source ?? '', createdAt: l.createdAt?.toISOString() ?? '' }));
  }
}

export const leadService = new LeadService();
