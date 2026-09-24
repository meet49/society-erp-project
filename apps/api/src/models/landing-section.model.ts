import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { LandingSectionTypes } from '@society-erp/shared';
import { baseOptions, ObjectIdType } from './base';

/**
 * CMS sections for the public website. `content` is type-specific JSON (feature lists, FAQ items,
 * testimonials, steps...). Draft edits are stored in `draft`; publishing copies draft → live fields.
 */
const landingSectionSchema = new Schema(
  {
    page: { type: String, default: 'home', index: true },
    type: { type: String, enum: LandingSectionTypes, required: true },
    key: { type: String, required: true, unique: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    description: { type: String, default: '' },
    content: { type: Schema.Types.Mixed, default: {} },
    image: { type: String, default: '' },
    icon: { type: String, default: '' },
    cta: { label: { type: String, default: '' }, href: { type: String, default: '' }, secondaryLabel: { type: String, default: '' }, secondaryHref: { type: String, default: '' } },
    metadata: { type: Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    /** unpublished working copy; null when no pending changes */
    draft: { type: Schema.Types.Mixed, default: null },
    updatedBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);

export type LandingSectionDoc = HydratedDocumentFromSchema<typeof landingSectionSchema>;
export const LandingSection = mongoose.model('LandingSection', landingSectionSchema);
