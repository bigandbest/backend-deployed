import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
let affiliateOrder, balance, failStats, finalizations, click, superseded;
const order = { id: 'order1', user_id: 'buyer', created_at: new Date('2026-01-01'), subtotal: 100, order_items: [{ price: 100, quantity: 1 }] };
const prisma = {
  orders: { findUnique: async () => order },
  affiliate_orders: { create: async ({ data }) => { affiliateOrder = { id: 'aff1', ...data }; return affiliateOrder; } },
  affiliate_profiles: { update: async ({ data }) => { if (failStats) throw new Error('Stats failed'); balance += data.pending_balance.increment; } },
  $transaction: async fn => {
    const beforeOrder = affiliateOrder, beforeBalance = balance;
    try { return await fn(prisma); }
    catch (error) { affiliateOrder = beforeOrder; balance = beforeBalance; throw error; }
  },
};
mock.module('../../config/prisma.js', { defaultExport: prisma });
mock.module('../../dao/affiliate.dao.js', { defaultExport: {
  getAffiliateOrderByOrderId: async () => affiliateOrder,
  getProfileByCode: async () => ({ id: 'affiliate', user_id: 'seller', status: 'ACTIVE', tier_bonus: 0 }),
  getConfig: async () => ({ default_commission_rate: 5, block_self_referral: true }),
  getClickById: async () => click,
  finalizeClickAttribution: async () => { finalizations++; },
} });
mock.module('../../services/referralService.js', { namedExports: {
  supersedeByAffiliateAttribution: async () => { superseded++; }, logFraud: async () => {}, logAdminAction: async () => {},
} });
mock.module('../../services/campaignEngine.js', { namedExports: {
  getActiveCampaignRules: async () => [], matchingRulesForItem: () => [], computeRuleAmount: () => 0, reserveCampaignUsage: async () => true,
} });
const { processAffiliateOrder } = await import('../../services/affiliateService.js');
beforeEach(() => { affiliateOrder = null; balance = 0; failStats = false; finalizations = 0; superseded = 0; click = { affiliate_id: 'affiliate', user_id: 'buyer', cookie_expires_at: new Date('2026-01-02') }; });
test('commission and balance commit together and replay cannot increment earnings twice', async () => {
  await processAffiliateOrder('order1', 'AFF1', { retryOnError: true });
  await processAffiliateOrder('order1', 'AFF1', { retryOnError: true });
  assert.equal(balance, 5); assert.equal(affiliateOrder.final_commission, 5);
  assert.equal(finalizations, 2); assert.equal(superseded, 2);
});
test('failed profile accounting rolls back commission and can be retried', async () => {
  failStats = true;
  await assert.rejects(processAffiliateOrder('order1', 'AFF1', { retryOnError: true }), /Stats failed/);
  assert.equal(affiliateOrder, null); assert.equal(balance, 0);
  failStats = false; await processAffiliateOrder('order1', 'AFF1', { retryOnError: true });
  assert.equal(balance, 5);
});
test('reconciliation accepts a click valid at order placement even after its expiry', async () => {
  const result = await processAffiliateOrder('order1', 'AFF1', { clickId: '11111111-1111-4111-8111-111111111111', retryOnError: true });
  assert.equal(result.final_commission, 5);
});
test('a click expired before placement cannot receive a commission', async () => {
  click.cookie_expires_at = new Date('2025-12-31');
  const result = await processAffiliateOrder('order1', 'AFF1', { clickId: '11111111-1111-4111-8111-111111111111', retryOnError: true });
  assert.equal(result, null); assert.equal(balance, 0);
});
