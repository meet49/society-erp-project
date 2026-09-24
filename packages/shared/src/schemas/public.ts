import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';
import { LeadTypes } from '../constants/enums';

export const leadSchema = z.object({
  type: z.enum(LeadTypes).default('GENERAL'),
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal('')),
  societyName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  message: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(60).optional(),
  planSlug: z.string().trim().max(60).optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const publicSupportTicketSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  phone: phoneSchema.optional().or(z.literal('')),
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(4000),
});

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(4000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  category: z.string().trim().max(60).optional(),
});
