import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Document } from '../../models/document.model';
import { Unit } from '../../models/unit.model';
import { logger } from '../../lib/logger';
import { storageService } from '../../core/storage/storage.service';
import { documentService, type Actor } from './documents.service';

/** Demo repository: folders per audience and a few documents (text files stand in for PDFs). */
registerSeedHooks('documents', async ({ societyId, adminUserId }) => {
  if (await Document.countDocuments({ societyId })) return;
  const admin: Actor = { userId: adminUserId, level: 'ADMIN', unitIds: [], canApprove: true };
  const legal = await documentService.createFolder(societyId, { name: 'Legal & registration', visibility: 'MEMBERS' }, adminUserId);
  const minutes = await documentService.createFolder(societyId, { name: 'Meeting minutes', visibility: 'MEMBERS' }, adminUserId);
  const contracts = await documentService.createFolder(societyId, { name: 'Contracts & AMC', visibility: 'COMMITTEE' }, adminUserId);
  const file = async (name: string, body: string) => storageService.store({ societyId, scope: 'documents', body: Buffer.from(body, 'utf8'), mimeType: 'text/plain', name });
  const specs = [
    { title: 'Society bye-laws (registered copy)', categoryKey: 'LEGAL', folderId: legal.id, visibility: 'MEMBERS', tags: ['bye-laws', 'registration'], isPinned: true, body: 'Palm Grove Residency - registered bye-laws. Chapter 1: Membership...' },
    { title: 'Occupancy certificate', categoryKey: 'LEGAL', folderId: legal.id, visibility: 'MEMBERS', tags: ['oc'], body: 'Occupancy certificate issued by the municipal corporation.' },
    { title: 'AGM minutes - last year', categoryKey: 'MEETING', folderId: minutes.id, visibility: 'MEMBERS', tags: ['agm', 'minutes'], body: 'Minutes of the annual general meeting. Resolutions passed: 1) Accounts adopted...' },
    { title: 'Lift AMC - Schindler', categoryKey: 'CONTRACT', folderId: contracts.id, visibility: 'COMMITTEE', tags: ['amc', 'lift'], expiresAt: dayjs().add(25, 'day').toDate(), body: 'Annual maintenance contract for lifts, Tower A and B.' },
    { title: 'Fire insurance policy', categoryKey: 'LEGAL', folderId: contracts.id, visibility: 'COMMITTEE', tags: ['insurance'], expiresAt: dayjs().add(200, 'day').toDate(), body: 'Fire and perils insurance policy for the society building.' },
  ];
  for (const spec of specs) {
    const stored = await file(`${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`, spec.body);
    await documentService.create(societyId, { title: spec.title, categoryKey: spec.categoryKey, folderId: spec.folderId, visibility: spec.visibility, tags: spec.tags, isPinned: Boolean(spec.isPinned), expiresAt: spec.expiresAt ?? null, unitIds: [], file: { storageKey: stored.storageKey, name: stored.name, mimeType: stored.mimeType, size: stored.size } }, admin);
  }
  const unit = await Unit.findOne({ societyId, code: 'A-101' }).select('_id').lean();
  if (unit) {
    const stored = await file('a-101-share-certificate.txt', 'Share certificate for unit A-101.');
    await documentService.create(societyId, { title: 'Share certificate - A-101', categoryKey: 'UNIT', visibility: 'UNIT', unitIds: [String(unit._id)], tags: ['share-certificate'], file: { storageKey: stored.storageKey, name: stored.name, mimeType: stored.mimeType, size: stored.size } }, admin);
  }
  logger.info({ documents: specs.length + (unit ? 1 : 0) }, 'Demo documents created');
});
