import { z } from 'zod';
import { booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { audienceSchema } from '../../core/audience/audience.service';
import { IncidentSeverities, IncidentStatuses, InvolvedTypes } from '../../models/incident.model';
import { AlertCategories, AlertKinds, AlertStatuses, EmergencyContactCategories } from '../../models/emergency.model';

const dataUrl = z.string().max(3_000_000);
const involved = z.object({ name: z.string().trim().min(1).max(120), type: z.enum(InvolvedTypes).default('UNKNOWN'), refId: objectIdSchema.nullable().optional(), description: z.string().trim().max(300).optional() });
const police = z.object({ reported: z.boolean(), firNumber: z.string().trim().max(60).optional(), station: z.string().trim().max(120).optional(), reportedAt: z.coerce.date().nullable().optional() });

// ------------------------------------------------------------------ incidents
export const incidentCreateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(4000).optional(),
  typeKey: z.string().trim().min(1).max(40),
  severity: z.enum(IncidentSeverities).default('MEDIUM'),
  location: z.string().trim().max(200).optional(),
  gateId: objectIdSchema.nullable().optional(),
  unitId: objectIdSchema.nullable().optional(),
  occurredAt: z.coerce.date().optional(),
  photos: z.array(dataUrl).max(4).optional(),
  involved: z.array(involved).max(20).optional(),
  police: police.optional(),
  clientRef: z.string().trim().max(64).optional(),
});
export const incidentUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  typeKey: z.string().trim().min(1).max(40).optional(),
  severity: z.enum(IncidentSeverities).optional(),
  location: z.string().trim().max(200).optional(),
  unitId: objectIdSchema.nullable().optional(),
  occurredAt: z.coerce.date().optional(),
  involved: z.array(involved).max(20).optional(),
  police: police.optional(),
});
export const incidentListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(IncidentStatuses).optional(),
  severity: z.enum(IncidentSeverities).optional(),
  typeKey: z.string().max(40).optional(),
  assignedTo: objectIdSchema.optional(),
  unitId: objectIdSchema.optional(),
  openOnly: booleanQuerySchema.optional(),
  mine: booleanQuerySchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const incidentNoteSchema = z.object({ note: z.string().trim().min(1).max(2000), photos: z.array(dataUrl).max(4).optional() });
export const incidentAssignSchema = z.object({ assignedTo: objectIdSchema.nullable() });
export const incidentStatusSchema = z.object({ status: z.enum(['INVESTIGATING', 'OPEN']), note: z.string().trim().max(2000).optional() });
export const incidentResolveSchema = z.object({ note: z.string().trim().min(2).max(4000), actionTaken: z.string().trim().max(2000).optional(), close: z.boolean().optional() });
export const incidentCloseSchema = z.object({ note: z.string().trim().max(2000).optional() });
export const securityConfigSchema = z.object({
  notifyRoleKeysOnCritical: z.array(z.string().trim().min(1).max(60)).max(20),
  notifyUnitOnIncident: z.boolean(),
  autoCloseResolvedAfterDays: z.coerce.number().int().min(0).max(365),
}).partial();
export const gateSchema = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().min(1).max(20), description: z.string().trim().max(300).optional(), buildingIds: z.array(objectIdSchema).max(100).optional(), isDefault: z.boolean().optional(), isActive: z.boolean().optional() });
export const gateUpdateSchema = gateSchema.partial();

// ------------------------------------------------------------------ emergency
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(2).max(20),
  altPhone: z.string().trim().max(20).optional(),
  category: z.enum(EmergencyContactCategories).default('OTHER'),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(300).optional(),
  order: z.coerce.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});
export const contactUpdateSchema = contactSchema.partial();
export const contactsReorderSchema = z.object({ ids: z.array(objectIdSchema).min(1).max(500) });
export const sosSchema = z.object({
  category: z.enum(AlertCategories).default('OTHER'),
  location: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  unitId: objectIdSchema.nullable().optional(),
  coordinates: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).optional(),
  clientRef: z.string().trim().max(64).optional(),
});
export const broadcastSchema = z.object({
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(2000),
  category: z.enum(AlertCategories).default('OTHER'),
  audience: audienceSchema.optional(),
  expiresInHours: z.coerce.number().min(0.25).max(72).optional(),
});
export const acknowledgeSchema = z.object({ note: z.string().trim().max(500).optional() });
export const alertResolveSchema = z.object({ note: z.string().trim().max(2000).optional(), falseAlarm: z.boolean().optional() });
export const alertListQuerySchema = paginationQuerySchema.extend({ kind: z.enum(AlertKinds).optional(), status: z.enum(AlertStatuses).optional(), activeOnly: booleanQuerySchema.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const emergencyConfigSchema = z.object({
  sosNotifyRoleKeys: z.array(z.string().trim().min(1).max(60)).max(20),
  escalateUnacknowledgedMinutes: z.coerce.number().int().min(0).max(240),
  escalationRoleKeys: z.array(z.string().trim().min(1).max(60)).max(20),
  broadcastActiveHours: z.coerce.number().min(0.25).max(72),
  showContactsToMembers: z.boolean(),
  memberCanRaiseSos: z.boolean(),
}).partial();
