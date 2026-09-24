import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions } from './base';

/** Inbound webhook ledger: guarantees idempotent processing (unique provider + eventId). */
const webhookEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String },
    scope: { type: String, default: 'society' }, // society | platform
    societyId: { type: Schema.Types.ObjectId, ref: 'Society', default: null },
    signatureValid: { type: Boolean, default: false },
    payload: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['PROCESSED', 'IGNORED', 'FAILED'], default: 'IGNORED' },
    error: { type: String },
    processedAt: { type: Date },
  },
  baseOptions,
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export type WebhookEventDoc = HydratedDocumentFromSchema<typeof webhookEventSchema>;
export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
