import dayjs from 'dayjs';
import { domainEvents } from '../../core/events/event-bus';
import { notificationService } from '../../core/notifications/notification.service';
import { realtime } from '../../core/realtime/socket';
import { jobQueue } from '../../core/jobs/queue';
import { JobNames, registerJobHandlers } from '../../core/jobs/scheduler';
import { logger } from '../../lib/logger';
import { contractService } from './contracts.service';
import { assetService } from './assets.service';
import { inventoryService } from './inventory.service';

const fmt = (d: unknown) => dayjs(d as Date).format('DD MMM YYYY');

for (const event of ['contracts.changed', 'assets.changed', 'inventory.changed']) {
  domainEvents.on(event, ({ payload, societyId }) => { if (societyId) realtime.toSociety(societyId, event, payload); });
}

// ------------------------------------------------------------------ contracts
domainEvents.on('contract.expiring', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'contracts:renew' }, type: 'contract.expiring', vars: { title: payload.title, vendorName: payload.vendorName ?? '', endDate: fmt(payload.endDate), daysRemaining: payload.daysRemaining }, data: { contractId: payload.contractId, reminderDay: payload.reminderDay }, link: `/app/contracts?contract=${payload.contractId}`, priority: payload.daysRemaining <= 7 ? 'HIGH' : 'NORMAL', socketEvent: 'contracts.changed' });
});

domainEvents.on('contract.expired', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'contracts:renew' }, type: 'contract.expired', vars: { title: payload.title, vendorName: payload.vendorName ?? '', endDate: fmt(payload.endDate) }, data: { contractId: payload.contractId }, link: `/app/contracts?contract=${payload.contractId}`, priority: 'HIGH', socketEvent: 'contracts.changed' });
});

domainEvents.on('contract.visit_due', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'contracts:update' }, type: 'contract.visit_due', vars: { title: payload.title, vendorName: payload.vendorName ?? '', dueDate: fmt(payload.dueDate) }, data: { contractId: payload.contractId }, link: `/app/contracts?contract=${payload.contractId}`, socketEvent: 'contracts.changed' });
});

// ------------------------------------------------------------------ assets
domainEvents.on('asset.maintenance_due', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'assets:maintain' }, type: 'asset.maintenance_due', vars: { name: payload.name, assetCode: payload.assetCode, dueDate: fmt(payload.dueDate), location: payload.location ?? '' }, data: { assetId: payload.assetId, overdue: payload.overdue }, link: `/app/assets?asset=${payload.assetId}`, priority: payload.overdue ? 'HIGH' : 'NORMAL', socketEvent: 'assets.changed' });
});

domainEvents.on('asset.warranty_expiring', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { permission: 'assets:update' }, type: 'asset.warranty_expiring', vars: { name: payload.name, assetCode: payload.assetCode, warrantyUntil: fmt(payload.warrantyUntil) }, data: { assetId: payload.assetId }, link: `/app/assets?asset=${payload.assetId}`, socketEvent: 'assets.changed' });
});

// ------------------------------------------------------------------ inventory
domainEvents.on('inventory.low_stock', async ({ payload, societyId }) => {
  if (!societyId) return;
  await notificationService.notify({ societyId, recipients: { roleKeys: payload.roleKeys ?? [], permission: 'inventory:update' }, type: 'inventory.low_stock', vars: { itemName: payload.itemName, currentStock: `${payload.currentStock} ${payload.unit ?? ''}`.trim(), minimumLevel: payload.minimumLevel, reorderQuantity: payload.reorderQuantity ?? '' }, data: { itemId: payload.itemId }, link: `/app/inventory?item=${payload.itemId}`, socketEvent: 'inventory.changed' });
});

/** Goods received against a purchase order flow straight into stock for lines linked to an inventory item. */
domainEvents.on('purchase_order.received', async ({ payload, societyId, actorId }) => {
  if (!societyId || !Array.isArray(payload.received)) return;
  for (const r of payload.received as { itemId: string; receivedQuantity: number }[]) {
    const line = (payload.items ?? []).find((i: any) => i.itemId === r.itemId);
    if (!line?.inventoryItemId || !(r.receivedQuantity > 0)) continue;
    await inventoryService.transact(societyId, line.inventoryItemId, { type: 'IN', quantity: r.receivedQuantity, unitCost: line.rate ?? undefined, reference: { type: 'PURCHASE_ORDER', id: payload.poId, label: payload.poNumber }, note: `Received against ${payload.poNumber}`, clientRef: `po:${payload.poId}:${r.itemId}:${line.receivedQuantity}` }, actorId ?? null).catch((err) => logger.error({ err, po: payload.poNumber }, 'Stock-in from purchase order failed'));
  }
});

registerJobHandlers(() => {
  jobQueue.register(JobNames.CONTRACT_REMIND, async () => {
    const r = await contractService.sweep();
    if (r.expired || r.reminders || r.visits) logger.info(r, 'Contract sweep');
  });
  jobQueue.register(JobNames.ASSET_REMIND, async () => {
    const r = await assetService.sweep();
    if (r.maintenance || r.warranty) logger.info(r, 'Asset reminder sweep');
  });
  jobQueue.register(JobNames.INVENTORY_LOW_STOCK, async () => {
    const r = await inventoryService.sweep();
    if (r.alerts) logger.info(r, 'Low stock sweep');
  });
});
