import { z } from 'zod';
import { VisitorStatus, objectIdSchema, paginationQuerySchema, phoneSchema, booleanQuerySchema } from '@society-erp/shared';

export const gateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(300).optional(),
  buildingIds: z.array(objectIdSchema).max(50).default([]),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export const gateUpdateSchema = gateSchema.partial();

/** Resident (or staff on behalf of a unit) pre-approves a visitor and gets a QR + passcode. */
export const preApproveSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional().or(z.literal('')),
  categoryKey: z.string().trim().min(1).max(40).default('GUEST'),
  companyName: z.string().trim().max(120).optional(),
  vehicleNumber: z.string().trim().max(20).optional(),
  guestCount: z.coerce.number().int().min(1).max(50).default(1),
  purpose: z.string().trim().max(300).optional(),
  unitId: objectIdSchema.optional(),
  expectedAt: z.coerce.date().optional(),
  validFrom: z.coerce.date().optional(),
  validHours: z.coerce.number().min(1).max(24 * 30).optional(),
  recurring: z.object({ days: z.array(z.coerce.number().int().min(0).max(6)).max(7), until: z.coerce.date() }).optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Guard registers someone at the gate; the host is asked to approve in real time. */
export const walkInSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional().or(z.literal('')),
  categoryKey: z.string().trim().min(1).max(40).default('GUEST'),
  companyName: z.string().trim().max(120).optional(),
  vehicleNumber: z.string().trim().max(20).optional(),
  guestCount: z.coerce.number().int().min(1).max(50).default(1),
  purpose: z.string().trim().max(300).optional(),
  unitId: objectIdSchema,
  gateId: objectIdSchema.optional(),
  photo: z.string().max(7_000_000).optional(),
  idProof: z.object({ type: z.string().trim().max(30), number: z.string().trim().max(40) }).optional(),
  /** guard app idempotency key (offline queue replays are safe) */
  clientRef: z.string().trim().max(60).optional(),
  /** host already confirmed by phone: guard with visitors:approve may check in directly */
  approvedByPhone: z.boolean().default(false),
});

export const decisionSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const lookupSchema = z.object({ code: z.string().trim().min(3).max(120) });
export const checkInSchema = z.object({ gateId: objectIdSchema.optional(), photo: z.string().max(7_000_000).optional(), vehicleNumber: z.string().trim().max(20).optional(), guestCount: z.coerce.number().int().min(1).max(50).optional(), clientRef: z.string().trim().max(60).optional(), note: z.string().trim().max(300).optional() });
export const checkOutSchema = z.object({ gateId: objectIdSchema.optional(), clientRef: z.string().trim().max(60).optional(), note: z.string().trim().max(300).optional() });

export const visitorListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(Object.values(VisitorStatus) as [string, ...string[]]).optional(),
  entryType: z.enum(['PRE_APPROVED', 'WALK_IN']).optional(),
  categoryKey: z.string().max(40).optional(),
  unitId: objectIdSchema.optional(),
  gateId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  insideOnly: booleanQuerySchema,
});

export const visitorSettingsSchema = z.object({
  passValidityHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  passcodeLength: z.coerce.number().int().min(4).max(8).optional(),
  requirePhoto: z.boolean().optional(),
  requireVehicleNumber: z.boolean().optional(),
  dailyGuestCap: z.coerce.number().int().min(0).max(500).optional(),
  notifyOnCheckin: z.boolean().optional(),
  notifyOnCheckout: z.boolean().optional(),
  walkInApprovalTimeoutMinutes: z.coerce.number().int().min(1).max(120).optional(),
  autoCheckoutHours: z.coerce.number().int().min(1).max(72).optional(),
});

// ---- deliveries
export const deliveryAnnounceSchema = z.object({
  provider: z.string().trim().max(80).optional(),
  kind: z.enum(['PARCEL', 'FOOD', 'GROCERY', 'DOCUMENT', 'OTHER']).default('PARCEL'),
  trackingRef: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  expectedAt: z.coerce.date().optional(),
  leaveAtGate: z.boolean().default(false),
  unitId: objectIdSchema.optional(),
});
export const deliveryArriveSchema = z.object({
  unitId: objectIdSchema,
  provider: z.string().trim().max(80).optional(),
  kind: z.enum(['PARCEL', 'FOOD', 'GROCERY', 'DOCUMENT', 'OTHER']).default('PARCEL'),
  trackingRef: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  deliveryPersonName: z.string().trim().max(120).optional(),
  deliveryPersonPhone: phoneSchema.optional().or(z.literal('')),
  vehicleNumber: z.string().trim().max(20).optional(),
  gateId: objectIdSchema.optional(),
  photo: z.string().max(7_000_000).optional(),
  leaveAtGate: z.boolean().default(false),
  clientRef: z.string().trim().max(60).optional(),
});
export const deliveryStatusSchema = z.object({ status: z.enum(['RECEIVED_AT_GATE', 'COLLECTED', 'RETURNED', 'NOTIFIED']), collectedByName: z.string().trim().max(120).optional(), note: z.string().trim().max(300).optional(), clientRef: z.string().trim().max(60).optional() });
export const deliveryListQuerySchema = paginationQuerySchema.extend({ status: z.string().max(30).optional(), unitId: objectIdSchema.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), pendingOnly: booleanQuerySchema });
