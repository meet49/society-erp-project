import { z } from 'zod';
import { objectIdSchema, phoneSchema } from '@society-erp/shared';

export {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  acceptInviteSchema,
} from '@society-erp/shared';

export const switchSocietySchema = z.object({
  societyId: objectIdSchema.optional(),
  platform: z.boolean().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
  preferences: z
    .object({
      locale: z.string().max(10).optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      channels: z.object({ email: z.boolean().optional(), whatsapp: z.boolean().optional(), push: z.boolean().optional() }).optional(),
    })
    .optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const familyParamSchema = z.object({ familyId: z.string().min(8).max(80) });
export const inviteTokenParamSchema = z.object({ token: z.string().min(20).max(200) });
