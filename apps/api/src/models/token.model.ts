import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** One-time tokens: password reset, email verification, magic links. */
const tokenSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['PASSWORD_RESET', 'EMAIL_VERIFY'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseOptions,
);

tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type TokenDoc = HydratedDocumentFromSchema<typeof tokenSchema>;
export const Token = mongoose.model('Token', tokenSchema);
