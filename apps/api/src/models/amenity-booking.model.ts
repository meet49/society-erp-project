import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { AmenityBookingStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField } from './base';

const historySchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    userId: { type: ObjectIdType, ref: 'User', default: null },
    action: { type: String, required: true },
    from: { type: String },
    to: { type: String },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

export const BookingPaymentStatus = ['NOT_REQUIRED', 'PENDING', 'PAID', 'REFUND_DUE', 'REFUNDED', 'FORFEITED', 'VOID'] as const;

/**
 * A reservation of an amenity for a unit. Money never moves here: fees are invoiced through billing
 * (`invoiceId`) and settled through payments; refunds go through the payment's refund flow.
 */
const amenityBookingSchema = new Schema(
  {
    societyId: societyField,
    bookingNumber: { type: String, required: true },
    amenityId: { type: ObjectIdType, ref: 'Amenity', required: true, index: true },
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    bookedBy: { type: ObjectIdType, ref: 'User', required: true, index: true },
    residentId: { type: ObjectIdType, ref: 'Resident', default: null },
    onBehalf: { type: Boolean, default: false },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    slots: { type: Number, default: 1 },
    guests: { type: Number, default: 0 },
    purpose: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: Object.values(AmenityBookingStatus), default: AmenityBookingStatus.CONFIRMED, index: true },
    amount: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: BookingPaymentStatus, default: 'NOT_REQUIRED', index: true },
    invoiceId: { type: ObjectIdType, ref: 'Invoice', default: null, index: true },
    paymentId: { type: ObjectIdType, ref: 'Payment', default: null },
    paidAt: { type: Date },
    /** the slot is held until this time while payment is pending */
    paymentDueAt: { type: Date, default: null, index: true },
    refund: { amount: { type: Number }, reason: { type: String }, at: { type: Date }, by: { type: ObjectIdType, ref: 'User' } },
    workflowInstanceId: { type: ObjectIdType, ref: 'WorkflowInstance', default: null },
    decidedBy: { type: ObjectIdType, ref: 'User', default: null },
    decidedAt: { type: Date },
    decisionNote: { type: String, maxlength: 1000 },
    cancelledAt: { type: Date },
    cancelledBy: { type: ObjectIdType, ref: 'User', default: null },
    cancellationReason: { type: String, maxlength: 500 },
    completedAt: { type: Date },
    history: { type: [historySchema], default: [] },
  },
  baseOptions,
);

amenityBookingSchema.index({ societyId: 1, bookingNumber: 1 }, { unique: true });
amenityBookingSchema.index({ amenityId: 1, status: 1, startAt: 1, endAt: 1 });
amenityBookingSchema.index({ societyId: 1, unitId: 1, status: 1, endAt: -1 });
amenityBookingSchema.index({ societyId: 1, status: 1, startAt: -1 });

export type AmenityBookingDoc = HydratedDocumentFromSchema<typeof amenityBookingSchema>;
export const AmenityBooking = mongoose.model('AmenityBooking', amenityBookingSchema);
