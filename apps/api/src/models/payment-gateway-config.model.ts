import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Per-society payment gateway credentials (secrets encrypted at rest with ENCRYPTION_KEY). */
const paymentGatewayConfigSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, unique: true },
    provider: { type: String, enum: ['razorpay', 'mock'], default: 'mock' },
    enabled: { type: Boolean, default: false },
    displayName: { type: String, trim: true, default: 'Online payment' },
    keyId: { type: String, trim: true },
    keySecretEncrypted: { type: String, select: false },
    webhookSecretEncrypted: { type: String, select: false },
    testMode: { type: Boolean, default: true },
    allowedMethods: { type: [String], default: ['UPI', 'CARD', 'NETBANKING', 'WALLET'] },
    convenienceFeePercent: { type: Number, default: 0, min: 0, max: 10 },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

export type PaymentGatewayConfigDoc = HydratedDocumentFromSchema<typeof paymentGatewayConfigSchema>;
export const PaymentGatewayConfig = mongoose.model('PaymentGatewayConfig', paymentGatewayConfigSchema);
