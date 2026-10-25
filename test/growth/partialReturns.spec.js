import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
let order, profile, commission, payout, returns, audits, failProfile;
const items = [{ id: 'item1', quantity: 2, price: 100 }, { id: 'item2', quantity: 1, price: 200 }];
const update = (row, data) => {
  for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'decrement' in value ? Number(row[key]) - value.decrement : value && typeof value === 'object' && 'increment' in value ? Number(row[key] || 0) + value.increment : value;
  return { ...row };
};
const prisma = {
  $queryRaw: async () => [],
  affiliate_orders: { findUnique: async () => ({ ...order, affiliate_profiles: profile }), update: async ({ data }) => update(order, data), updateMany: async ({ where, data }) => { if (where.commission_status && order.commission_status !== where.commission_status) return { count: 0 }; update(order, data); return { count: 1 }; } },
  affiliate_profiles: { update: async ({ data }) => { if (failProfile) throw new Error('Balance write failed'); return update(profile, data); } },
  affiliate_commissions: { findUnique: async () => commission && { ...commission }, update: async ({ data }) => update(commission, data), create: async ({ data }) => { commission = data; return commission; } },
  affiliate_payouts: { findUnique: async () => ({ ...payout }), update: async ({ data }) => update(payout, data) },
  return_orders: { findMany: async () => returns },
  order_items: { findMany: async () => items },
  referral_admin_logs: { create: async ({ data }) => { audits.push(data); } },
};
let tail = Promise.resolve();
prisma.$transaction = async operation => {
  let release; const previous = tail; tail = new Promise(resolve => { release = resolve; }); await previous;
  const saved = structuredClone({ order, profile, commission, payout, audits });
  try { return await operation(prisma); }
  catch (error) { ({ order, profile, commission, payout, audits } = saved); throw error; }
  finally { release(); }
};
mock.module('../../config/prisma.js', { defaultExport: prisma });
mock.module('../../dao/affiliate.dao.js', { defaultExport: { getConfig: async () => ({ enable_tds: true, tds_rate_without_pan: 10, tds_rate_with_pan: 5 }) } });
const { approveCommission } = await import('../../services/affiliateService.js');
const { calculateAffiliateReturnAdjustment, reconcileAffiliateReturns } = await import('../../services/affiliateReturnService.js');
const returned = (id, quantity) => ({ refund_amount: 999, return_order_items: [{ order_item_id: id, quantity }] });
beforeEach(() => {
  order = { id: 'affiliate-order', order_id: 'order1', affiliate_id: 'affiliate', commission_status: 'PENDING', gross_order_value: 400, net_order_value: 360, commission_amount: 50, final_commission: 50, final_order_value: 360, return_amount: 0, campaign_breakdown: [{ order_item_id: 'item1', commission: 40 }, { order_item_id: 'item2', commission: 10 }] };
  profile = { pending_balance: 50, available_balance: 45, processing_balance: 45, total_commission_earned: 50 };
  commission = { id: 'commission', status: 'APPROVED', final_amount: 45, tds_rate: 10, tds_amount: 5 };
  payout = { id: 'payout', status: 'PENDING', gross_amount: 50, net_amount: 45, tds_amount: 5 };
  returns = [returned('item1', 1)]; audits = []; failProfile = false;
});
test('item snapshot reverses only returned quantities, excludes non-product refund amounts and preserves discounts', () => {
  assert.deepEqual(calculateAffiliateReturnAdjustment(order, returns, items), { returnAmount: 100, finalOrderValue: 270, finalCommission: 30 });
});
test('legacy conversions without item snapshots use a proportional original-commission reduction', () => {
  order.campaign_breakdown = null;
  assert.equal(calculateAffiliateReturnAdjustment(order, returns, items).finalCommission, 37.5);
});
test('return quantities are capped at quantities bought and a full product return zeros the commission', () => {
  const next = calculateAffiliateReturnAdjustment(order, [returned('item1', 99), returned('item2', 5)], items);
  assert.equal(next.returnAmount, 400); assert.equal(next.finalCommission, 0);
});
test('partial return and duplicate/concurrent callbacks adjust pending earnings exactly once', async () => {
  await Promise.all([reconcileAffiliateReturns('order1'), reconcileAffiliateReturns('order1')]);
  assert.equal(order.final_commission, 30); assert.equal(order.final_order_value, 270);
  assert.equal(profile.pending_balance, 30); assert.equal(profile.total_commission_earned, 30);
});
test('a later completed return applies only the additional reduction', async () => {
  await reconcileAffiliateReturns('order1'); returns.push(returned('item1', 1));
  await reconcileAffiliateReturns('order1');
  assert.equal(order.final_commission, 10); assert.equal(profile.pending_balance, 10);
});
test('completed returns existing before attribution are reflected on the first reconciliation', async () => {
  returns = [returned('item2', 1)]; await reconcileAffiliateReturns('order1');
  assert.equal(order.final_commission, 40); assert.equal(profile.pending_balance, 40);
});
test('approved commission reduction updates TDS, commission and available balance together', async () => {
  order.commission_status = 'APPROVED'; await reconcileAffiliateReturns('order1');
  assert.equal(commission.final_amount, 27); assert.equal(commission.tds_amount, 3);
  assert.equal(profile.available_balance, 27); assert.equal(profile.total_commission_earned, 30);
});
test('a pending admin payout is reduced with its processing balance', async () => {
  order.commission_status = 'APPROVED'; commission.status = 'IN_PAYOUT'; commission.payout_id = 'payout';
  await reconcileAffiliateReturns('order1');
  assert.equal(payout.net_amount, 27); assert.equal(payout.gross_amount, 30); assert.equal(payout.tds_amount, 3);
  assert.equal(profile.processing_balance, 27); assert.equal(profile.available_balance, 45);
});
test('paid or externally processing payouts retain their amount and log the absorbed return once', async () => {
  order.commission_status = 'APPROVED'; commission.status = 'IN_PAYOUT'; commission.payout_id = 'payout'; payout.status = 'PROCESSING';
  await reconcileAffiliateReturns('order1'); await reconcileAffiliateReturns('order1');
  assert.equal(payout.net_amount, 45); assert.equal(order.final_commission, 50); assert.equal(audits.length, 1);
  assert.equal(order.return_amount, 100);
});
test('balance failure rolls back order and commission, allowing a safe retry', async () => {
  order.commission_status = 'APPROVED'; failProfile = true;
  await assert.rejects(reconcileAffiliateReturns('order1'), /Balance write failed/);
  assert.equal(order.final_commission, 50); assert.equal(commission.final_amount, 45);
  failProfile = false; await reconcileAffiliateReturns('order1'); assert.equal(commission.final_amount, 27);
});

test('approval rereads the adjusted commission under the same order lock', async () => {
  profile.available_balance = 0;
  await approveCommission(order.id, null);
  assert.equal(commission.gross_commission, 30); assert.equal(commission.final_amount, 27);
  assert.equal(profile.pending_balance, 0); assert.equal(profile.available_balance, 27);
});
test('full cancellation after a partial return reverses only remaining pending earnings', async () => {
  await reconcileAffiliateReturns('order1');
  await reconcileAffiliateReturns('order1', { full: true });
  await reconcileAffiliateReturns('order1', { full: true });
  assert.equal(order.final_commission, 0); assert.equal(profile.pending_balance, 0);
  assert.equal(profile.total_commission_earned, 0); assert.equal(order.commission_status, 'REVERSED');
});
test('full cancellation removes a commission from a pending payout and zeros its reserved amount', async () => {
  order.commission_status = 'APPROVED'; commission.status = 'IN_PAYOUT'; commission.payout_id = 'payout'; payout.commission_count = 1;
  await reconcileAffiliateReturns('order1', { full: true });
  assert.equal(payout.net_amount, 0); assert.equal(profile.processing_balance, 0);
  assert.equal(payout.commission_count, 0); assert.equal(commission.payout_id, null); assert.equal(commission.status, 'CANCELLED');
});
test('already paid earnings are retained without debt and full cancellation is audit-idempotent', async () => {
  order.commission_status = 'APPROVED'; commission.status = 'PAID';
  await reconcileAffiliateReturns('order1', { full: true }); await reconcileAffiliateReturns('order1', { full: true });
  assert.equal(profile.available_balance, 45); assert.equal(audits.length, 1); assert.equal(order.is_returned, true);
});
