import dayjs from 'dayjs';
import { registerSeedHooks } from '../../seed/hooks';
import { ChargeHead } from '../../models/charge-head.model';
import { Unit } from '../../models/unit.model';
import { Payment } from '../../models/payment.model';
import { PaymentGatewayConfig } from '../../models/payment-gateway-config.model';
import { encryptSecret } from '../../lib/crypto';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { billingService } from './billing.service';
import { meterService } from './meter.service';
import { paymentService } from '../payments/payments.service';

/** Demo billing data: charge heads, water readings, last month's billing run and a spread of payments. */
registerSeedHooks('billing', async ({ societyId, adminUserId }) => {
  if (await ChargeHead.countDocuments({ societyId })) return;
  await billingService.setConfig(societyId, { cycle: 'MONTHLY', dueDay: 10, gracePeriodDays: 5, penalty: { type: 'PERCENT', value: 2, applyAfterDays: 0, maxAmount: 500 }, invoicePrefix: 'INV', receiptPrefix: 'RCP', notifyOnIssue: false }, adminUserId);
  const heads = [
    { name: 'Maintenance charges', code: 'MAINT', type: 'AREA_BASED', rate: 3, ledgerAccountCode: '4100', sortOrder: 0 },
    { name: 'Sinking fund', code: 'SINK', type: 'FIXED', amount: 500, fundKey: 'SINKING', ledgerAccountCode: '4110', sortOrder: 1 },
    { name: 'Water charges', code: 'WATER', type: 'METER_BASED', rate: 25, amount: 100, meterType: 'WATER', ledgerAccountCode: '4120', sortOrder: 2 },
    { name: 'Club house', code: 'CLUB', type: 'FIXED', amount: 300, ledgerAccountCode: '4130', sortOrder: 3 },
    { name: 'Non-occupancy charge', code: 'NOC', type: 'PERCENTAGE', rate: 10, applicableUnitTypes: ['SHOP'], ledgerAccountCode: '4140', sortOrder: 4 },
  ];
  for (const h of heads) await billingService.createChargeHead(societyId, h, adminUserId);

  const units = await Unit.find({ societyId, deletedAt: null }).sort({ code: 1 }).lean();
  const lastMonth = dayjs().subtract(1, 'month');
  // water readings for the first 12 units
  for (const [i, unit] of units.slice(0, 12).entries()) {
    await meterService.record(societyId, { unitId: String(unit._id), meterType: 'WATER', previousReading: 1000 + i * 40, currentReading: 1000 + i * 40 + 8 + (i % 5) * 3, readingDate: lastMonth.endOf('month').toDate() }, adminUserId, 'IMPORT');
  }
  const run = await billingService.generateRun(societyId, { periodFrom: lastMonth.startOf('month').toDate(), periodTo: lastMonth.endOf('month').toDate(), includePreviousBalance: true, issueImmediately: true, dueDate: dayjs().subtract(12, 'day').toDate() }, adminUserId);
  // payments: half the units paid in full, a few partially, the rest outstanding
  const invoices = await (await import('../../models/invoice.model')).Invoice.find({ societyId, billingRunId: run._id }).lean();
  const methods = ['UPI', 'BANK_TRANSFER', 'CHEQUE', 'CASH'] as const;
  for (const [i, inv] of invoices.entries()) {
    if (i % 2 === 0) await paymentService.recordPayment(societyId, { unitId: String(inv.unitId), amount: inv.total, method: methods[i % methods.length], receivedAt: dayjs().subtract(10 - (i % 7), 'day').toDate(), reference: `DEMO-${1000 + i}` }, adminUserId);
    else if (i % 5 === 1) await paymentService.recordPayment(societyId, { unitId: String(inv.unitId), amount: Math.round(inv.total / 2), method: 'UPI', receivedAt: dayjs().subtract(4, 'day').toDate(), reference: `DEMO-${1000 + i}` }, adminUserId);
  }
  // mark overdue + penalties for the unpaid ones so dashboards have data
  await billingService.processOverdue();
  // demo gateway (mock) so "Pay now" works out of the box
  await PaymentGatewayConfig.updateOne({ societyId }, { $setOnInsert: { societyId, provider: 'mock', enabled: true, displayName: 'Pay online (demo gateway)', keyId: 'mock_key', keySecretEncrypted: encryptSecret(env.MOCK_PAYMENT_SECRET), testMode: true, allowedMethods: ['UPI', 'CARD', 'NETBANKING', 'WALLET'], convenienceFeePercent: 0, updatedBy: adminUserId } }, { upsert: true });
  logger.info({ invoices: invoices.length, payments: await Payment.countDocuments({ societyId }) }, 'Demo billing data created');
});
