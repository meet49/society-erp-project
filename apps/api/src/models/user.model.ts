import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { UserStatus } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true },
    keys: { p256dh: { type: String }, auth: { type: String } },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true, sparse: true },
    passwordHash: { type: String, select: false },
    status: { type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE, index: true },
    avatarUrl: { type: String },
    emailVerifiedAt: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date },
    preferences: {
      locale: { type: String, default: 'en-IN' },
      theme: { type: String, default: 'system' },
      channels: {
        email: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
      },
    },
    pushSubscriptions: { type: [pushSubscriptionSchema], default: [] },
    invitedBy: { type: ObjectIdType, ref: 'User' },
    createdBy: { type: ObjectIdType, ref: 'User' },
    deactivatedAt: { type: Date },
  },
  baseOptions,
);

userSchema.index({ name: 'text', email: 'text' });

export type UserDoc = HydratedDocumentFromSchema<typeof userSchema>;
export const User = mongoose.model('User', userSchema);
