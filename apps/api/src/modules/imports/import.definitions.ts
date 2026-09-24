import { z } from 'zod';
import type { ImportTypes } from '../../models/import-job.model';

export type ImportType = (typeof ImportTypes)[number];
export interface ImportField { key: string; label: string; required?: boolean; hint?: string; aliases?: string[] }
export interface ImportDefinition {
  type: ImportType;
  name: string;
  description: string;
  /** module that must be accessible and the permission needed to run it (besides society:import) */
  module: string;
  permission: string;
  fields: ImportField[];
  /** what a matching existing record looks like: used for "skip existing" */
  identity: string[];
  sample: Record<string, string>[];
}

const text = (max = 120) => z.string().trim().max(max);
const num = () => z.preprocess((v) => (v === '' || v === undefined ? undefined : Number(String(v).replace(/[,\s₹]/g, ''))), z.number().optional());
const date = () => z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date().optional());
const bool = () => z.preprocess((v) => (v === '' || v === undefined ? undefined : ['yes', 'y', 'true', '1'].includes(String(v).trim().toLowerCase())), z.boolean().optional());

export const IMPORTS: ImportDefinition[] = [
  {
    type: 'UNITS', name: 'Units', description: 'Flats / units with their building, floor, size and opening balance. Buildings are created on the fly from the building code.', module: 'units', permission: 'units:import',
    identity: ['buildingCode', 'number'],
    fields: [
      { key: 'buildingCode', label: 'Building code', required: true, hint: 'A, B, T1…', aliases: ['building', 'tower', 'wing', 'block'] },
      { key: 'buildingName', label: 'Building name', hint: 'Used when the building does not exist yet', aliases: ['towername', 'wingname'] },
      { key: 'number', label: 'Unit number', required: true, aliases: ['flat', 'flatno', 'unit', 'unitno', 'flatnumber'] },
      { key: 'floor', label: 'Floor', aliases: ['level'] },
      { key: 'type', label: 'Unit type', hint: 'FLAT, SHOP, OFFICE, VILLA…', aliases: ['unittype', 'category'] },
      { key: 'areaSqft', label: 'Area (sq ft)', aliases: ['area', 'sqft', 'builtup', 'carpetarea'] },
      { key: 'bedrooms', label: 'Bedrooms', aliases: ['bhk'] },
      { key: 'occupancyStatus', label: 'Occupancy', hint: 'VACANT, OWNER_OCCUPIED, TENANT_OCCUPIED, LOCKED', aliases: ['occupancy', 'status'] },
      { key: 'openingBalance', label: 'Opening balance', hint: 'Dues carried forward (negative = advance)', aliases: ['opening', 'balance', 'dues', 'outstanding'] },
    ],
    sample: [{ buildingCode: 'A', buildingName: 'Tower A', number: '101', floor: '1', type: 'FLAT', areaSqft: '1150', bedrooms: '2', occupancyStatus: 'OWNER_OCCUPIED', openingBalance: '0' }, { buildingCode: 'A', buildingName: 'Tower A', number: '102', floor: '1', type: 'FLAT', areaSqft: '1450', bedrooms: '3', occupancyStatus: 'TENANT_OCCUPIED', openingBalance: '2500' }],
  },
  {
    type: 'RESIDENTS', name: 'Residents', description: 'Owners, tenants and family members against existing unit codes, optionally inviting them to log in.', module: 'residents', permission: 'residents:import',
    identity: ['unitCode', 'name'],
    fields: [
      { key: 'unitCode', label: 'Unit code', required: true, hint: 'As shown in Units, e.g. A-101', aliases: ['unit', 'flat', 'flatno', 'code'] },
      { key: 'name', label: 'Name', required: true, aliases: ['residentname', 'fullname', 'owner', 'ownername'] },
      { key: 'type', label: 'Type', required: true, hint: 'OWNER, TENANT, FAMILY', aliases: ['residenttype', 'role'] },
      { key: 'phone', label: 'Phone', aliases: ['mobile', 'contact', 'phonenumber', 'mobileno'] },
      { key: 'email', label: 'Email', aliases: ['emailid', 'mail'] },
      { key: 'isPrimary', label: 'Primary contact', hint: 'yes / no', aliases: ['primary'] },
      { key: 'relationship', label: 'Relationship', hint: 'For family members', aliases: ['relation'] },
      { key: 'moveInDate', label: 'Move-in date', aliases: ['movein', 'since', 'joined'] },
      { key: 'notes', label: 'Notes', aliases: ['remarks', 'comment'] },
    ],
    sample: [{ unitCode: 'A-101', name: 'Asha Rao', type: 'OWNER', phone: '9876543210', email: 'asha@example.com', isPrimary: 'yes', relationship: '', moveInDate: '2021-06-01', notes: '' }, { unitCode: 'A-102', name: 'Bharat Iyer', type: 'TENANT', phone: '9876501234', email: '', isPrimary: 'yes', relationship: '', moveInDate: '2024-01-15', notes: 'Lease till Dec 2025' }],
  },
  {
    type: 'VEHICLES', name: 'Vehicles', description: 'Resident vehicles against unit codes, with stickers.', module: 'vehicles', permission: 'vehicles:create',
    identity: ['number'],
    fields: [
      { key: 'unitCode', label: 'Unit code', required: true, aliases: ['unit', 'flat', 'flatno'] },
      { key: 'number', label: 'Number plate', required: true, aliases: ['vehicleno', 'regno', 'registration', 'plate', 'vehiclenumber'] },
      { key: 'type', label: 'Type', hint: 'CAR, BIKE, SCOOTER, EV, BICYCLE, OTHER', aliases: ['vehicletype'] },
      { key: 'make', label: 'Make', aliases: ['brand', 'manufacturer'] },
      { key: 'model', label: 'Model' },
      { key: 'color', label: 'Colour', aliases: ['colour'] },
      { key: 'stickerNumber', label: 'Sticker number', aliases: ['sticker', 'stickerno', 'rfid'] },
    ],
    sample: [{ unitCode: 'A-101', number: 'KA01AB1234', type: 'CAR', make: 'Hyundai', model: 'Creta', color: 'White', stickerNumber: 'S-101' }],
  },
  {
    type: 'STAFF', name: 'Staff', description: 'Society and agency staff with category and shift.', module: 'staff', permission: 'staff:create',
    identity: ['name', 'phone'],
    fields: [
      { key: 'name', label: 'Name', required: true, aliases: ['staffname', 'employee', 'employeename'] },
      { key: 'categoryKey', label: 'Category', required: true, hint: 'SECURITY, HOUSEKEEPING, MAINTENANCE, GARDENING…', aliases: ['category', 'department', 'role'] },
      { key: 'phone', label: 'Phone', aliases: ['mobile', 'contact'] },
      { key: 'designation', label: 'Designation', aliases: ['title', 'post'] },
      { key: 'employmentType', label: 'Employment', hint: 'SOCIETY, AGENCY, CONTRACT', aliases: ['employment', 'type'] },
      { key: 'shiftKey', label: 'Shift', hint: 'GENERAL, MORNING, EVENING, NIGHT', aliases: ['shift'] },
      { key: 'joinedAt', label: 'Joined on', aliases: ['joining', 'joindate', 'doj'] },
      { key: 'salaryAmount', label: 'Monthly salary', aliases: ['salary', 'wage'] },
    ],
    sample: [{ name: 'Ramu Yadav', categoryKey: 'HOUSEKEEPING', phone: '9000011111', designation: 'Housekeeping', employmentType: 'SOCIETY', shiftKey: 'MORNING', joinedAt: '2022-04-01', salaryAmount: '12000' }],
  },
  {
    type: 'ASSETS', name: 'Assets', description: 'Fixed asset register with purchase details and warranty.', module: 'assets', permission: 'assets:create',
    identity: ['name', 'serialNumber'],
    fields: [
      { key: 'name', label: 'Asset name', required: true, aliases: ['asset', 'item', 'description'] },
      { key: 'categoryKey', label: 'Category', required: true, hint: 'LIFT, GENERATOR, PUMP, CCTV, FIRE_SAFETY, FURNITURE, ELECTRICAL, GYM, OTHER', aliases: ['category', 'type'] },
      { key: 'location', label: 'Location', aliases: ['where', 'place'] },
      { key: 'make', label: 'Make', aliases: ['brand', 'manufacturer'] },
      { key: 'model', label: 'Model' },
      { key: 'serialNumber', label: 'Serial number', aliases: ['serial', 'serialno', 'sno'] },
      { key: 'purchaseDate', label: 'Purchase date', aliases: ['purchased', 'dop', 'boughton'] },
      { key: 'purchaseCost', label: 'Purchase cost', aliases: ['cost', 'price', 'value', 'amount'] },
      { key: 'warrantyUntil', label: 'Warranty until', aliases: ['warranty', 'warrantyexpiry'] },
      { key: 'expectedLifeYears', label: 'Expected life (years)', aliases: ['life', 'lifeyears'] },
      { key: 'maintenanceIntervalMonths', label: 'Maintenance every (months)', aliases: ['maintenanceinterval', 'servicemonths'] },
    ],
    sample: [{ name: 'Passenger lift · Tower A', categoryKey: 'LIFT', location: 'Tower A lobby', make: 'Otis', model: 'Gen2', serialNumber: 'OT-A-114', purchaseDate: '2019-03-15', purchaseCost: '1850000', warrantyUntil: '2021-03-14', expectedLifeYears: '20', maintenanceIntervalMonths: '3' }],
  },
  {
    type: 'INVENTORY_ITEMS', name: 'Inventory items', description: 'Store items with minimum levels and opening stock.', module: 'inventory', permission: 'inventory:create',
    identity: ['sku', 'name'],
    fields: [
      { key: 'name', label: 'Item name', required: true, aliases: ['item', 'description'] },
      { key: 'sku', label: 'SKU', aliases: ['code', 'itemcode'] },
      { key: 'categoryKey', label: 'Category', required: true, hint: 'CLEANING, ELECTRICAL, PLUMBING, STATIONERY, SAFETY, OTHER', aliases: ['category', 'type'] },
      { key: 'unit', label: 'Unit', hint: 'nos, kg, ltr…', aliases: ['uom', 'units'] },
      { key: 'minimumLevel', label: 'Minimum level', aliases: ['min', 'minimum', 'reorderlevel'] },
      { key: 'reorderQuantity', label: 'Reorder quantity', aliases: ['reorder', 'reorderqty'] },
      { key: 'unitCost', label: 'Unit cost', aliases: ['cost', 'price', 'rate'] },
      { key: 'openingStock', label: 'Opening stock', aliases: ['stock', 'quantity', 'qty', 'onhand'] },
      { key: 'location', label: 'Store location', aliases: ['store', 'rack'] },
    ],
    sample: [{ name: 'Floor cleaner 5L', sku: 'CLN-001', categoryKey: 'CLEANING', unit: 'ltr', minimumLevel: '10', reorderQuantity: '5', unitCost: '320', openingStock: '8', location: 'Store room' }],
  },
];

export const IMPORTS_BY_TYPE = new Map(IMPORTS.map((d) => [d.type, d]));

/** Row validators per type: coerce strings from the sheet into what the services expect. */
export const ROW_SCHEMAS: Record<ImportType, z.ZodTypeAny> = {
  UNITS: z.object({ buildingCode: text(20).min(1), buildingName: text(120).optional(), number: text(20).min(1), floor: num(), type: text(30).optional(), areaSqft: num(), bedrooms: num(), occupancyStatus: z.preprocess((v) => (v === '' || v === undefined ? undefined : String(v).trim().toUpperCase().replace(/[\s-]+/g, '_')), z.enum(['VACANT', 'OWNER_OCCUPIED', 'TENANT_OCCUPIED', 'LOCKED']).optional()), openingBalance: num() }),
  RESIDENTS: z.object({ unitCode: text(40).min(1), name: text(120).min(2), type: z.preprocess((v) => String(v ?? '').trim().toUpperCase(), z.enum(['OWNER', 'TENANT', 'FAMILY'])), phone: text(20).optional(), email: z.preprocess((v) => (v === '' || v === undefined ? undefined : String(v).trim().toLowerCase()), z.string().email().optional()), isPrimary: bool(), relationship: text(40).optional(), moveInDate: date(), notes: text(2000).optional() }),
  VEHICLES: z.object({ unitCode: text(40).min(1), number: text(20).min(4), type: z.preprocess((v) => (v === '' || v === undefined ? 'CAR' : String(v).trim().toUpperCase()), z.enum(['CAR', 'BIKE', 'SCOOTER', 'EV', 'BICYCLE', 'OTHER'])), make: text(60).optional(), model: text(60).optional(), color: text(30).optional(), stickerNumber: text(30).optional() }),
  STAFF: z.object({ name: text(120).min(2), categoryKey: text(40).min(1), phone: text(20).optional(), designation: text(120).optional(), employmentType: z.preprocess((v) => (v === '' || v === undefined ? 'SOCIETY' : String(v).trim().toUpperCase()), z.enum(['SOCIETY', 'AGENCY', 'CONTRACT'])), shiftKey: text(30).optional(), joinedAt: date(), salaryAmount: num() }),
  ASSETS: z.object({ name: text(160).min(2), categoryKey: text(40).min(1), location: text(200).optional(), make: text(80).optional(), model: text(80).optional(), serialNumber: text(80).optional(), purchaseDate: date(), purchaseCost: num(), warrantyUntil: date(), expectedLifeYears: num(), maintenanceIntervalMonths: num() }),
  INVENTORY_ITEMS: z.object({ name: text(160).min(2), sku: text(40).optional(), categoryKey: text(40).min(1), unit: text(20).optional(), minimumLevel: num(), reorderQuantity: num(), unitCost: num(), openingStock: num(), location: text(120).optional() }),
};
