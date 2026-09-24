import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/**
 * Refresh-token sessions. Tokens are stored hashed. Rotation: each refresh marks the current
 * document used and creates a successor in the same family. Reuse of a used token revokes the family.
 */
const sessionSchema = new Schema(
  {
    userId: { type: ObjectIdType, ref: 'User', required: true, index: true },
    societyId: { type: ObjectIdType, ref: 'Society', default: null },
    isPlatform: { type: Boolean, default: false },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    replacedByHash: { type: String },
    revokedAt: { type: Date },
    revokedReason: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    lastUsedAt: { type: Date },
  },
  baseOptions,
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1, usedAt: 1 });

export type SessionDoc = HydratedDocumentFromSchema<typeof sessionSchema>;
export const Session = mongoose.model('Session', sessionSchema);
