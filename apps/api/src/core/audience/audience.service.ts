import { Schema } from 'mongoose';
import { z } from 'zod';
import { AudienceTypes, ResidentTypes, objectIdSchema } from '@society-erp/shared';
import { ObjectIdType } from '../../models/base';
import { Unit } from '../../models/unit.model';
import { Building } from '../../models/building.model';
import { Resident } from '../../models/resident.model';
import { Membership } from '../../models/membership.model';
import { Role } from '../../models/role.model';
import { UserRole } from '../../models/user-role.model';

/**
 * Audiences target notices, announcements, events, polls and surveys at everyone, buildings, unit
 * groups, roles or hand-picked people (optionally narrowed to owners / tenants…). One definition is
 * shared by every module so the picker, the visibility filter and the notification fan-out agree.
 */
export const audienceSchema = z.object({
  type: z.enum(AudienceTypes).default('ALL'),
  buildingIds: z.array(objectIdSchema).max(100).default([]),
  unitIds: z.array(objectIdSchema).max(5000).default([]),
  roleKeys: z.array(z.string().trim().max(60)).max(20).default([]),
  userIds: z.array(objectIdSchema).max(5000).default([]),
  residentTypes: z.array(z.enum(ResidentTypes)).max(5).default([]),
});
export type Audience = z.infer<typeof audienceSchema>;

export const audienceMongoSchema = new Schema(
  {
    type: { type: String, enum: AudienceTypes, default: 'ALL' },
    buildingIds: { type: [ObjectIdType], default: [] },
    unitIds: { type: [ObjectIdType], default: [] },
    roleKeys: { type: [String], default: [] },
    userIds: { type: [ObjectIdType], default: [] },
    residentTypes: { type: [String], default: [] },
  },
  { _id: false },
);

export interface AudienceMember { userId: string; unitIds: string[]; roleKeys: string[] }
const uniq = (arr: string[]) => [...new Set(arr)];

class AudienceService {
  private async buildingIdsFor(unitIds: string[]): Promise<string[]> {
    if (!unitIds.length) return [];
    const units = await Unit.find({ _id: { $in: unitIds } }).select('buildingId').lean();
    return uniq(units.map((u) => (u.buildingId ? String(u.buildingId) : '')).filter(Boolean));
  }

  private async residentTypesFor(societyId: string, userId: string): Promise<string[]> {
    const rows = await Resident.find({ societyId, userId, deletedAt: null, status: { $ne: 'MOVED_OUT' } }).select('type').lean();
    return uniq(rows.map((r) => String(r.type)));
  }

  /** Mongo filter fragment: documents whose `<field>` audience includes this member. */
  async matchFilter(societyId: string, member: AudienceMember, field = 'audience'): Promise<Record<string, unknown>> {
    const [buildingIds, residentTypes] = await Promise.all([this.buildingIdsFor(member.unitIds), this.residentTypesFor(societyId, member.userId)]);
    const or: Record<string, unknown>[] = [{ [`${field}.type`]: 'ALL' }, { [`${field}.type`]: 'CUSTOM', [`${field}.userIds`]: member.userId }];
    if (buildingIds.length) or.push({ [`${field}.type`]: 'BUILDING', [`${field}.buildingIds`]: { $in: buildingIds } });
    if (member.unitIds.length) or.push({ [`${field}.type`]: 'UNIT_GROUP', [`${field}.unitIds`]: { $in: member.unitIds } });
    if (member.roleKeys.length) or.push({ [`${field}.type`]: 'ROLE', [`${field}.roleKeys`]: { $in: member.roleKeys } });
    const typeGate: Record<string, unknown>[] = [{ [`${field}.residentTypes`]: { $size: 0 } }, { [`${field}.residentTypes`]: { $exists: false } }];
    if (residentTypes.length) typeGate.push({ [`${field}.residentTypes`]: { $in: residentTypes } });
    return { $and: [{ $or: or }, { $or: typeGate }] };
  }

  /** Is this member inside the audience? (used before accepting votes / RSVPs / responses) */
  async includes(societyId: string, member: AudienceMember, audience: Audience): Promise<boolean> {
    const ids = await this.resolveUserIds(societyId, audience);
    return ids.includes(member.userId);
  }

  /** Every user the audience fans out to (notifications, eligibility counts). */
  async resolveUserIds(societyId: string, audience: Audience): Promise<string[]> {
    const typeFilter = audience.residentTypes?.length ? { type: { $in: audience.residentTypes } } : {};
    const residentsOf = async (unitIds: unknown[]) => (await Resident.find({ societyId, unitId: { $in: unitIds }, userId: { $ne: null }, status: 'ACTIVE', deletedAt: null, ...typeFilter }).select('userId').lean()).map((r) => String(r.userId));
    switch (audience.type) {
      case 'ALL': {
        if (audience.residentTypes?.length) return uniq((await Resident.find({ societyId, userId: { $ne: null }, status: 'ACTIVE', deletedAt: null, ...typeFilter }).select('userId').lean()).map((r) => String(r.userId)));
        return uniq((await Membership.find({ societyId, status: 'ACTIVE' }).select('userId').lean()).map((m) => String(m.userId)));
      }
      case 'BUILDING': {
        const units = await Unit.find({ societyId, buildingId: { $in: audience.buildingIds }, deletedAt: null }).select('_id').lean();
        return uniq(await residentsOf(units.map((u) => u._id)));
      }
      case 'UNIT_GROUP': return uniq(await residentsOf(audience.unitIds));
      case 'ROLE': {
        const roles = await Role.find({ societyId, key: { $in: audience.roleKeys.map((k) => k.toUpperCase()) } }).select('_id').lean();
        const links = await UserRole.find({ societyId, roleId: { $in: roles.map((r) => r._id) } }).select('userId').lean();
        return uniq(links.map((l) => String(l.userId)));
      }
      case 'CUSTOM': return uniq(audience.userIds.map(String));
      default: return [];
    }
  }

  async count(societyId: string, audience: Audience): Promise<number> {
    return (await this.resolveUserIds(societyId, audience)).length;
  }

  /** Human label stored with the document (“Everyone”, “Tower A, Tower B”, “Committee”, “12 units”…). */
  async describe(societyId: string, audience: Audience): Promise<string> {
    const suffix = audience.residentTypes?.length ? ` (${audience.residentTypes.map((t) => t.toLowerCase() + 's').join(', ')})` : '';
    switch (audience.type) {
      case 'ALL': return `Everyone${suffix}`;
      case 'BUILDING': {
        const names = (await Building.find({ _id: { $in: audience.buildingIds } }).select('name').lean()).map((b) => b.name);
        return `${names.join(', ') || 'Selected buildings'}${suffix}`;
      }
      case 'UNIT_GROUP': {
        const codes = (await Unit.find({ _id: { $in: audience.unitIds } }).select('code').lean()).map((u) => u.code);
        return `${codes.length <= 4 ? codes.join(', ') : `${codes.length} units`}${suffix}`;
      }
      case 'ROLE': {
        const names = (await Role.find({ societyId, key: { $in: audience.roleKeys.map((k) => k.toUpperCase()) } }).select('name').lean()).map((r) => r.name);
        return names.join(', ') || 'Selected roles';
      }
      case 'CUSTOM': return `${audience.userIds.length} selected ${audience.userIds.length === 1 ? 'person' : 'people'}`;
      default: return 'Everyone';
    }
  }
}

export const audienceService = new AudienceService();
