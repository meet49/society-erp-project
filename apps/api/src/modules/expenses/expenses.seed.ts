import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { Vendor } from '../../models/vendor.model';
import { Role } from '../../models/role.model';
import { UserRole } from '../../models/user-role.model';
import { logger } from '../../lib/logger';
import { vendorService } from './vendors.service';
import { expenseService } from './expenses.service';
import { purchaseOrderService } from './purchase-orders.service';
import { accountingService } from '../accounting/accounting.service';
import { workflowService } from '../../core/workflows/workflow.service';

/** Demo vendors, expenses (approved, pending, paid) and a purchase order, so finance screens have data. */
registerSeedHooks('expenses', async ({ societyId, adminUserId }) => {
  if (await Vendor.countDocuments({ societyId })) return;
  await accountingService.ensureChartOfAccounts(societyId);
  await workflowService.ensureDefaults(societyId);
  const vendors = [
    { name: 'Sparkle Facility Services', categoryKey: 'HOUSEKEEPING', contactName: 'Ravi Kumar', phone: '9811100001', email: 'ops@sparkle.example', gstin: '29AAACS1234A1Z5', paymentTermsDays: 15, bank: { accountHolder: 'Sparkle Facility Services', accountNumber: '50100234567890', ifsc: 'HDFC0000123' } },
    { name: 'SafeGuard Security Pvt Ltd', categoryKey: 'SECURITY', contactName: 'Meena Pillai', phone: '9811100002', email: 'billing@safeguard.example', gstin: '29AABCS9876B1Z1', paymentTermsDays: 30 },
    { name: 'Lift Care Engineers', categoryKey: 'AMC', contactName: 'Joseph D', phone: '9811100003', paymentTermsDays: 30 },
    { name: 'GreenScape Gardening', categoryKey: 'GARDENING', contactName: 'Sunita', phone: '9811100004', paymentTermsDays: 10 },
    { name: 'BESCOM', categoryKey: 'UTILITY', paymentTermsDays: 7 },
  ];
  const created: Record<string, any> = {};
  for (const v of vendors) created[v.categoryKey] = await vendorService.create(societyId, v, adminUserId);
  const committeeRole = await Role.findOne({ societyId, key: 'COMMITTEE' }).select('_id').lean();
  const committeeLink = committeeRole ? await UserRole.findOne({ societyId, roleId: committeeRole._id }).select('userId').lean() : null;
  const committee = committeeLink ? { userId: String(committeeLink.userId), roleKeys: ['COMMITTEE'], permissions: new Set<string>(['expenses:approve']) } : null;
  const lastMonth = dayjs().subtract(1, 'month');
  const plan = [
    { title: 'Housekeeping - ' + lastMonth.format('MMM YYYY'), cat: 'HOUSEKEEPING', amount: 42000, taxRate: 18, pay: 'full', bill: lastMonth.date(28) },
    { title: 'Security services - ' + lastMonth.format('MMM YYYY'), cat: 'SECURITY', amount: 68000, taxRate: 18, pay: 'full', bill: lastMonth.date(30) },
    { title: 'Lift AMC quarterly', cat: 'AMC', amount: 24000, taxRate: 18, pay: 'partial', bill: dayjs().subtract(12, 'day') },
    { title: 'Common area electricity', cat: 'UTILITY', amount: 31250, taxRate: 0, pay: 'none', bill: dayjs().subtract(6, 'day') },
    { title: 'Garden maintenance', cat: 'GARDENING', amount: 8500, taxRate: 0, pay: 'full', bill: dayjs().subtract(20, 'day') },
    { title: 'Pump motor replacement', cat: 'REPAIRS', amount: 58000, taxRate: 18, pay: 'none', bill: dayjs().subtract(2, 'day'), pending: true },
    { title: 'Diwali decoration', cat: 'EVENTS', amount: 1500, taxRate: 0, pay: 'full', bill: dayjs().subtract(40, 'day') },
  ];
  let count = 0;
  for (const p of plan) {
    const vendor = created[p.cat];
    const exp: any = await expenseService.create(societyId, { title: p.title, vendorId: vendor?.id, vendorName: vendor ? undefined : 'Local vendor', categoryKey: p.cat, amount: p.amount, taxRate: p.taxRate, tdsAmount: 0, billDate: p.bill.toDate(), submit: true }, adminUserId);
    count += 1;
    if (p.pending) continue;
    if (exp.approvalStatus === 'PENDING' && committee) {
      const fresh: any = await expenseService.decide(societyId, String(exp._id ?? exp.id), committee, 'APPROVED', 'Approved (demo)');
      if (fresh.approvalStatus === 'PENDING') await expenseService.decide(societyId, String(exp._id ?? exp.id), { userId: adminUserId, roleKeys: ['SOCIETY_ADMIN'], permissions: new Set(['expenses:approve']) }, 'APPROVED', 'Approved (demo)');
    }
    const id = String(exp._id ?? exp.id);
    const current: any = await expenseService.get(societyId, id);
    if (current.approvalStatus !== 'APPROVED') continue;
    if (p.pay === 'full') await expenseService.recordPayment(societyId, id, { amount: current.total, date: p.bill.add(5, 'day').toDate(), method: 'BANK_TRANSFER', reference: `NEFT-${1000 + count}` }, adminUserId);
    else if (p.pay === 'partial') await expenseService.recordPayment(societyId, id, { amount: Math.round(current.total / 2), date: dayjs().subtract(3, 'day').toDate(), method: 'CHEQUE', reference: `CHQ-${200 + count}` }, adminUserId);
  }
  await purchaseOrderService.create(societyId, { title: 'CCTV upgrade for basement parking', vendorId: created.SECURITY?.id, categoryKey: 'SECURITY', justification: 'Two blind spots reported by residents; insurer recommends coverage.', items: [{ description: '4MP dome camera', quantity: 6, unit: 'nos', rate: 3800, taxRate: 18 }, { description: 'Installation & cabling', quantity: 1, unit: 'job', rate: 9000, taxRate: 18 }], quotes: [{ vendorName: 'SafeGuard Security', amount: 37500, selected: true }, { vendorName: 'CityCam Solutions', amount: 41200 }], submit: true }, adminUserId);
  logger.info({ vendors: vendors.length, expenses: count }, 'Demo expenses created');
});
