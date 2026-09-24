import { z } from 'zod';
import { objectIdSchema, paginationQuerySchema } from '@society-erp/shared';
import { AccountTypes } from '../../models/account.model';

const code = z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/, 'Use 2-20 letters, digits or dashes');

export const accountCreateSchema = z.object({
  code,
  name: z.string().trim().min(2).max(120),
  type: z.enum(AccountTypes),
  parentCode: code.optional().nullable(),
  description: z.string().trim().max(300).optional(),
  openingBalance: z.coerce.number().default(0),
  fundKey: z.string().trim().max(30).optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});
export const accountUpdateSchema = accountCreateSchema.partial().extend({ isActive: z.boolean().optional() });
export const accountListQuerySchema = z.object({ includeInactive: z.enum(['true', 'false']).optional(), withBalances: z.enum(['true', 'false']).optional(), asOf: z.coerce.date().optional() });

export const fundSchema = z.object({
  key: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional(),
  accountCode: code,
  targetAmount: z.coerce.number().min(0).nullable().optional(),
  openingBalance: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
});

const journalLine = z.object({
  accountCode: code,
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  description: z.string().trim().max(200).optional(),
  fundKey: z.string().trim().max(30).optional().nullable(),
  partyType: z.string().trim().max(30).optional().nullable(),
  partyId: objectIdSchema.optional().nullable(),
});
export const journalCreateSchema = z.object({
  date: z.coerce.date(),
  narration: z.string().trim().min(3).max(500),
  lines: z.array(journalLine).min(2).max(50),
  post: z.boolean().default(false),
});
export const journalUpdateSchema = journalCreateSchema.omit({ post: true }).partial();
export const journalListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'POSTED', 'REVERSED']).optional(),
  source: z.string().max(20).optional(),
  accountCode: code.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const reverseSchema = z.object({ reason: z.string().trim().min(2).max(300), date: z.coerce.date().optional() });

export const periodQuerySchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const asOfQuerySchema = z.object({ asOf: z.coerce.date().optional() });
export const ledgerParamSchema = z.object({ code });

export const bankAccountCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['BANK', 'CASH', 'WALLET', 'GATEWAY']).default('BANK'),
  bankName: z.string().trim().max(120).optional(),
  branch: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().max(30).optional(),
  ifsc: z.string().trim().max(20).optional(),
  accountCode: code.optional(),
  openingBalance: z.coerce.number().default(0),
  openingBalanceDate: z.coerce.date().optional(),
  isDefault: z.boolean().default(false),
  paymentMethods: z.array(z.string().max(20)).max(10).default([]),
});
export const bankAccountUpdateSchema = bankAccountCreateSchema.omit({ openingBalance: true, openingBalanceDate: true, accountCode: true }).partial().extend({ isActive: z.boolean().optional() });
export const statementImportSchema = z.object({ csv: z.string().min(1).max(5_000_000) });
export const bankTxnSchema = z.object({ date: z.coerce.date(), description: z.string().trim().max(300).optional(), reference: z.string().trim().max(120).optional(), amount: z.coerce.number().positive(), type: z.enum(['CREDIT', 'DEBIT']) });
export const bankTxnListQuerySchema = paginationQuerySchema.extend({ bankAccountId: objectIdSchema.optional(), status: z.enum(['UNMATCHED', 'MATCHED', 'IGNORED']).optional(), type: z.enum(['CREDIT', 'DEBIT']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const matchSchema = z.object({ type: z.enum(['Payment', 'Expense', 'JournalEntry']), id: objectIdSchema });
export const ignoreSchema = z.object({ note: z.string().trim().max(300).optional() });
