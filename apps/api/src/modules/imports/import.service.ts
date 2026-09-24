import { ImportJob, type ImportJobDoc } from '../../models/import-job.model';
import { Unit } from '../../models/unit.model';
import { Building } from '../../models/building.model';
import { Resident } from '../../models/resident.model';
import { Vehicle } from '../../models/vehicle.model';
import { Staff } from '../../models/staff.model';
import { Asset } from '../../models/asset.model';
import { InventoryItem } from '../../models/inventory.model';
import { Errors } from '../../lib/errors';
import { paginate } from '../../lib/pagination';
import { toCsv } from '../../lib/csv';
import { logger } from '../../lib/logger';
import { auditService } from '../../core/audit/audit.service';
import { storageService } from '../../core/storage/storage.service';
import { realtime } from '../../core/realtime/socket';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames } from '../../core/jobs/scheduler';
import { unitService } from '../units/units.service';
import { residentService } from '../residents/residents.service';
import { vehicleService } from '../operations/vehicles.service';
import { staffService } from '../operations/staff.service';
import { assetService } from '../assets/assets.service';
import { inventoryService } from '../assets/inventory.service';
import { IMPORTS, IMPORTS_BY_TYPE, ROW_SCHEMAS, type ImportDefinition, type ImportType } from './import.definitions';
import { normalise, parseSheet } from './import.parser';

const MAX_ROWS = 5000;
const MAX_ERRORS = 500;
type Mapping = Record<string, string>;
interface RowError { row: number; field?: string; message: string }

class ImportService {
  definitions() { return IMPORTS.map((d) => ({ type: d.type, name: d.name, description: d.description, module: d.module, permission: d.permission, fields: d.fields, identity: d.identity })); }

  definition(type: string): ImportDefinition {
    const def = IMPORTS_BY_TYPE.get(type as ImportType);
    if (!def) throw Errors.notFound('Import type');
    return def;
  }

  /** CSV template with the sample rows for a type. */
  template(type: string): string {
    const def = this.definition(type);
    return toCsv(def.sample.map((row) => Object.fromEntries(def.fields.map((f) => [f.label, row[f.key] ?? '']))));
  }

  /** Guesses the column for each field from the header names (exact key, label, aliases, then fuzzy contains). */
  suggestMapping(def: ImportDefinition, headers: string[]): Mapping {
    const norm = headers.map((h) => normalise(h));
    const mapping: Mapping = {};
    const used = new Set<string>();
    for (const f of def.fields) {
      const candidates = [f.key, f.label, ...(f.aliases ?? [])].map(normalise);
      let idx = norm.findIndex((h, i) => !used.has(headers[i]) && candidates.includes(h));
      if (idx === -1) idx = norm.findIndex((h, i) => !used.has(headers[i]) && candidates.some((c) => c.length > 3 && (h.includes(c) || c.includes(h))));
      if (idx !== -1) { mapping[f.key] = headers[idx]; used.add(headers[idx]); }
    }
    return mapping;
  }

  // ------------------------------------------------------------------ lifecycle
  async upload(societyId: string, type: string, file: { buffer: Buffer; originalname: string; mimetype: string }, byUserId: string, req?: any) {
    const def = this.definition(type);
    const sheet = await parseSheet(file.buffer, file.originalname, file.mimetype);
    if (sheet.rows.length > MAX_ROWS) throw Errors.validation({ file: [`At most ${MAX_ROWS} rows per import; split the file`] });
    const stored = await storageService.store({ societyId, scope: 'imports', body: file.buffer, mimeType: file.mimetype || 'application/octet-stream', name: file.originalname, maxBytes: 20 * 1024 * 1024 });
    const job = await ImportJob.create({ societyId, type: def.type, fileName: file.originalname, storageKey: stored.storageKey, headers: sheet.headers, sampleRows: sheet.rows.slice(0, 5), totalRows: sheet.rows.length, mapping: this.suggestMapping(def, sheet.headers), createdBy: byUserId });
    auditService.record({ action: 'import.uploaded', resource: 'ImportJob', resourceId: job._id, societyId, newValue: { type: def.type, fileName: file.originalname, rows: sheet.rows.length }, req });
    return this.get(societyId, String(job._id));
  }

  async list(societyId: string, query: Record<string, any>) {
    return paginate(ImportJob as any, { societyId, ...(query.type ? { type: query.type } : {}), ...(query.status ? { status: query.status } : {}) }, { page: query.page, limit: query.limit, sort: query.sort, defaultSort: '-createdAt', allowedSorts: ['createdAt', 'status', 'type'], select: '-sampleRows -errors -validation.errors', populate: [{ path: 'createdBy', select: 'name' }] });
  }

  async get(societyId: string, id: string) {
    const doc = await ImportJob.findOne({ _id: id, societyId }).populate('createdBy', 'name').lean();
    if (!doc) throw Errors.notFound('Import');
    const def = IMPORTS_BY_TYPE.get(doc.type as ImportType)!;
    return { ...doc, id: String(doc._id), mapping: Object.fromEntries((doc.mapping as any) instanceof Map ? (doc.mapping as any) : Object.entries(doc.mapping ?? {})), definition: { type: def.type, name: def.name, fields: def.fields, identity: def.identity }, errors: (doc.errors ?? []).slice(0, 200), validation: { ...doc.validation, errors: (doc.validation?.errors ?? []).slice(0, 200) } };
  }

  private async load(societyId: string, id: string): Promise<ImportJobDoc> {
    const doc = await ImportJob.findOne({ _id: id, societyId });
    if (!doc) throw Errors.notFound('Import');
    return doc;
  }

  private async rows(job: ImportJobDoc): Promise<string[][]> {
    const buffer = await storageService.get(job.storageKey);
    return (await parseSheet(buffer, job.fileName, '')).rows;
  }

  private mapRow(def: ImportDefinition, mapping: Mapping, headers: string[], row: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of def.fields) { const col = mapping[f.key]; if (!col) continue; const idx = headers.indexOf(col); out[f.key] = idx === -1 ? '' : (row[idx] ?? ''); }
    return out;
  }

  private validateRow(def: ImportDefinition, data: Record<string, string>, rowNumber: number): { value?: Record<string, any>; errors: RowError[] } {
    const errors: RowError[] = [];
    for (const f of def.fields) if (f.required && !(data[f.key] ?? '').trim()) errors.push({ row: rowNumber, field: f.key, message: `${f.label} is required` });
    if (errors.length) return { errors };
    const parsed = ROW_SCHEMAS[def.type].safeParse(data);
    if (!parsed.success) return { errors: parsed.error.issues.map((i) => ({ row: rowNumber, field: String(i.path[0] ?? ''), message: i.message })) };
    return { value: parsed.data as Record<string, any>, errors: [] };
  }

  /** Saves the mapping and dry-runs every row: structure and lookups only, nothing is written. */
  async validate(societyId: string, id: string, input: { mapping: Mapping; options?: Record<string, unknown> }, byUserId: string, req?: any) {
    const job = await this.load(societyId, id);
    if (!['UPLOADED', 'VALIDATED'].includes(job.status)) throw Errors.invalidTransition(job.status, 'VALIDATED', 'Import');
    const def = this.definition(job.type);
    const missing = def.fields.filter((f) => f.required && !input.mapping[f.key]);
    if (missing.length) throw Errors.validation({ mapping: [`Map the required columns: ${missing.map((f) => f.label).join(', ')}`] });
    job.mapping = new Map(Object.entries(input.mapping)) as any;
    if (input.options) job.set('options', { ...(job.options as any)?.toObject?.() ?? job.options, ...input.options });
    const rows = await this.rows(job);
    const errors: RowError[] = [];
    let ok = 0;
    const lookups = await this.lookups(societyId, def);
    const seen = new Set<string>();
    for (const [i, row] of rows.entries()) {
      const rowNumber = i + 2;
      const data = this.mapRow(def, input.mapping, job.headers, row);
      const v = this.validateRow(def, data, rowNumber);
      if (v.errors.length) { errors.push(...v.errors); continue; }
      const ref = await this.checkReferences(def, v.value!, lookups, rowNumber);
      if (ref) { errors.push(ref); continue; }
      const key = def.identity.map((k) => String(v.value![k] ?? '').toLowerCase()).join('|');
      if (seen.has(key)) { errors.push({ row: rowNumber, message: 'Duplicate of an earlier row in this file' }); continue; }
      seen.add(key);
      ok += 1;
    }
    job.set('validation', { ok, failed: rows.length - ok, errors: errors.slice(0, MAX_ERRORS), at: new Date() });
    job.status = 'VALIDATED';
    await job.save();
    auditService.record({ action: 'import.validated', resource: 'ImportJob', resourceId: job._id, societyId, newValue: { ok, failed: rows.length - ok }, actor: { id: byUserId }, req });
    return this.get(societyId, id);
  }

  private async lookups(societyId: string, def: ImportDefinition) {
    const out: { units?: Map<string, string>; staffCategories?: Set<string>; assetCategories?: Set<string>; inventoryCategories?: Set<string> } = {};
    if (['RESIDENTS', 'VEHICLES'].includes(def.type)) out.units = new Map((await Unit.find({ societyId, deletedAt: null }).select('code').lean()).map((u) => [u.code.toUpperCase(), String(u._id)]));
    if (def.type === 'STAFF') out.staffCategories = new Set((await staffService.categories(societyId)).map((c: any) => c.key));
    if (def.type === 'ASSETS') out.assetCategories = new Set((await assetService.categories(societyId)).map((c: any) => c.key));
    if (def.type === 'INVENTORY_ITEMS') out.inventoryCategories = new Set((await inventoryService.categories(societyId)).map((c: any) => c.key));
    return out;
  }

  private async checkReferences(def: ImportDefinition, value: Record<string, any>, lookups: Awaited<ReturnType<ImportService['lookups']>>, row: number): Promise<RowError | null> {
    if (lookups.units && value.unitCode && !lookups.units.has(String(value.unitCode).toUpperCase())) return { row, field: 'unitCode', message: `Unit ${value.unitCode} does not exist` };
    if (lookups.staffCategories && !lookups.staffCategories.has(String(value.categoryKey).toUpperCase())) return { row, field: 'categoryKey', message: `Unknown staff category ${value.categoryKey}` };
    if (lookups.assetCategories && !lookups.assetCategories.has(String(value.categoryKey).toUpperCase())) return { row, field: 'categoryKey', message: `Unknown asset category ${value.categoryKey}` };
    if (lookups.inventoryCategories && !lookups.inventoryCategories.has(String(value.categoryKey).toUpperCase())) return { row, field: 'categoryKey', message: `Unknown inventory category ${value.categoryKey}` };
    return null;
  }

  /** Queues the run; the job handler does the writing so a 5,000-row file never blocks a request. */
  async start(societyId: string, id: string, byUserId: string, req?: any) {
    const job = await this.load(societyId, id);
    if (job.status !== 'VALIDATED') throw Errors.invalidTransition(job.status, 'QUEUED', 'Import');
    if (!job.validation?.ok) throw Errors.conflict('Nothing valid to import; fix the file and validate again');
    job.status = 'QUEUED';
    await job.save();
    await jobQueue.add(JobNames.IMPORT_RUN, { importId: String(job._id) }, { jobId: `import:${job._id}` });
    auditService.record({ action: 'import.started', resource: 'ImportJob', resourceId: job._id, societyId, newValue: { type: job.type, rows: job.totalRows }, actor: { id: byUserId }, req });
    return this.get(societyId, id);
  }

  async cancel(societyId: string, id: string, byUserId: string, req?: any) {
    const job = await this.load(societyId, id);
    if (!['UPLOADED', 'VALIDATED', 'QUEUED'].includes(job.status)) throw Errors.invalidTransition(job.status, 'CANCELLED', 'Import');
    job.status = 'CANCELLED';
    await job.save();
    auditService.record({ action: 'import.cancelled', resource: 'ImportJob', resourceId: job._id, societyId, actor: { id: byUserId }, req });
    return this.get(societyId, id);
  }

  async errorsCsv(societyId: string, id: string): Promise<string> {
    const job = await this.load(societyId, id);
    const errors = job.status === 'COMPLETED' || job.status === 'FAILED' ? job.errors : job.validation?.errors ?? [];
    return toCsv(errors.map((e) => ({ row: e.row, field: e.field ?? '', message: e.message })));
  }

  // ------------------------------------------------------------------ the run
  /** Job handler: writes row by row through the normal services so every rule, audit entry and event still applies. */
  async run(importId: string) {
    const job = await ImportJob.findById(importId);
    if (!job || job.status !== 'QUEUED') return;
    const societyId = String(job.societyId);
    const byUserId = String(job.createdBy);
    const def = this.definition(job.type);
    const mapping = Object.fromEntries(job.mapping as any) as Mapping;
    job.status = 'RUNNING';
    job.startedAt = new Date();
    const progress = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    job.set('progress', progress);
    job.errors = [] as any;
    await job.save();
    const notify = () => realtime.toUser(byUserId, 'import.progress', { importId, status: job.status, progress, totalRows: job.totalRows });
    try {
      const rows = await this.rows(job);
      const lookups = await this.lookups(societyId, def);
      const options = (job.options as any)?.toObject?.() ?? job.options ?? {};
      for (const [i, row] of rows.entries()) {
        const rowNumber = i + 2;
        const data = this.mapRow(def, mapping, job.headers, row);
        const v = this.validateRow(def, data, rowNumber);
        const ref = v.errors.length ? null : await this.checkReferences(def, v.value!, lookups, rowNumber);
        if (v.errors.length || ref) { progress.failed += 1; if (job.errors.length < MAX_ERRORS) job.errors.push(...(v.errors.length ? v.errors : [ref!]) as any); }
        else {
          try {
            const outcome = await this.writeRow(societyId, def, v.value!, options, lookups, byUserId);
            if (outcome === 'skipped') progress.skipped += 1; else progress.succeeded += 1;
          } catch (err: any) {
            progress.failed += 1;
            const message = err?.details?.fields ? Object.entries(err.details.fields).map(([k, v2]) => `${k}: ${(v2 as string[]).join(', ')}`).join('; ') : err?.message ?? 'Failed';
            if (job.errors.length < MAX_ERRORS) job.errors.push({ row: rowNumber, message } as any);
          }
        }
        progress.processed += 1;
        if (progress.processed % 25 === 0) { job.set('progress', progress); await job.save(); notify(); }
      }
      job.status = 'COMPLETED';
    } catch (err: any) {
      job.status = 'FAILED';
      job.failureReason = err?.message ?? 'Import failed';
      logger.error({ err, importId }, 'Import run failed');
    }
    job.finishedAt = new Date();
    job.set('progress', progress);
    await job.save();
    notify();
    auditService.record({ action: 'import.finished', resource: 'ImportJob', resourceId: job._id, societyId, newValue: { status: job.status, ...progress }, actor: { id: byUserId } });
    return progress;
  }

  private async writeRow(societyId: string, def: ImportDefinition, v: Record<string, any>, options: Record<string, any>, lookups: Awaited<ReturnType<ImportService['lookups']>>, byUserId: string): Promise<'created' | 'skipped'> {
    const skipExisting = options.skipExisting !== false;
    switch (def.type) {
      case 'UNITS': {
        const code = String(v.buildingCode).toUpperCase();
        let building = await Building.findOne({ societyId, code }).select('_id').lean();
        if (!building) building = (await unitService.createBuilding(societyId, { name: v.buildingName || code, code, type: 'TOWER', floors: 0 }, byUserId)) as any;
        const buildingId = String((building as any)._id ?? (building as any).id);
        const unitCode = `${code}-${String(v.number).toUpperCase()}`;
        if (await Unit.exists({ societyId, deletedAt: null, $or: [{ code: unitCode }, { buildingId, number: String(v.number) }] })) { if (skipExisting) return 'skipped'; throw Errors.conflict(`Unit ${unitCode} already exists`); }
        await unitService.create(societyId, { buildingId, number: String(v.number), floor: v.floor ?? 0, type: v.type ? String(v.type).toUpperCase() : 'FLAT', areaSqft: v.areaSqft ?? 0, bedrooms: v.bedrooms, occupancyStatus: v.occupancyStatus, openingBalance: v.openingBalance ?? 0 }, byUserId);
        return 'created';
      }
      case 'RESIDENTS': {
        const unitId = lookups.units!.get(String(v.unitCode).toUpperCase())!;
        if (await Resident.exists({ societyId, unitId, name: new RegExp(`^${String(v.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), deletedAt: null })) { if (skipExisting) return 'skipped'; throw Errors.conflict(`${v.name} already exists in ${v.unitCode}`); }
        await residentService.create(societyId, { unitId, name: v.name, type: v.type, phone: v.phone || '', email: v.email || '', isPrimary: v.isPrimary, relationship: v.relationship, moveInDate: v.moveInDate, notes: v.notes, createLogin: Boolean(options.sendInvites && v.email) }, byUserId);
        return 'created';
      }
      case 'VEHICLES': {
        const unitId = lookups.units!.get(String(v.unitCode).toUpperCase())!;
        const number = String(v.number).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (await Vehicle.exists({ societyId, number, deletedAt: null })) { if (skipExisting) return 'skipped'; throw Errors.conflict(`Vehicle ${number} already exists`); }
        await vehicleService.create(societyId, { unitId, number: v.number, type: v.type, make: v.make, model: v.model, color: v.color, stickerNumber: v.stickerNumber }, { userId: byUserId, ownScope: false, unitIds: [], residentId: null, canManage: true } as any);
        return 'created';
      }
      case 'STAFF': {
        if (v.phone && (await Staff.exists({ societyId, phone: v.phone, deletedAt: null }))) { if (skipExisting) return 'skipped'; throw Errors.conflict(`Staff with phone ${v.phone} already exists`); }
        await staffService.create(societyId, { name: v.name, categoryKey: v.categoryKey, phone: v.phone, designation: v.designation, employmentType: v.employmentType, shiftKey: v.shiftKey, joinedAt: v.joinedAt ?? null, salary: v.salaryAmount ? { amount: v.salaryAmount, cycle: 'MONTHLY' } : undefined }, byUserId);
        return 'created';
      }
      case 'ASSETS': {
        if (v.serialNumber && (await Asset.exists({ societyId, serialNumber: v.serialNumber, deletedAt: null }))) { if (skipExisting) return 'skipped'; throw Errors.conflict(`Asset with serial ${v.serialNumber} already exists`); }
        await assetService.create(societyId, { name: v.name, categoryKey: v.categoryKey, location: v.location, make: v.make, model: v.model, serialNumber: v.serialNumber, purchaseDate: v.purchaseDate ?? null, purchaseCost: v.purchaseCost ?? 0, warrantyUntil: v.warrantyUntil ?? null, expectedLifeYears: v.expectedLifeYears, maintenanceIntervalMonths: v.maintenanceIntervalMonths ?? 0 }, byUserId);
        return 'created';
      }
      case 'INVENTORY_ITEMS': {
        if (v.sku && (await InventoryItem.exists({ societyId, sku: String(v.sku).toUpperCase(), deletedAt: null }))) { if (skipExisting) return 'skipped'; throw Errors.conflict(`SKU ${v.sku} already exists`); }
        await inventoryService.create(societyId, { name: v.name, sku: v.sku || undefined, categoryKey: v.categoryKey, unit: v.unit || 'nos', minimumLevel: v.minimumLevel ?? 0, reorderQuantity: v.reorderQuantity ?? 0, unitCost: v.unitCost ?? 0, openingStock: v.openingStock ?? 0, location: v.location }, byUserId);
        return 'created';
      }
      default:
        throw Errors.badRequest('Unsupported import type');
    }
  }
}

export const importService = new ImportService();
