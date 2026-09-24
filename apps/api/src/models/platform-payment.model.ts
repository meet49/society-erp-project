import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Payments made by societies to the platform for subscriptions (online or recorded offline). */
const platformPaymentSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, index: true },
    subscriptionId: { type: ObjectIdType, ref: 'Subscription', required: true, index: true },
    planId: { type: ObjectIdType, ref: 'Plan' },
    billingCycle: { type: String, enum: ['MONTHLY', 'ANNUAL'] },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], default: 'PENDING', index: true },
    provider: { type: String, default: 'manual' },
    providerOrderId: { type: String, index: true },
    providerPaymentId: { type: String, index: true },
    method: { type: String },
    reference: { type: String },
    failureReason: { type: String },
    paidAt: { type: Date },
    recordedBy: { type: ObjectIdType, ref: 'User' },
    initiatedBy: { type: ObjectIdType, ref: 'User' },
    receiptNumber: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseOptions,
);

platformPaymentSchema.index({ createdAt: -1 });

export type PlatformPaymentDoc = HydratedDocumentFromSchema<typeof platformPaymentSchema>;
export const PlatformPayment = mongoose.model('PlatformPayment', platformPaymentSchema);
