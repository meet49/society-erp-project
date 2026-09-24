import mongoose, { Schema, type SchemaOptions } from 'mongoose';

export const ObjectIdType = Schema.Types.ObjectId;
export type ObjectId = mongoose.Types.ObjectId;

/**
 * Standard options: timestamps, no version key, `id` virtual and clean JSON output.
 * Kept as a literal type (not the wide SchemaOptions) so Mongoose schema inference keeps working.
 */
export const baseOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc: unknown, ret: any) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.passwordHash;
      delete ret.tokenHash;
      return ret;
    },
  },
  toObject: { virtuals: true },
} as const satisfies SchemaOptions;

/** Field definition shared by every society-owned entity. */
export const societyField = { type: ObjectIdType, ref: 'Society', required: true, index: true } as const;

/** Soft-delete fields for important business records. */
export const softDeleteFields = {
  deletedAt: { type: Date, default: null },
  deletedBy: { type: ObjectIdType, ref: 'User', default: null },
};

export const attachmentSchema = new Schema(
  {
    name: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String },
    size: { type: Number },
    uploadedBy: { type: ObjectIdType, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

export const addressSchema = new Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
  },
  { _id: false },
);

/** Converts lean docs into API-friendly objects (`id` instead of `_id`). */
export function serialize<T extends Record<string, any>>(doc: T | null | undefined): any {
  if (!doc) return doc;
  const out: any = typeof (doc as any).toJSON === 'function' ? (doc as any).toJSON() : { ...doc };
  if (out._id !== undefined) {
    out.id = String(out._id);
    delete out._id;
  }
  delete out.passwordHash;
  delete out.tokenHash;
  return out;
}

export function serializeMany<T extends Record<string, any>>(docs: T[]): any[] {
  return docs.map(serialize);
}
