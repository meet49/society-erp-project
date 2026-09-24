import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { NotificationChannels } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

/**
 * Notification templates. societyId = null defines the platform default; a society can override
 * any template. Body/subject use {{variable}} placeholders.
 */
const notificationTemplateSchema = new Schema(
  {
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    key: { type: String, required: true },
    channel: { type: String, enum: NotificationChannels, required: true },
    subject: { type: String },
    body: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    description: { type: String },
    variables: { type: [String], default: [] },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

notificationTemplateSchema.index({ societyId: 1, key: 1, channel: 1 }, { unique: true });

export type NotificationTemplateDoc = HydratedDocumentFromSchema<typeof notificationTemplateSchema>;
export const NotificationTemplate = mongoose.model('NotificationTemplate', notificationTemplateSchema);
