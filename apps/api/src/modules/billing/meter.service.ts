import dayjs from 'dayjs';
import { MeterReading } from '../../models/meter-reading.model';
import { Unit } from '../../models/unit.model';
import { Errors } from '../../lib/errors';
import { paginate } from '../../lib/pagination';
import { auditService } from '../../core/audit/audit.service';
import { round2 } from './charge-calculator';

interface ReadingInput {
  unitId: string;
  meterType: string;
  meterNumber?: string;
  currentReading: number;
  previousReading?: number;
  readingDate?: Date;
  periodFrom?: Date;
  periodTo?: Date;
  notes?: string;
}

/** Parses a CSV of `unitCode,meterType,currentReading[,readingDate][,previousReading]` (header optional). */
export function parseMeterCsv(csv: string): { rows: { unitCode: string; meterType: string; currentReading: number; readingDate?: string; previousReading?: number; line: number }[]; errors: { line: number; message: string }[] } {
  const rows: { unitCode: string; meterType: string; currentReading: number; readingDate?: string; previousReading?: number; line: number }[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let header: string[] | null = null;
  lines.forEach((line, idx) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (idx === 0 && /unit/i.test(cells[0]) && Number.isNaN(Number(cells[2]))) {
      header = cells.map((c) => c.toLowerCase().replace(/[^a-z]/g, ''));
      return;
    }
    const get = (name: string, fallbackIndex: number) => {
      if (header) {
        const i = header.findIndex((h) => h.includes(name));
        return i >= 0 ? cells[i] : undefined;
      }
      return cells[fallbackIndex];
    };
    const unitCode = get('unit', 0);
    const meterType = get('meter', 1) ?? get('type', 1);
    const current = Number(get('current', 2) ?? get('reading', 2));
    const readingDate = get('date', 3);
    const previousRaw = get('previous', 4);
    if (!unitCode || !meterType || Number.isNaN(current)) {
      errors.push({ line: idx + 1, message: 'Expected unitCode, meterType, currentReading' });
      return;
    }
    rows.push({ unitCode: unitCode.toUpperCase(), meterType: meterType.toUpperCase(), currentReading: current, readingDate: readingDate || undefined, previousReading: previousRaw ? Number(previousRaw) : undefined, line: idx + 1 });
  });
  return { rows, errors };
}

class MeterService {
  private async lastReading(societyId: string, unitId: string, meterType: string) {
    return MeterReading.findOne({ societyId, unitId, meterType }).sort({ readingDate: -1, createdAt: -1 }).lean();
  }

  async record(societyId: string, input: ReadingInput, byUserId: string, source: 'MANUAL' | 'IMPORT' | 'API' = 'MANUAL', req?: any) {
    const unit = await Unit.findOne({ _id: input.unitId, societyId, deletedAt: null });
    if (!unit) throw Errors.validation({ unitId: ['Unknown unit'] });
    const meterType = input.meterType.toUpperCase();
    const meter = unit.meters.find((m) => m.type === meterType);
    const last = await this.lastReading(societyId, String(unit._id), meterType);
    const previousReading = input.previousReading ?? last?.currentReading ?? meter?.lastReading ?? 0;
    if (input.currentReading < previousReading) throw Errors.validation({ currentReading: [`Reading (${input.currentReading}) is lower than the previous reading (${previousReading})`] });
    const multiplier = meter?.multiplier ?? 1;
    const readingDate = input.readingDate ?? new Date();
    const consumption = round2((input.currentReading - previousReading) * multiplier);
    const reading = await MeterReading.create({ societyId, unitId: unit._id, meterType, meterNumber: input.meterNumber ?? meter?.meterNumber, previousReading, currentReading: input.currentReading, multiplier, consumption, readingDate, period: { from: input.periodFrom, to: input.periodTo, label: input.periodFrom ? dayjs(input.periodFrom).format('MMM YYYY') : undefined }, source, notes: input.notes, recordedBy: byUserId });
    // keep the unit's meter card in sync (creates the meter entry the first time)
    if (meter) {
      meter.lastReading = input.currentReading;
      meter.lastReadingAt = readingDate;
    } else {
      unit.meters.push({ type: meterType, meterNumber: input.meterNumber, multiplier: 1, lastReading: input.currentReading, lastReadingAt: readingDate, active: true } as any);
    }
    await unit.save();
    auditService.record({ action: 'billing.meter_reading_recorded', resource: 'MeterReading', resourceId: reading._id, societyId, newValue: { unit: unit.code, meterType, currentReading: input.currentReading, consumption }, req });
    return reading.toJSON();
  }

  async bulk(societyId: string, readings: ReadingInput[], byUserId: string, req?: any) {
    const results: { unitId: string; meterType: string; ok: boolean; error?: string; consumption?: number }[] = [];
    for (const r of readings) {
      try {
        const saved: any = await this.record(societyId, r, byUserId, 'MANUAL', req);
        results.push({ unitId: r.unitId, meterType: r.meterType, ok: true, consumption: saved.consumption });
      } catch (err: any) {
        results.push({ unitId: r.unitId, meterType: r.meterType, ok: false, error: err?.details?.fields ? Object.values(err.details.fields).flat().join('; ') : err?.message ?? 'Failed' });
      }
    }
    return { total: readings.length, saved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  async importCsv(societyId: string, input: { csv: string; meterType?: string; readingDate?: Date }, byUserId: string, req?: any) {
    const { rows, errors } = parseMeterCsv(input.csv);
    const codes = [...new Set(rows.map((r) => r.unitCode))];
    const units = await Unit.find({ societyId, code: { $in: codes }, deletedAt: null }).select('code').lean();
    const byCode = new Map(units.map((u) => [u.code, String(u._id)]));
    const results: { line: number; unitCode: string; ok: boolean; error?: string; consumption?: number }[] = errors.map((e) => ({ line: e.line, unitCode: '', ok: false, error: e.message }));
    for (const r of rows) {
      const unitId = byCode.get(r.unitCode);
      if (!unitId) {
        results.push({ line: r.line, unitCode: r.unitCode, ok: false, error: 'Unknown unit code' });
        continue;
      }
      try {
        const saved: any = await this.record(societyId, { unitId, meterType: input.meterType ?? r.meterType, currentReading: r.currentReading, previousReading: r.previousReading, readingDate: r.readingDate ? new Date(r.readingDate) : input.readingDate }, byUserId, 'IMPORT', req);
        results.push({ line: r.line, unitCode: r.unitCode, ok: true, consumption: saved.consumption });
      } catch (err: any) {
        results.push({ line: r.line, unitCode: r.unitCode, ok: false, error: err?.details?.fields ? Object.values(err.details.fields).flat().join('; ') : err?.message ?? 'Failed' });
      }
    }
    auditService.record({ action: 'billing.meter_readings_imported', resource: 'MeterReading', societyId, metadata: { rows: rows.length, saved: results.filter((r) => r.ok).length }, req });
    return { total: rows.length + errors.length, saved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results: results.sort((a, b) => a.line - b.line) };
  }

  async list(societyId: string, query: Record<string, any>, scope: { unitIds?: string[] } = {}) {
    const filter: Record<string, unknown> = { societyId };
    if (scope.unitIds) filter.unitId = { $in: scope.unitIds };
    if (query.unitId) filter.unitId = scope.unitIds ? { $in: scope.unitIds.filter((u) => u === query.unitId) } : query.unitId;
    if (query.meterType) filter.meterType = String(query.meterType).toUpperCase();
    if (query.billed !== undefined) filter.billed = query.billed;
    if (query.from || query.to) filter.readingDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    return paginate(MeterReading as any, filter, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-readingDate', allowedSorts: ['readingDate', 'consumption', 'meterType', 'createdAt'], populate: [{ path: 'unitId', select: 'code buildingId', populate: { path: 'buildingId', select: 'name' } }, { path: 'recordedBy', select: 'name' }] });
  }

  async remove(societyId: string, id: string, req?: any): Promise<void> {
    const reading = await MeterReading.findOne({ _id: id, societyId });
    if (!reading) throw Errors.notFound('Meter reading');
    if (reading.billed) throw Errors.conflict('This reading is already billed; cancel the invoice first');
    await reading.deleteOne();
    auditService.record({ action: 'billing.meter_reading_deleted', resource: 'MeterReading', resourceId: id, societyId, req });
  }

  /** Meter types in use for the society (for filters and charge-head setup). */
  async meterTypes(societyId: string): Promise<string[]> {
    const [fromUnits, fromReadings] = await Promise.all([Unit.distinct('meters.type', { societyId, deletedAt: null }), MeterReading.distinct('meterType', { societyId })]);
    return [...new Set([...fromUnits, ...fromReadings].map((t) => String(t).toUpperCase()))].sort();
  }
}

export const meterService = new MeterService();
