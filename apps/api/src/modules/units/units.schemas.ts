import { z } from 'zod';
import { UnitOccupancyStatus, booleanQuerySchema, objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { BuildingTypes } from '../../models/building.model';

export const buildingCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(20),
  type: z.enum(BuildingTypes).default('TOWER'),
  parentId: objectIdSchema.nullable().optional(),
  floors: z.coerce.number().int().min(0).max(200).default(0),
  hasBasement: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  notes: z.string().trim().max(500).optional(),
});
export const buildingUpdateSchema = buildingCreateSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });

const meterSchema = z.object({
  type: z.string().trim().min(1).max(30),
  meterNumber: z.string().trim().max(60).optional(),
  multiplier: z.coerce.number().positive().default(1),
  lastReading: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
});

export const unitCreateSchema = z.object({
  buildingId: objectIdSchema.nullable().optional(),
  floor: z.coerce.number().int().min(-5).max(200).default(0),
  number: z.string().trim().min(1).max(20),
  code: z.string().trim().max(40).optional(),
  type: z.string().trim().max(30).default('FLAT'),
  areaSqft: z.coerce.number().min(0).max(1_000_000).default(0),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  occupancyStatus: z.enum(UnitOccupancyStatus).optional(),
  meters: z.array(meterSchema).max(10).optional(),
  attributes: z.record(z.unknown()).optional(),
  openingBalance: z.coerce.number().default(0),
  notes: z.string().trim().max(1000).optional(),
});
export const unitUpdateSchema = unitCreateSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });

export const unitBulkSchema = z.object({
  buildingId: objectIdSchema,
  floorFrom: z.coerce.number().int().min(0).max(200),
  floorTo: z.coerce.number().int().min(0).max(200),
  unitsPerFloor: z.coerce.number().int().min(1).max(50),
  /** pattern tokens: {floor} {seq} {seq2} {building} */
  numberPattern: z.string().trim().max(30).default('{floor}{seq2}'),
  type: z.string().trim().max(30).default('FLAT'),
  areaSqft: z.coerce.number().min(0).optional(),
  skipGroundFloorNumbering: z.boolean().optional(),
});

export const unitListQuerySchema = paginationQuerySchema.extend({
  buildingId: objectIdSchema.optional(),
  floor: z.coerce.number().int().optional(),
  type: z.string().max(30).optional(),
  occupancyStatus: z.enum(UnitOccupancyStatus).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  vacantOnly: booleanQuerySchema,
});
