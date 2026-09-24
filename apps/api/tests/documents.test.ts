import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { setupTestApp, teardownTestApp, login, auth, createSociety, flush } from './helpers/app';
import { Notification } from '../src/models/notification.model';
import { Document } from '../src/models/document.model';

let api: Awaited<ReturnType<typeof setupTestApp>>['api'];
let s: Awaited<ReturnType<typeof createSociety>>;
let other: Awaited<ReturnType<typeof createSociety>>;
let admin = '';
let otherAdmin = '';
let staff = '';
let staffUserId = '';
let m1 = '';
let m2 = '';
let unitA = '';
let file1: any;
const post = (path: string, token: string, body: Record<string, unknown>) => api.post(`/api/v1${path}`).set(auth(token)).send(body);
const get = (path: string, token: string) => api.get(`/api/v1${path}`).set(auth(token));

async function upload(token: string, name: string, content: string, type = 'text/plain') {
  const res = await api.post('/api/v1/files/upload').set(auth(token)).field('scope', 'documents').attach('file', Buffer.from(content), { filename: name, contentType: type });
  return res;
}

beforeAll(async () => {
  ({ api } = await setupTestApp());
  s = await createSociety({ planSlug: 'growth' });
  other = await createSociety({ planSlug: 'growth' });
  admin = (await login(api, s.adminEmail, s.adminPassword)).accessToken;
  otherAdmin = (await login(api, other.adminEmail, other.adminPassword)).accessToken;
  const b = (await post('/buildings', admin, { name: 'Tower A', code: 'A', floors: 1 })).body.data;
  unitA = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '101' })).body.data.id;
  const unitB = (await post('/units', admin, { buildingId: b.id, floor: 1, number: '102' })).body.data.id;
  const roles = (await get('/society/roles', admin)).body.data;
  const memberRole = roles.find((r: any) => r.key === 'MEMBER').id;
  for (const [unitId, name] of [[unitA, 'Asha'], [unitB, 'Bharat']] as const) {
    const resident = (await post('/residents', admin, { unitId, name: `${name} Member`, email: `${name.toLowerCase()}-${Date.now()}@test.local`, phone: `9000${Math.floor(Math.random() * 900000) + 100000}`, type: 'OWNER' })).body.data;
    const invite = await post(`/residents/${resident.id}/invite`, admin, { roleIds: [memberRole] });
    const accepted = await api.post('/api/v1/auth/invitations/accept').send({ token: invite.body.data.inviteUrl.split('token=')[1], password: 'Member@12345' });
    if (name === 'Asha') m1 = accepted.body.data.accessToken; else m2 = accepted.body.data.accessToken;
  }
  const staffEmail = `staff-${Date.now()}@test.local`;
  const created = await post('/society/users', admin, { name: 'Office Staff', email: staffEmail, password: 'Staff@12345', roleIds: [roles.find((r: any) => r.key === 'COMMITTEE').id] });
  staffUserId = created.body.data.user?.id ?? created.body.data.id;
  staff = (await login(api, staffEmail, 'Staff@12345')).accessToken;
});
afterAll(teardownTestApp);

describe('documents', () => {
  let folderId = '';
  let docId = '';
  it('uploads files into the society namespace and creates a document in a folder', async () => {
    const up = await upload(admin, 'bye-laws.txt', 'Society bye-laws v1');
    expect(up.status).toBe(201);
    file1 = up.body.data;
    expect(file1.storageKey).toMatch(new RegExp(`^societies/${s.societyId}/documents/`));
    expect(file1.url).toContain('/api/v1/files?');
    expect((await api.post('/api/v1/files/upload').set(auth(admin)).attach('file', Buffer.from('x'), { filename: 'evil.exe', contentType: 'application/x-msdownload' })).status).toBe(422);
    const folder = await post('/documents/folders', admin, { name: 'Legal', visibility: 'MEMBERS' });
    expect(folder.status).toBe(201);
    folderId = folder.body.data.id;
    expect((await post('/documents/folders', admin, { name: 'Legal' })).status).toBe(409);
    const created = await post('/documents', admin, { title: 'Society bye-laws', categoryKey: 'legal', folderId, tags: ['Rules', 'AGM'], visibility: 'MEMBERS', file: { storageKey: file1.storageKey, name: file1.name, mimeType: file1.mimeType, size: file1.size } });
    expect(created.status).toBe(201);
    docId = created.body.data.id;
    expect(created.body.data.status).toBe('ACTIVE');
    expect(created.body.data.version).toBe(1);
    expect(created.body.data.tags).toEqual(['rules', 'agm']);
    expect(created.body.data.storageKey).toBeUndefined(); // never exposed
    const foreign = await post('/documents', otherAdmin, { title: 'Steal', file: { storageKey: file1.storageKey, name: 'x.txt' } });
    expect(foreign.status).toBe(403); // another society cannot link our file
    expect((await get('/documents/folders', admin)).body.data[0].documentCount).toBe(1);
  });

  it('applies visibility and category rules for residents, unit-scoped documents and signed downloads', async () => {
    const mine = await get('/documents', m1);
    expect(mine.body.data.map((d: any) => d.id)).toEqual([docId]); // MEMBERS + LEGAL is member-visible by default
    const committeeOnly = (await post('/documents', admin, { title: 'Committee minutes draft', categoryKey: 'MEETING', visibility: 'COMMITTEE', file: { storageKey: (await upload(admin, 'minutes.txt', 'draft')).body.data.storageKey, name: 'minutes.txt' } })).body.data;
    expect((await get(`/documents/${committeeOnly.id}`, m1)).status).toBe(404);
    expect((await get(`/documents/${committeeOnly.id}`, staff)).status).toBe(200);
    const unitDoc = (await post('/documents', admin, { title: 'Sale deed A-101', categoryKey: 'UNIT', visibility: 'UNIT', unitIds: [unitA], file: { storageKey: (await upload(admin, 'deed.txt', 'deed')).body.data.storageKey, name: 'deed.txt' } })).body.data;
    expect((await get(`/documents/${unitDoc.id}`, m1)).status).toBe(200);
    expect((await get(`/documents/${unitDoc.id}`, m2)).status).toBe(404);
    // a member-visible document in a non-member category stays hidden from residents
    const invoiceDoc = (await post('/documents', admin, { title: 'Vendor invoice', categoryKey: 'INVOICE', visibility: 'MEMBERS', file: { storageKey: (await upload(admin, 'inv.txt', 'inv')).body.data.storageKey, name: 'inv.txt' } })).body.data;
    expect((await get(`/documents/${invoiceDoc.id}`, m1)).status).toBe(404);
    await api.put('/api/v1/documents/settings').set(auth(admin)).send({ memberVisibleCategories: ['SOCIETY', 'LEGAL', 'MEETING', 'INVOICE'] }).expect(200);
    expect((await get(`/documents/${invoiceDoc.id}`, m1)).status).toBe(200);
    // signed download
    const dl = await post(`/documents/${docId}/download`, m1, {});
    expect(dl.status).toBe(200);
    expect(dl.body.data.url).toContain('/api/v1/files?');
    const path = dl.body.data.url.replace(/^https?:\/\/[^/]+/, '');
    const fetched = await api.get(path);
    expect(fetched.status).toBe(200);
    expect(fetched.text).toBe('Society bye-laws v1');
    const tampered = await api.get(path.replace(/sig=[^&]+/, 'sig=deadbeefdeadbeef'));
    expect(tampered.status).toBe(403);
    expect((await Document.findById(docId).lean())!.downloadCount).toBe(1);
    expect((await get('/documents', otherAdmin)).body.data).toHaveLength(0);
  });

  it('keeps version history, archives and deletes (removing stored files)', async () => {
    const v2 = await upload(admin, 'bye-laws-v2.txt', 'Society bye-laws v2');
    const versioned = await post(`/documents/${docId}/versions`, admin, { file: { storageKey: v2.body.data.storageKey, name: v2.body.data.name, size: v2.body.data.size }, note: 'Approved at AGM' });
    expect(versioned.status).toBe(201);
    expect(versioned.body.data.version).toBe(2);
    expect(versioned.body.data.versions).toHaveLength(2);
    const latest = await post(`/documents/${docId}/download`, admin, {});
    expect((await api.get(latest.body.data.url.replace(/^https?:\/\/[^/]+/, ''))).text).toBe('Society bye-laws v2');
    const old = await post(`/documents/${docId}/download`, admin, { version: 1 });
    expect((await api.get(old.body.data.url.replace(/^https?:\/\/[^/]+/, ''))).text).toBe('Society bye-laws v1');
    expect((await post(`/documents/${docId}/archive`, admin, {})).body.data.status).toBe('ARCHIVED');
    expect((await get('/documents', m1)).body.data.map((d: any) => d.id)).not.toContain(docId);
    expect((await get('/documents?status=ARCHIVED', admin)).body.data.map((d: any) => d.id)).toContain(docId);
    expect((await api.delete(`/api/v1/documents/folders/${folderId}`).set(auth(admin))).status).toBe(409); // not empty
    expect((await api.delete(`/api/v1/documents/${docId}`).set(auth(staff))).status).toBe(403);
    expect((await api.delete(`/api/v1/documents/${docId}`).set(auth(admin))).status).toBe(204);
    expect((await api.get(latest.body.data.url.replace(/^https?:\/\/[^/]+/, ''))).status).toBe(404); // file gone
    expect((await api.delete(`/api/v1/documents/folders/${folderId}`).set(auth(admin))).status).toBe(204);
  });

  it('routes staff uploads through the document review workflow when required', async () => {
    await api.put('/api/v1/documents/settings').set(auth(admin)).send({ requireApprovalForStaffUploads: true }).expect(200);
    await api.put('/api/v1/society/workflows/document_approval').set(auth(admin)).send({ active: true }).expect(200);
    const up = await upload(staff, 'policy.txt', 'insurance policy');
    const created = await post('/documents', staff, { title: 'Fire insurance policy', categoryKey: 'LEGAL', visibility: 'MEMBERS', expiresAt: dayjs().add(20, 'day').toISOString(), file: { storageKey: up.body.data.storageKey, name: 'policy.txt' } });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING_APPROVAL');
    expect(created.body.data.workflow?.status).toBe('PENDING');
    expect((await get(`/documents/${created.body.data.id}`, m1)).status).toBe(404); // not visible until approved
    await flush(250);
    const pending = await get('/approvals?entityType=Document', admin);
    expect(pending.body.data).toHaveLength(1);
    expect((await post(`/documents/${created.body.data.id}/review`, staff, { decision: 'APPROVED' })).status).toBe(403);
    const reviewed = await post(`/documents/${created.body.data.id}/review`, admin, { decision: 'APPROVED', note: 'Looks right' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.status).toBe('ACTIVE');
    await flush(250);
    expect(await Notification.countDocuments({ societyId: s.societyId, userId: staffUserId, type: 'document.reviewed' })).toBe(1);
    expect((await get(`/documents/${created.body.data.id}`, m1)).status).toBe(200);
    expect((await post('/documents', staff, { title: 'Admin-only attempt', visibility: 'ADMIN', file: { storageKey: up.body.data.storageKey, name: 'policy.txt' } })).status).toBe(403);
    const stats = await get('/documents/stats', admin);
    expect(stats.body.data.expiring).toBe(1);
    expect(stats.body.data.sizeMb).toBeGreaterThanOrEqual(0);
    expect((await get('/documents?expiringOnly=true', admin)).body.data).toHaveLength(1);
  });
});
