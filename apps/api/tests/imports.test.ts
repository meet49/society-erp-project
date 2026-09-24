import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { parseCsv } from '../src/modules/imports/import.parser';
import { Unit } from '../src/models/unit.model';
import { Resident } from '../src/models/resident.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let otherAdmin = '';
const get = (path: string, token: string) => api.get(`/api/v1${path}`).set(auth(token));
const post = (path: string, token: string, body: Record<string, unknown>) => api.post(`/api/v1${path}`).set(auth(token)).send(body);
const uploadCsv = (token: string, type: string, csv: string, name = 'data.csv', contentType = 'text/csv') => api.post('/api/v1/society/import/upload').set(auth(token)).field('type', type).attach('file', Buffer.from(csv, 'utf8'), { filename: name, contentType });
const waitFor = async (token: string, id: string, status: string, tries = 40) => { for (let i = 0; i < tries; i += 1) { const r = await get(`/society/import/${id}`, token); if (r.body.data.status === status) return r.body.data; await flush(100); } throw new Error(`Import did not reach ${status}`); };

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  const other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
});
afterAll(teardownTestApp);

describe('data import', () => {
  let unitsJob = '';
  it('parses CSV edge cases', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n1,2\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
    expect(parseCsv('﻿h1,h2\n,\n')).toEqual([['h1', 'h2']]);
  });

  it('lists types and templates the caller may use', async () => {
    const types = await get('/society/import/types', admin);
    expect(types.status).toBe(200);
    expect(types.body.data.map((t: any) => t.type)).toEqual(expect.arrayContaining(['UNITS', 'RESIDENTS', 'VEHICLES', 'STAFF', 'ASSETS', 'INVENTORY_ITEMS']));
    const tpl = await get('/society/import/templates/UNITS', admin);
    expect(tpl.headers['content-type']).toContain('text/csv');
    expect(tpl.text).toContain('Building code');
    expect((await get('/society/import/templates/NOPE', admin)).status).toBe(422);
  });

  it('uploads a sheet, suggests the mapping, validates with row-level errors and imports units through the service', async () => {
    const csv = ['Tower,Tower name,Flat No,Floor,Type,Area,BHK,Occupancy,Opening balance', 'A,Tower A,101,1,FLAT,1150,2,Owner occupied,0', 'A,Tower A,102,1,FLAT,1450,3,Tenant occupied,"2,500"', 'A,Tower A,101,1,FLAT,1150,2,,0', 'B,Tower B,,2,FLAT,900,1,VACANT,0', 'B,Tower B,201,2,FLAT,abc,1,VACANT,0'].join('\n');
    const up = await uploadCsv(admin, 'UNITS', csv);
    expect(up.status).toBe(201);
    unitsJob = up.body.data.id;
    expect(up.body.data.status).toBe('UPLOADED');
    expect(up.body.data.totalRows).toBe(5);
    expect(up.body.data.headers).toHaveLength(9);
    expect(up.body.data.mapping).toMatchObject({ buildingCode: 'Tower', number: 'Flat No', floor: 'Floor', areaSqft: 'Area', bedrooms: 'BHK', occupancyStatus: 'Occupancy', openingBalance: 'Opening balance' });
    expect((await get(`/society/import/${unitsJob}`, otherAdmin)).status).toBe(404);
    const bad = await api.put(`/api/v1/society/import/${unitsJob}/mapping`).set(auth(admin)).send({ mapping: { buildingCode: 'Tower' } });
    expect(bad.status).toBe(422);
    const validated = await api.put(`/api/v1/society/import/${unitsJob}/mapping`).set(auth(admin)).send({ mapping: up.body.data.mapping, options: { skipExisting: true } });
    expect(validated.status).toBe(200);
    expect(validated.body.data.status).toBe('VALIDATED');
    expect(validated.body.data.validation.ok).toBe(2);
    expect(validated.body.data.validation.failed).toBe(3);
    const messages = validated.body.data.validation.errors.map((e: any) => `${e.row}:${e.message}`);
    expect(messages).toEqual(expect.arrayContaining([expect.stringContaining('4:Duplicate'), expect.stringContaining('5:Unit number is required')]));
    expect(messages.some((m: string) => m.startsWith('6:'))).toBe(true);
    const started = await post(`/society/import/${unitsJob}/run`, admin, {});
    expect(started.body.data.status).toBe('QUEUED');
    const done = await waitFor(admin, unitsJob, 'COMPLETED');
    // the in-file duplicate hits the freshly created unit and is skipped (not failed) at run time
    expect(done.progress).toMatchObject({ processed: 5, succeeded: 2, failed: 2, skipped: 1 });
    expect(await Unit.countDocuments({ societyId: s.societyId, deletedAt: null })).toBe(2);
    const unit102 = await Unit.findOne({ societyId: s.societyId, number: '102' }).lean();
    expect(unit102!.code).toBe('A-102');
    expect(unit102!.openingBalance).toBe(2500);
    expect(unit102!.occupancyStatus).toBe('TENANT_OCCUPIED');
    const errors = await get(`/society/import/${unitsJob}/errors.csv`, admin);
    expect(errors.text).toContain('Unit number is required');
    // re-running the same file skips what exists instead of failing
    const again = await uploadCsv(admin, 'UNITS', csv);
    await api.put(`/api/v1/society/import/${again.body.data.id}/mapping`).set(auth(admin)).send({ mapping: again.body.data.mapping });
    await post(`/society/import/${again.body.data.id}/run`, admin, {});
    const done2 = await waitFor(admin, again.body.data.id, 'COMPLETED');
    expect(done2.progress).toMatchObject({ succeeded: 0, skipped: 3, failed: 2 });
  });

  it('imports residents against unit codes, rejecting unknown units, and lists the history', async () => {
    const csv = ['Unit,Name,Type,Mobile,Email,Primary', 'A-101,Asha Rao,owner,9876543210,asha@example.com,yes', 'A-102,Bharat Iyer,Tenant,9876501234,,y', 'Z-999,Nobody,OWNER,,,'].join('\n');
    const up = await uploadCsv(admin, 'RESIDENTS', csv, 'residents.csv');
    expect(up.status).toBe(201);
    expect(up.body.data.mapping).toMatchObject({ unitCode: 'Unit', name: 'Name', type: 'Type', phone: 'Mobile', email: 'Email', isPrimary: 'Primary' });
    const validated = await api.put(`/api/v1/society/import/${up.body.data.id}/mapping`).set(auth(admin)).send({ mapping: up.body.data.mapping });
    expect(validated.body.data.validation).toMatchObject({ ok: 2, failed: 1 });
    expect(validated.body.data.validation.errors[0].message).toContain('Z-999');
    await post(`/society/import/${up.body.data.id}/run`, admin, {});
    const done = await waitFor(admin, up.body.data.id, 'COMPLETED');
    expect(done.progress).toMatchObject({ succeeded: 2, failed: 1 });
    const residents = await Resident.find({ societyId: s.societyId }).lean();
    expect(residents).toHaveLength(2);
    expect(residents.find((r) => r.name === 'Asha Rao')!.type).toBe('OWNER');
    expect(residents.find((r) => r.name === 'Bharat Iyer')!.isPrimary).toBe(true);
    const history = await get('/society/import', admin);
    expect(history.body.data.length).toBeGreaterThanOrEqual(3);
    expect(history.body.data[0].createdBy.name).toBeTruthy();
    expect((await get('/society/import', otherAdmin)).body.data).toHaveLength(0);
    // a job that already ran cannot be cancelled or re-run
    expect((await post(`/society/import/${up.body.data.id}/run`, admin, {})).status).toBe(409);
    expect((await post(`/society/import/${up.body.data.id}/cancel`, admin, {})).status).toBe(409);
  });

  it('refuses files that are not spreadsheets and empty sheets', async () => {
    expect((await uploadCsv(admin, 'UNITS', 'not a sheet', 'notes.pdf', 'application/pdf')).status).toBe(422);
    expect((await uploadCsv(admin, 'UNITS', '\n\n', 'empty.csv')).status).toBe(422);
    expect((await api.post('/api/v1/society/import/upload').set(auth(admin)).field('type', 'UNITS')).status).toBe(422);
  });
});
