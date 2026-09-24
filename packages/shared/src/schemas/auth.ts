import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema, slugSchema } from './common';
import { SocietyTypes } from '../constants/enums';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
  societyId: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password: passwordSchema });

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(2).max(80).optional(),
  password: passwordSchema,
});

export const signupSchema = z.object({
  society: z.object({
    name: z.string().trim().min(3).max(120),
    slug: slugSchema.optional(),
    type: z.enum(SocietyTypes).default('APARTMENT'),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().max(80).optional(),
    pincode: z.string().trim().max(12).optional(),
    addressLine1: z.string().trim().max(200).optional(),
    totalUnits: z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.coerce.number().int().min(1).max(100000).optional()),
  }),
  admin: z.object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    phone: z.preprocess((v) => (v === '' ? undefined : v), phoneSchema.optional()),
    password: passwordSchema,
  }),
  planId: z.string().min(1),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});
export type SignupInput = z.infer<typeof signupSchema>;
