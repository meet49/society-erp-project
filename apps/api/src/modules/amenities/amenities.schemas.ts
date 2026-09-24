import { z } from 'zod';
import { AmenityBookingStatus, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';

const timeRx = /^([01]\d|2[0-3]):[0-5]\d$/;
const attachment = z.object({ name: z.string().trim().min(1).max(200), storageKey: z.string().trim().min(1).max(300), mimeType: z.string().trim().max(100).optional(), size: z.coerce.number().int().min(0).optional() });

export const scheduleSchema = z
  .object({
    openTime: z.string().regex(timeRx, 'Use HH:mm'),
    closeTime: z.string().regex(timeRx, 'Use HH:mm'),
    slotMinutes: z.coerce.number().int().min(15).max(24 * 60).nullable(),
    daysOpen: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
    maxSlotsPerBooking: z.coerce.number().int().min(1).max(48),
    minNoticeHours: z.coerce.number().min(0).max(24 * 30).nullable(),
    maxAdvanceDays: z.coerce.number().int().min(1).max(365).nullable(),
  })
  .partial();

export const pricingSchema = z
  .object({
    mode: z.enum(['FREE', 'PER_SLOT', 'PER_HOUR', 'PER_BOOKING']),
    amount: z.coerce.number().min(0).max(10_000_000),
    deposit: z.coerce.number().min(0).max(10_000_000),
    ledgerAccountCode: z.string().trim().max(20),
  })
  .partial();

export const amenityCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only').optional(),
  typeKey: z.string().trim().min(1).max(40).default('OTHER'),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(160).optional(),
  rules: z.string().trim().max(4000).optional(),
  images: z.array(attachment).max(10).optional(),
  capacity: z.coerce.number().int().min(1).max(10000).default(1),
  maxGuests: z.coerce.number().int().min(0).max(10000).default(0),
  bookingMode: z.enum(['SLOT', 'FULL_DAY']).default('SLOT'),
  schedule: scheduleSchema.optional(),
  pricing: pricingSchema.optional(),
  requiresApproval: z.boolean().default(false),
  cancellationHours: z.coerce.number().min(0).max(24 * 60).nullable().optional(),
  maintenanceBlocks: z.array(z.object({ from: z.coerce.date(), to: z.coerce.date(), reason: z.string().trim().max(200).optional() })).max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});
export const amenityUpdateSchema = amenityCreateSchema.partial();
export const amenityListQuerySchema = z.object({ typeKey: z.string().max(40).optional(), includeInactive: booleanQuerySchema });
export const availabilityQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional() });
export const calendarQuerySchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export const bookingCreateSchema = z.object({
  amenityId: objectIdSchema,
  /** staff booking on behalf of a unit; residents may only pass one of their own units */
  unitId: objectIdSchema.optional(),
  startAt: z.coerce.date(),
  slots: z.coerce.number().int().min(1).max(48).default(1),
  guests: z.coerce.number().int().min(0).max(10000).default(0),
  purpose: z.string().trim().max(300).optional(),
});
export const bookingListQuerySchema = paginationQuerySchema.extend({
  amenityId: objectIdSchema.optional(),
  unitId: objectIdSchema.optional(),
  status: z.enum(Object.values(AmenityBookingStatus) as [string, ...string[]]).optional(),
  upcoming: booleanQuerySchema,
  pendingOnly: booleanQuerySchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const cancelBookingSchema = z.object({ reason: z.string().trim().max(500).optional() });
export const decideBookingSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(1000).optional() });
export const refundBookingSchema = z.object({ amount: z.coerce.number().min(1).max(10_000_000).optional(), reason: z.string().trim().min(3).max(500) });

export const amenitiesConfigSchema = z
  .object({
    slotMinutes: z.coerce.number().int().min(15).max(24 * 60),
    maxAdvanceBookingDays: z.coerce.number().int().min(1).max(365),
    maxActiveBookingsPerUnit: z.coerce.number().int().min(0).max(100),
    cancellationHours: z.coerce.number().min(0).max(24 * 60),
    paymentWindowHours: z.coerce.number().min(1).max(24 * 30),
    blockIfDuesPending: z.boolean(),
    lateCancellationRefundPercent: z.coerce.number().min(0).max(100),
    minNoticeHours: z.coerce.number().min(0).max(24 * 30),
  })
  .partial();
