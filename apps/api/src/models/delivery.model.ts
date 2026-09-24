import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { DeliveryStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType, societyField } from './base';

const timelineSchema = new Schema({ at: { type: Date, default: Date.now }, action: { type: String, required: true }, userId: { type: ObjectIdType, ref: 'User', default: null }, note: { type: String, maxlength: 300 } }, { _id: false });

/** Parcels, food and courier deliveries: announced by residents or logged at the gate, optionally left at the gate. */
const deliverySchema = new Schema(
  {
    societyId: societyField,
    unitId: { type: ObjectIdType, ref: 'Unit', required: true, index: true },
    hostUserId: { type: ObjectIdType, ref: 'User', default: null, index: true },
    provider: { type: String, trim: true, maxlength: 80 },
    kind: { type: String, enum: ['PARCEL', 'FOOD', 'GROCERY', 'DOCUMENT', 'OTHER'], default: 'PARCEL' },
    trackingRef: { type: String, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    deliveryPersonName: { type: String, trim: true, maxlength: 120 },
    deliveryPersonPhone: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    photoKey: { type: String, trim: true },
    expectedAt: { type: Date },
    leaveAtGate: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(DeliveryStatus), default: DeliveryStatus.EXPECTED, index: true },
    arrivedAt: { type: Date, index: true },
    gateId: { type: ObjectIdType, ref: 'Gate', default: null },
    receivedBy: { type: ObjectIdType, ref: 'User', default: null },
    collectedAt: { type: Date },
    collectedByName: { type: String, trim: true, maxlength: 120 },
    returnedAt: { type: Date },
    clientRef: { type: String, trim: true },
    notes: { type: String, maxlength: 500 },
    timeline: { type: [timelineSchema], default: [] },
    createdBy: { type: ObjectIdType, ref: 'User', default: null },
  },
  baseOptions,
);

deliverySchema.index({ societyId: 1, status: 1, arrivedAt: -1 });
deliverySchema.index({ societyId: 1, clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });

export type DeliveryDoc = HydratedDocumentFromSchema<typeof deliverySchema>;
export const Delivery = mongoose.model('Delivery', deliverySchema);
