import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { NotificationChannels } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

const channelStateSchema = new Schema(
  {
    channel: { type: String, enum: NotificationChannels, required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'], default: 'PENDING' },
    sentAt: { type: Date },
    error: { type: String },
    attempts: { type: Number, default: 0 },
  },
  { _id: false },
);

/** Database is the source of truth for notifications; sockets/email/whatsapp/push are delivery channels. */
const notificationSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    link: { type: String },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'], default: 'NORMAL' },
    channels: { type: [channelStateSchema], default: [] },
    readAt: { type: Date, default: null },
  },
  baseOptions,
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export type NotificationDoc = HydratedDocumentFromSchema<typeof notificationSchema>;
export const Notification = mongoose.model('Notification', notificationSchema);
