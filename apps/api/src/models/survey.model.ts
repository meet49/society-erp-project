import mongoose, { Schema, type HydratedDocumentFromSchema } from 'mongoose';
import { baseOptions, ObjectIdType, societyField } from './base';
import { audienceMongoSchema } from '../core/audience/audience.service';

export const SurveyStatuses = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export const SurveyQuestionTypes = ['SINGLE', 'MULTIPLE', 'RATING', 'YES_NO', 'TEXT'] as const;

const questionSchema = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: SurveyQuestionTypes, required: true },
    label: { type: String, required: true, trim: true, maxlength: 300 },
    help: { type: String, trim: true, maxlength: 300 },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    /** rating scale upper bound */
    max: { type: Number, default: 5 },
  },
  { _id: false },
);

/** Multi-question survey with audience targeting; responses are one per user and editable until close. */
const surveySchema = new Schema(
  {
    societyId: societyField,
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 3000 },
    questions: { type: [questionSchema], default: [] },
    audience: { type: audienceMongoSchema, default: () => ({ type: 'ALL' }) },
    audienceLabel: { type: String, default: 'Everyone' },
    anonymous: { type: Boolean, default: false },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null, index: true },
    status: { type: String, enum: SurveyStatuses, default: 'DRAFT', index: true },
    responseCount: { type: Number, default: 0 },
    eligibleCount: { type: Number, default: 0 },
    closedAt: { type: Date },
    createdBy: { type: ObjectIdType, ref: 'User' },
  },
  baseOptions,
);
surveySchema.index({ societyId: 1, status: 1, createdAt: -1 });

export type SurveyDoc = HydratedDocumentFromSchema<typeof surveySchema>;
export const Survey = mongoose.model('Survey', surveySchema);

const answerSchema = new Schema({ questionKey: { type: String, required: true }, value: { type: Schema.Types.Mixed } }, { _id: false });

const responseSchema = new Schema(
  {
    societyId: societyField,
    surveyId: { type: ObjectIdType, ref: 'Survey', required: true, index: true },
    userId: { type: ObjectIdType, ref: 'User', required: true },
    unitId: { type: ObjectIdType, ref: 'Unit', default: null },
    answers: { type: [answerSchema], default: [] },
    submittedAt: { type: Date, default: Date.now },
  },
  baseOptions,
);
responseSchema.index({ surveyId: 1, userId: 1 }, { unique: true });

export const SurveyResponse = mongoose.model('SurveyResponse', responseSchema);
