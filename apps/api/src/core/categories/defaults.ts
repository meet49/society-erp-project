import type { CategoryType } from '@society-erp/shared';

export interface CategoryDefault {
  key: string;
  name: string;
  color?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
  isSystem?: boolean;
}

const c = (key: string, name: string, extra: Partial<CategoryDefault> = {}): CategoryDefault => ({ key, name, ...extra });

/** Per-society starting categories. Societies can rename, reorder, deactivate or add their own. */
export const CATEGORY_DEFAULTS: Record<CategoryType, CategoryDefault[]> = {
  COMPLAINT_CATEGORY: [
    c('PLUMBING', 'Plumbing', { color: 'sky', icon: 'Droplets' }),
    c('ELECTRICAL', 'Electrical', { color: 'amber', icon: 'Zap' }),
    c('HOUSEKEEPING', 'Housekeeping', { color: 'emerald', icon: 'Sparkles' }),
    c('SECURITY', 'Security', { color: 'rose', icon: 'Shield' }),
    c('LIFT', 'Lift', { color: 'violet', icon: 'ArrowUpDown' }),
    c('WATER_SUPPLY', 'Water supply', { color: 'blue', icon: 'Waves' }),
    c('PARKING', 'Parking', { color: 'slate', icon: 'ParkingSquare' }),
    c('NOISE', 'Noise / nuisance', { color: 'orange', icon: 'Volume2' }),
    c('COMMON_AREA', 'Common area', { color: 'teal', icon: 'Trees' }),
    c('BILLING', 'Billing query', { color: 'indigo', icon: 'Receipt' }),
    c('OTHER', 'Other', { color: 'gray', icon: 'CircleHelp', isSystem: true }),
  ],
  VISITOR_CATEGORY: [
    c('GUEST', 'Guest', { icon: 'User', isSystem: true }),
    c('DELIVERY', 'Delivery', { icon: 'Package', isSystem: true }),
    c('CAB', 'Cab / taxi', { icon: 'Car' }),
    c('SERVICE_PROVIDER', 'Service provider', { icon: 'Wrench' }),
    c('VENDOR', 'Vendor', { icon: 'Store' }),
    c('DOMESTIC_HELP', 'Domestic help', { icon: 'Sparkles', isSystem: true }),
    c('OTHER', 'Other', { icon: 'CircleHelp', isSystem: true }),
  ],
  STAFF_CATEGORY: [
    c('SECURITY', 'Security', { icon: 'Shield' }),
    c('HOUSEKEEPING', 'Housekeeping', { icon: 'Sparkles' }),
    c('MAINTENANCE', 'Maintenance', { icon: 'Wrench' }),
    c('GARDENER', 'Gardener', { icon: 'Flower2' }),
    c('ELECTRICIAN', 'Electrician', { icon: 'Zap' }),
    c('PLUMBER', 'Plumber', { icon: 'Droplets' }),
    c('OFFICE', 'Office / admin', { icon: 'Briefcase' }),
    c('OTHER', 'Other', { icon: 'CircleHelp', isSystem: true }),
  ],
  VENDOR_CATEGORY: [
    c('HOUSEKEEPING', 'Housekeeping agency'),
    c('SECURITY', 'Security agency'),
    c('LIFT_AMC', 'Lift AMC'),
    c('ELECTRICAL', 'Electrical'),
    c('PLUMBING', 'Plumbing'),
    c('PEST_CONTROL', 'Pest control'),
    c('GARDENING', 'Gardening'),
    c('FIRE_SAFETY', 'Fire safety'),
    c('IT_SERVICES', 'IT & CCTV'),
    c('OTHER', 'Other', { isSystem: true }),
  ],
  EXPENSE_CATEGORY: [
    c('SALARIES', 'Salaries & wages', { metadata: { ledgerAccountCode: '5100' } }),
    c('ELECTRICITY', 'Electricity', { metadata: { ledgerAccountCode: '5200' } }),
    c('WATER', 'Water', { metadata: { ledgerAccountCode: '5210' } }),
    c('REPAIRS', 'Repairs & maintenance', { metadata: { ledgerAccountCode: '5300' } }),
    c('HOUSEKEEPING', 'Housekeeping', { metadata: { ledgerAccountCode: '5310' } }),
    c('SECURITY', 'Security services', { metadata: { ledgerAccountCode: '5320' } }),
    c('AMC', 'AMC & contracts', { metadata: { ledgerAccountCode: '5400' } }),
    c('OFFICE', 'Office & admin', { metadata: { ledgerAccountCode: '5500' } }),
    c('LEGAL', 'Legal & professional', { metadata: { ledgerAccountCode: '5510' } }),
    c('OTHER', 'Other', { metadata: { ledgerAccountCode: '5900' }, isSystem: true }),
  ],
  ASSET_CATEGORY: [c('LIFT', 'Lift'), c('GENERATOR', 'Generator'), c('PUMP', 'Water pump'), c('CCTV', 'CCTV'), c('FIRE_SAFETY', 'Fire safety'), c('FURNITURE', 'Furniture'), c('ELECTRICAL', 'Electrical'), c('GYM', 'Gym equipment'), c('OTHER', 'Other', { isSystem: true })],
  INVENTORY_CATEGORY: [c('CLEANING', 'Cleaning supplies'), c('ELECTRICAL', 'Electrical spares'), c('PLUMBING', 'Plumbing spares'), c('STATIONERY', 'Stationery'), c('SAFETY', 'Safety gear'), c('OTHER', 'Other', { isSystem: true })],
  DOMESTIC_HELP_TYPE: [c('MAID', 'Maid'), c('COOK', 'Cook'), c('DRIVER', 'Driver'), c('CLEANER', 'Cleaner'), c('GARDENER', 'Gardener'), c('NANNY', 'Nanny / caretaker'), c('OTHER', 'Other', { isSystem: true })],
  UNIT_TYPE: [
    c('FLAT', 'Flat', { isSystem: true }),
    c('VILLA', 'Villa'),
    c('PENTHOUSE', 'Penthouse'),
    c('SHOP', 'Shop'),
    c('OFFICE', 'Office'),
    c('PLOT', 'Plot'),
    c('OTHER', 'Other', { isSystem: true }),
  ],
  DOCUMENT_CATEGORY: [
    c('SOCIETY', 'Society documents', { isSystem: true }),
    c('COMMITTEE', 'Committee documents'),
    c('UNIT', 'Unit documents', { isSystem: true }),
    c('VENDOR', 'Vendor documents'),
    c('CONTRACT', 'Contracts'),
    c('INVOICE', 'Invoices'),
    c('RECEIPT', 'Receipts'),
    c('LEGAL', 'Legal'),
    c('MEETING', 'Meeting documents'),
    c('OTHER', 'Other', { isSystem: true }),
  ],
  FUND_TYPE: [c('CORPUS', 'Corpus fund'), c('SINKING', 'Sinking fund'), c('RESERVE', 'Reserve fund'), c('REPAIR', 'Repair fund')],
  INCIDENT_TYPE: [c('THEFT', 'Theft'), c('FIRE', 'Fire'), c('MEDICAL', 'Medical'), c('SECURITY_BREACH', 'Security breach'), c('PROPERTY_DAMAGE', 'Property damage'), c('DISPUTE', 'Dispute'), c('OTHER', 'Other', { isSystem: true })],
  EVENT_TYPE: [c('COMMUNITY', 'Community'), c('AGM', 'AGM'), c('CULTURAL', 'Cultural'), c('MAINTENANCE', 'Maintenance activity'), c('SPORTS', 'Sports'), c('OTHER', 'Other', { isSystem: true })],
  NOTICE_CATEGORY: [c('GENERAL', 'General'), c('CIRCULAR', 'Circular'), c('MAINTENANCE', 'Maintenance'), c('EMERGENCY', 'Emergency'), c('MEETING', 'Meeting'), c('FINANCE', 'Finance / dues'), c('FESTIVAL', 'Festival / celebration'), c('OTHER', 'Other', { isSystem: true })],
  COMMITTEE_POSITION: [c('CHAIRPERSON', 'Chairperson / President'), c('SECRETARY', 'Secretary'), c('TREASURER', 'Treasurer'), c('JOINT_SECRETARY', 'Joint secretary'), c('MEMBER', 'Committee member', { metadata: { multiple: true } }), c('AUDITOR', 'Internal auditor')],
  AMENITY_TYPE: [c('HALL', 'Party / community hall'), c('GYM', 'Gym'), c('POOL', 'Swimming pool'), c('COURT', 'Sports court'), c('GUEST_ROOM', 'Guest room'), c('CLUBHOUSE', 'Clubhouse'), c('LAWN', 'Lawn / garden'), c('OTHER', 'Other', { isSystem: true })],
};
