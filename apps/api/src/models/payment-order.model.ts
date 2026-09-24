import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType } from './base';

/** Gateway order created before an online payment; the payment itself is only trusted after server-side verification. */
const paymentOrderSchema = new Schema(
  {
    /** null for platform (subscription) orders */
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    purpose: { type: String, enum: ['INVOICE', 'ADVANCE', 'AMENITY', 'SUBSCRIPTION'], required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    invoiceIds: { type: [ObjectIdType], default: [] },
    referenceId: { type: ObjectIdType, default: null },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true, unique: true },
    providerKeyId: { type: String },
    status: { type: String, enum: ['CREATED', 'PAID', 'FAILED', 'EXPIRED'], default: 'CREATED', index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true },
    paymentId: { type: ObjectIdType, default: null },
    providerPaymentId: { type: String },
    failureReason: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true },
    paidAt: { type: Date },
  },
  baseOptions,
);

paymentOrderSchema.index({ societyId: 1, userId: 1, createdAt: -1 });

export type PaymentOrderDoc = HydratedDocumentFromSchema<typeof paymentOrderSchema>;
export const PaymentOrder = mongoose.model('PaymentOrder', paymentOrderSchema);
