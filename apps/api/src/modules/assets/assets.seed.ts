import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Asset } from '../../models/asset.model';
import { Vendor } from '../../models/vendor.model';
import { logger } from '../../lib/logger';
import { assetService } from './assets.service';
import { contractService } from './contracts.service';
import { inventoryService } from './inventory.service';

/** Demo asset register, an AMC covering the lifts, and a small store with one item already below its minimum. */
registerSeedHooks('assets', async ({ societyId, adminUserId }) => {
  if (await Asset.countDocuments({ societyId })) return;
  const vendors = await Vendor.find({ societyId, deletedAt: null }).select('_id name categoryKey').lean();
  const pick = (needle: string) => vendors.find((v) => `${v.name} ${v.categoryKey}`.toLowerCase().includes(needle))?._id;
  const liftVendor = pick('lift') ?? pick('elevator') ?? vendors[0]?._id;
  const electrical = pick('electric') ?? vendors[1]?._id ?? vendors[0]?._id;

  const lift1: any = await assetService.create(societyId, { name: 'Passenger lift · Tower A', categoryKey: 'LIFT', location: 'Tower A lobby', make: 'Otis', model: 'Gen2', serialNumber: 'OT-A-2019-114', purchaseDate: dayjs().subtract(5, 'year').toDate(), purchaseCost: 1_850_000, expectedLifeYears: 20, warrantyUntil: dayjs().subtract(3, 'year').toDate(), maintenanceIntervalMonths: 3, vendorId: liftVendor ? String(liftVendor) : undefined, custodian: 'Facility manager' }, adminUserId);
  const lift2: any = await assetService.create(societyId, { name: 'Passenger lift · Tower B', categoryKey: 'LIFT', location: 'Tower B lobby', make: 'Otis', model: 'Gen2', serialNumber: 'OT-B-2019-115', purchaseDate: dayjs().subtract(5, 'year').toDate(), purchaseCost: 1_850_000, expectedLifeYears: 20, maintenanceIntervalMonths: 3, vendorId: liftVendor ? String(liftVendor) : undefined }, adminUserId);
  const genset: any = await assetService.create(societyId, { name: 'Diesel generator 125 kVA', categoryKey: 'GENERATOR', location: 'Utility yard', make: 'Kirloskar', model: 'KG1-125', serialNumber: 'KG-2021-0098', purchaseDate: dayjs().subtract(3, 'year').toDate(), purchaseCost: 1_100_000, expectedLifeYears: 15, warrantyUntil: dayjs().add(40, 'day').toDate(), maintenanceIntervalMonths: 6, nextMaintenanceDue: dayjs().subtract(10, 'day').toDate() }, adminUserId);
  await assetService.create(societyId, { name: 'Bore-well pump 7.5 HP', categoryKey: 'PUMP', location: 'Pump room', make: 'Kirloskar', purchaseDate: dayjs().subtract(2, 'year').toDate(), purchaseCost: 65_000, expectedLifeYears: 8, maintenanceIntervalMonths: 12 }, adminUserId);
  const cctv: any = await assetService.create(societyId, { name: 'CCTV system (32 cameras + NVR)', categoryKey: 'CCTV', location: 'Security room', make: 'Hikvision', purchaseDate: dayjs().subtract(18, 'month').toDate(), purchaseCost: 240_000, expectedLifeYears: 6, warrantyUntil: dayjs().add(6, 'month').toDate(), vendorId: electrical ? String(electrical) : undefined }, adminUserId);
  await assetService.create(societyId, { name: 'Fire extinguishers (set of 40)', categoryKey: 'FIRE_SAFETY', location: 'All floors', purchaseDate: dayjs().subtract(1, 'year').toDate(), purchaseCost: 48_000, expectedLifeYears: 5, maintenanceIntervalMonths: 12, nextMaintenanceDue: dayjs().add(20, 'day').toDate() }, adminUserId);
  await assetService.logMaintenance(societyId, genset.id, { at: dayjs().subtract(7, 'month').toDate(), type: 'PREVENTIVE', description: 'Half-yearly service: oil, filters, load test 45 min.', cost: 8_500, vendorName: 'Kirloskar service', nextDue: dayjs().subtract(10, 'day').toDate() }, adminUserId);
  await assetService.logMaintenance(societyId, cctv.id, { at: dayjs().subtract(2, 'month').toDate(), type: 'BREAKDOWN', description: 'Camera 14 (basement ramp) replaced under warranty.', cost: 0, downtimeHours: 30 }, adminUserId);

  if (liftVendor) {
    const amc: any = await contractService.create(societyId, { title: 'Lift AMC (comprehensive)', type: 'AMC', vendorId: String(liftVendor), startDate: dayjs().subtract(9, 'month').startOf('month').toDate(), endDate: dayjs().add(3, 'month').endOf('month').toDate(), value: 96_000, billingCycle: 'QUARTERLY', amountPerCycle: 24_000, autoRenew: true, noticePeriodDays: 30, assetIds: [lift1.id, lift2.id], visitFrequencyMonths: 1, scope: 'Monthly preventive visits, breakdown attendance within 4 hours, parts included except ropes and motor.', contact: { name: 'Service desk', phone: '1800-123-4567' }, activate: true }, adminUserId);
    await contractService.logVisit(societyId, amc.id, { at: dayjs().subtract(20, 'day').toDate(), note: 'Monthly check: door sensors calibrated, brake pads OK.' }, adminUserId);
    await contractService.recordPayment(societyId, amc.id, { amount: 24_000, billDate: dayjs().subtract(2, 'month').toDate(), billNumber: 'AMC/Q3', description: 'AMC Q3 instalment', submit: true }, adminUserId).catch(() => undefined);
  }
  if (electrical) {
    await contractService.create(societyId, { title: 'Housekeeping services', type: 'SERVICE', vendorId: String(electrical), startDate: dayjs().subtract(11, 'month').toDate(), endDate: dayjs().add(25, 'day').toDate(), value: 720_000, billingCycle: 'MONTHLY', amountPerCycle: 60_000, noticePeriodDays: 30, activate: true }, adminUserId);
    await contractService.create(societyId, { title: 'Generator AMC', type: 'AMC', vendorId: String(electrical), startDate: dayjs().add(10, 'day').toDate(), endDate: dayjs().add(1, 'year').add(10, 'day').toDate(), value: 30_000, billingCycle: 'ANNUAL', amountPerCycle: 30_000, assetIds: [genset.id], visitFrequencyMonths: 6 }, adminUserId);
  }

  const items: [string, string, string, number, number, number, number][] = [
    ['Floor cleaner 5L', 'CLEANING', 'ltr', 10, 5, 4, 320],
    ['Garbage bags (roll of 30)', 'CLEANING', 'roll', 20, 10, 32, 90],
    ['LED bulb 9W', 'ELECTRICAL', 'nos', 15, 10, 8, 110],
    ['Tube light 20W', 'ELECTRICAL', 'nos', 10, 6, 14, 180],
    ['PVC tape', 'PLUMBING', 'nos', 5, 5, 12, 25],
    ['Ball valve 1"', 'PLUMBING', 'nos', 3, 2, 2, 260],
    ['A4 paper (ream)', 'STATIONERY', 'ream', 4, 2, 6, 280],
    ['Safety gloves (pair)', 'SAFETY', 'pair', 6, 4, 1, 60],
  ];
  for (const [name, categoryKey, unit, minimumLevel, reorderQuantity, openingStock, unitCost] of items) {
    const item: any = await inventoryService.create(societyId, { name, categoryKey, unit, minimumLevel, reorderQuantity, openingStock, unitCost, location: 'Store room' }, adminUserId);
    if (openingStock > minimumLevel + 2) await inventoryService.transact(societyId, item.id, { type: 'OUT', quantity: 2, issuedTo: 'Housekeeping', note: 'Weekly issue' }, adminUserId);
  }
  logger.info({ societyId }, 'Demo assets, contracts and inventory created');
});
