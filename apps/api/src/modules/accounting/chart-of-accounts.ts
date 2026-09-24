/**
 * Default chart of accounts for housing societies. Seeded per society and fully editable afterwards.
 * `systemKey` marks accounts used by automatic postings; they can be renamed or re-coded but not deleted.
 */
export interface DefaultAccount {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  parentCode?: string;
  systemKey?: string;
  fundKey?: string;
  isSystem?: boolean;
}

export const SystemAccountKeys = {
  CASH: 'CASH',
  BANK: 'BANK',
  GATEWAY_SETTLEMENT: 'GATEWAY_SETTLEMENT',
  RECEIVABLES: 'RECEIVABLES',
  MEMBER_ADVANCES: 'MEMBER_ADVANCES',
  PAYABLES: 'PAYABLES',
  TDS_PAYABLE: 'TDS_PAYABLE',
  TAX_PAYABLE: 'TAX_PAYABLE',
  MAINTENANCE_INCOME: 'MAINTENANCE_INCOME',
  PENALTY_INCOME: 'PENALTY_INCOME',
  OTHER_INCOME: 'OTHER_INCOME',
  GENERAL_EXPENSE: 'GENERAL_EXPENSE',
  BANK_CHARGES: 'BANK_CHARGES',
  GENERAL_FUND: 'GENERAL_FUND',
  SINKING_FUND: 'SINKING_FUND',
  CORPUS_FUND: 'CORPUS_FUND',
  OPENING_BALANCE_EQUITY: 'OPENING_BALANCE_EQUITY',
} as const;

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  // ---- assets
  { code: '1000', name: 'Cash in hand', type: 'ASSET', systemKey: SystemAccountKeys.CASH, isSystem: true },
  { code: '1010', name: 'Bank - main account', type: 'ASSET', systemKey: SystemAccountKeys.BANK, isSystem: true },
  { code: '1020', name: 'Payment gateway settlement', type: 'ASSET', systemKey: SystemAccountKeys.GATEWAY_SETTLEMENT, isSystem: true },
  { code: '1050', name: 'Fixed deposits', type: 'ASSET' },
  { code: '1200', name: 'Member receivables (dues)', type: 'ASSET', systemKey: SystemAccountKeys.RECEIVABLES, isSystem: true },
  { code: '1210', name: 'Other receivables', type: 'ASSET' },
  { code: '1300', name: 'Security deposits paid', type: 'ASSET' },
  { code: '1500', name: 'Fixed assets', type: 'ASSET' },
  // ---- liabilities
  { code: '2000', name: 'Vendor payables', type: 'LIABILITY', systemKey: SystemAccountKeys.PAYABLES, isSystem: true },
  { code: '2010', name: 'Member advances', type: 'LIABILITY', systemKey: SystemAccountKeys.MEMBER_ADVANCES, isSystem: true },
  { code: '2100', name: 'TDS payable', type: 'LIABILITY', systemKey: SystemAccountKeys.TDS_PAYABLE, isSystem: true },
  { code: '2110', name: 'GST / tax payable', type: 'LIABILITY', systemKey: SystemAccountKeys.TAX_PAYABLE, isSystem: true },
  { code: '2200', name: 'Security deposits received', type: 'LIABILITY' },
  // ---- equity / funds
  { code: '3000', name: 'General fund', type: 'EQUITY', systemKey: SystemAccountKeys.GENERAL_FUND, isSystem: true },
  { code: '3100', name: 'Sinking fund', type: 'EQUITY', systemKey: SystemAccountKeys.SINKING_FUND, fundKey: 'SINKING', isSystem: true },
  { code: '3110', name: 'Corpus fund', type: 'EQUITY', systemKey: SystemAccountKeys.CORPUS_FUND, fundKey: 'CORPUS', isSystem: true },
  { code: '3120', name: 'Reserve fund', type: 'EQUITY', fundKey: 'RESERVE' },
  { code: '3130', name: 'Repair fund', type: 'EQUITY', fundKey: 'REPAIR' },
  { code: '3900', name: 'Opening balance adjustments', type: 'EQUITY', systemKey: SystemAccountKeys.OPENING_BALANCE_EQUITY, isSystem: true },
  // ---- income
  { code: '4100', name: 'Maintenance charges', type: 'INCOME', systemKey: SystemAccountKeys.MAINTENANCE_INCOME, isSystem: true },
  { code: '4110', name: 'Sinking fund contributions', type: 'INCOME', fundKey: 'SINKING' },
  { code: '4120', name: 'Water charges', type: 'INCOME' },
  { code: '4130', name: 'Amenity & club house income', type: 'INCOME' },
  { code: '4140', name: 'Non-occupancy charges', type: 'INCOME' },
  { code: '4150', name: 'Parking charges', type: 'INCOME' },
  { code: '4200', name: 'Late payment penalties', type: 'INCOME', systemKey: SystemAccountKeys.PENALTY_INCOME, isSystem: true },
  { code: '4300', name: 'Interest income', type: 'INCOME' },
  { code: '4400', name: 'Move-in / NOC / transfer fees', type: 'INCOME' },
  { code: '4900', name: 'Other income', type: 'INCOME', systemKey: SystemAccountKeys.OTHER_INCOME, isSystem: true },
  // ---- expenses
  { code: '5100', name: 'General expenses', type: 'EXPENSE', systemKey: SystemAccountKeys.GENERAL_EXPENSE, isSystem: true },
  { code: '5110', name: 'Housekeeping & cleaning', type: 'EXPENSE' },
  { code: '5120', name: 'Security services', type: 'EXPENSE' },
  { code: '5130', name: 'Electricity (common areas)', type: 'EXPENSE' },
  { code: '5140', name: 'Water & sewage', type: 'EXPENSE' },
  { code: '5150', name: 'Repairs & maintenance', type: 'EXPENSE' },
  { code: '5160', name: 'Lift AMC & maintenance', type: 'EXPENSE' },
  { code: '5170', name: 'Generator & fuel', type: 'EXPENSE' },
  { code: '5180', name: 'Gardening & landscaping', type: 'EXPENSE' },
  { code: '5200', name: 'Staff salaries', type: 'EXPENSE' },
  { code: '5300', name: 'Insurance', type: 'EXPENSE' },
  { code: '5400', name: 'Professional & audit fees', type: 'EXPENSE' },
  { code: '5500', name: 'Software & subscriptions', type: 'EXPENSE' },
  { code: '5600', name: 'Bank charges', type: 'EXPENSE', systemKey: SystemAccountKeys.BANK_CHARGES, isSystem: true },
  { code: '5700', name: 'Events & celebrations', type: 'EXPENSE' },
  { code: '5800', name: 'Depreciation', type: 'EXPENSE' },
  { code: '5900', name: 'Miscellaneous expenses', type: 'EXPENSE' },
];

/** Expense category → default expense ledger code. Editable through the category metadata (`accountCode`). */
export const EXPENSE_CATEGORY_ACCOUNTS: Record<string, string> = {
  HOUSEKEEPING: '5110',
  SECURITY: '5120',
  ELECTRICITY: '5130',
  WATER: '5140',
  REPAIRS: '5150',
  LIFT: '5160',
  GENERATOR: '5170',
  GARDENING: '5180',
  SALARY: '5200',
  INSURANCE: '5300',
  PROFESSIONAL: '5400',
  SOFTWARE: '5500',
  EVENTS: '5700',
  OTHER: '5900',
};
