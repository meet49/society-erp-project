import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { PaymentMethods, PaymentStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField } from './base';

const allocationSchema = new Schema({ invoiceId: { type: ObjectIdType, ref: 'Invoice', required: true }, invoiceNumber: { type: String }, amount: { type: Number, required: true } }, { _id: false });

/** Money received from a unit / resident (online through the gateway or recorded offline). */
const paymentSchema = new Schema(
  {
    societyId: societyField,
    paymentNumber: { type: String, required: true },
    receiptNumber: { type: String },
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    payerName: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    method: { type: String, enum: PaymentMethods, required: true },
    provider: { type: String, default: 'manual' },
    providerOrderId: { type: String, index: true },
    providerPaymentId: { type: String, index: true },
    signatureVerified: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.SUCCESS, index: true },
    allocations: { type: [allocationSchema], default: [] },
    unallocatedAmount: { type: Number, default: 0 },
    receivedAt: { type: Date, required: true, index: true },
    reference: { type: String, trim: true },
    bankAccountId: { type: ObjectIdType, ref: 'BankAccount', default: null },
    notes: { type: String, maxlength: 1000 },
    recordedBy: { type: ObjectIdType, ref: 'User' },
    refund: { amount: { type: Number }, reason: { type: String }, at: { type: Date }, by: { type: ObjectIdType, ref: 'User' }, providerRefundId: { type: String } },
    journalEntryId: { type: ObjectIdType, ref: 'JournalEntry', default: null },
    reconciled: { type: Boolean, default: false, index: true },
    reconciledAt: { type: Date },
    bankTransactionId: { type: ObjectIdType, ref: 'BankTransaction', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  baseOptions,
);

paymentSchema.index({ societyId: 1, paymentNumber: 1 }, { unique: true });
paymentSchema.index({ societyId: 1, unitId: 1, receivedAt: -1 });
paymentSchema.index({ societyId: 1, status: 1, receivedAt: -1 });

export type PaymentDoc = HydratedDocumentFromSchema<typeof paymentSchema>;
export const Payment = mongoose.model('Payment', paymentSchema);
