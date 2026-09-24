import dayjs from 'dayjs';
import { Sequence } from '../../models/sequence.model';

export interface SequenceOptions {
  prefix?: string;
  padding?: number;
  resetPolicy?: 'NEVER' | 'YEARLY' | 'MONTHLY' | 'FISCAL_YEAR';
  fiscalYearStartMonth?: number;
}

function periodFor(policy: string, fiscalYearStartMonth = 4): string {
  const now = dayjs();
  if (policy === 'YEARLY') return now.format('YYYY');
  if (policy === 'MONTHLY') return now.format('YYYYMM');
  if (policy === 'FISCAL_YEAR') {
    const startYear = now.month() + 1 >= fiscalYearStartMonth ? now.year() : now.year() - 1;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  }
  return '';
}

/** Atomic, per-society numbering for invoices, receipts, complaints, tickets, journals... */
class SequenceService {
  async next(societyId: string | null, key: string, opts: SequenceOptions = {}): Promise<string> {
    const policy = opts.resetPolicy ?? 'NEVER';
    const period = periodFor(policy, opts.fiscalYearStartMonth);
    const existing = await Sequence.findOne({ societyId, key }).lean();
    if (!existing) {
      await Sequence.updateOne(
        { societyId, key },
        { $setOnInsert: { prefix: opts.prefix ?? '', padding: opts.padding ?? 5, resetPolicy: policy, period, next: 1 } },
        { upsert: true },
      );
    } else if (existing.period !== period) {
      // reset counter when the period changed (yearly / monthly numbering)
      await Sequence.updateOne({ societyId, key, period: existing.period }, { $set: { period, next: 1 } });
    }
    const doc = await Sequence.findOneAndUpdate({ societyId, key }, { $inc: { next: 1 } }, { new: false }).lean();
    if (!doc) throw new Error(`Sequence ${key} could not be reserved`);
    const prefix = opts.prefix ?? doc.prefix ?? '';
    const padding = opts.padding ?? doc.padding ?? 5;
    const number = String(doc.next).padStart(padding, '0');
    const periodPart = period ? `${period}/` : '';
    return `${prefix ? `${prefix}/` : ''}${periodPart}${number}`;
  }
}

export const sequenceService = new SequenceService();
