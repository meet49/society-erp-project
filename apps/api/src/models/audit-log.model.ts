import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { ObjectIdType } from './base';

const auditLogSchema = new Schema(
  {
    actorId: { type: ObjectIdType, ref: 'User', index: true },
    actorType: { type: String, enum: ['USER', 'PLATFORM_ADMIN', 'SYSTEM', 'ANONYMOUS'], default: 'USER' },
    actorName: { type: String },
    actorEmail: { type: String },
    societyId: { type: ObjectIdType, ref: 'Society', default: null, index: true },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, index: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, toJSON: { virtuals: true, transform: (_d, r: any) => { r.id = String(r._id); delete r._id; return r; } } },
);

auditLogSchema.index({ societyId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

export type AuditLogDoc = HydratedDocumentFromSchema<typeof auditLogSchema>;
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
