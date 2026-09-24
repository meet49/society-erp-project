import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { BillingCycle, SubscriptionStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

const historySchema = new Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    byUserId: { type: ObjectIdType, ref: 'User' },
    note: { type: String },
    planId: { type: ObjectIdType, ref: 'Plan' },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', required: true, unique: true },
    planId: { type: ObjectIdType, ref: 'Plan', required: true, index: true },
    billingCycle: { type: String, enum: Object.values(BillingCycle), default: BillingCycle.MONTHLY },
    status: { type: String, enum: Object.values(SubscriptionStatus), default: SubscriptionStatus.TRIALING, index: true },
    startDate: { type: Date, required: true },
    renewalDate: { type: Date, required: true, index: true },
    trialEndDate: { type: Date },
    gracePeriodEndsAt: { type: Date },
    autoRenew: { type: Boolean, default: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    paymentStatus: { type: String, enum: ['NA', 'PENDING', 'PAID', 'FAILED'], default: 'NA' },
    lastPaymentId: { type: ObjectIdType, ref: 'PlatformPayment' },
    lastPaymentAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    suspendedAt: { type: Date },
    suspendReason: { type: String },
    notes: { type: String },
    history: { type: [historySchema], default: [] },
    remindersSent: { type: [{ key: String, at: Date }], default: [] },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

subscriptionSchema.index({ status: 1, renewalDate: 1 });

export type SubscriptionDoc = HydratedDocumentFromSchema<typeof subscriptionSchema>;
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
