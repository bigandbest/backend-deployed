import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let rules, reservations, profiles, transactions, rewards, locks, firstOrderOnly, priorOrder, orderPlacements;
const prisma = {
  campaign_rules: { findMany: async () => rules },
  campaigns: {
    findUnique: async ({ where }) => ({ is_active: true, usage_limit: where.id === 'exhausted' ? 0 : 100 }),
    updateMany: async ({ where }) => ({ count: where.id === 'exhausted' ? 0 : 1 }),
  },
  campaign_usage: {
    findUnique: async ({ where }) => reservations.has(where.campaign_id_order_id.campaign_id) ? {} : null,
    create: async ({ data }) => { reservations.add(data.campaign_id); },
  },
  referral_configs: { findFirst: async () => ({ is_enabled: true, applicable_first_order: firstOrderOnly, min_order_value: 100, referee_reward_amount: 25, referrer_reward_amount: 75, max_earning_per_user: 100, reward_validity_days: 7 }) },
  referral_transactions: {
    findUnique: async ({ where }) => transactions.get(where.id),
    findFirst: async () => ({ id: 'signup', referrer_id: 'referrer', status: 'SIGNUP_COMPLETED' }),
    updateMany: async ({ where, data }) => {
      if (where.id === "signup") { orderPlacements++; return { count: 0 }; }
      const row = transactions.get(where.id);
      if (!row || row.status !== where.status) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
    update: async ({ where, data }) => Object.assign(transactions.get(where.id), data),
  },
  user_referral_profiles: {
    findUnique: async ({ where }) => profiles.get(where.id || where.user_id) || null,
    update: async ({ where, data }) => {
      const row = profiles.get(where.id);
      for (const [key, value] of Object.entries(data)) row[key] = value.increment != null ? (row[key] || 0) + value.increment : value.decrement != null ? (row[key] || 0) - value.decrement : value;
      return row;
    },
  },
  referral_rewards: { create: async ({ data }) => { const reward = { id: String(rewards.length), ...data }; rewards.push(reward); return reward; } },
  user_memberships: { findUnique: async () => null },
  notification_templates: { findUnique: async () => null },
  referral_notifications: { create: async () => ({}) },
  orders: { findFirst: async () => priorOrder, findUnique: async () => ({ affiliate_attribution: { affiliate_code: "AFF1" } }) },
  order_items: { findMany: async () => [] },
  $queryRaw: async () => { locks++; },
};
// Serialize mocked transactions to model the profile lock shared by concurrent reward credits.
let tail = Promise.resolve();
prisma.$transaction = async fn => {
  const prev = tail;
  let release;
  tail = new Promise(resolve => { release = resolve; });
  await prev;
  try { return await fn(prisma); } finally { release(); }
};
mock.module('../../config/prisma.js', { defaultExport: prisma });
mock.module('../../dao/affiliate.dao.js', { defaultExport: {
  getConfig: async () => ({ default_commission_rate: 5 }),
  getCategoryCommissionByCategory: async () => null,
} });
const { calculateCommission } = await import('../../services/affiliateService.js');
const { processReturnWindowExpiry, onOrderPlaced } = await import('../../services/referralService.js');
const { matchReferralCampaign, matchingRulesForItem } = await import('../../services/campaignEngine.js');
const { interpolate, validateTemplateVariables } = await import('../../services/notificationTemplateService.js');
const rule = (patch = {}) => ({ campaign_id: 'campaign', scope_type: 'STORE_WIDE', reward_type: 'PERCENTAGE', reward_value: 80, max_reward_cap: 50, campaigns: { name: 'Offer', created_at: new Date(0) }, ...patch });
const items = [{ product_id: 'p1', category_id: 'c1', price: 100, quantity: 1 }, { product_id: 'p2', category_id: 'c1', price: 100, quantity: 1 }];
beforeEach(() => {
  orderPlacements = 0; rules = []; reservations = new Set(); transactions = new Map(); rewards = []; locks = 0; firstOrderOnly = true; priorOrder = null;
  profiles = new Map([['referrer', { id: 'referrer', total_earnings: 80, successful_referrals: 0, pending_referrals: 2 }]]);
});

test('percentage campaign cap applies once to the entire order, including multiple matching lines', async () => {
  rules = [rule()];
  const result = await calculateCommission(items, 10, 200, 'order');
  assert.equal(result.netCommission, 50);
  assert.equal(result.breakdown.reduce((sum, line) => sum + line.commission, 0), 50);
  assert.equal(result.campaignsUsed[0].amount, 50);
  assert.equal(reservations.size, 1);
});
test('fixed campaign rewards also share the order cap', async () => {
  rules = [rule({ reward_type: 'FIXED', reward_value: 40 })];
  const result = await calculateCommission(items, 0, 200, 'order');
  assert.deepEqual(result.breakdown.map(line => line.commission), [40, 10]);
  assert.equal(result.netCommission, 50);
});
test('independent campaigns retain independent caps and discounted item bases', async () => {
  rules = [rule({ campaign_id: 'product', scope_type: 'PRODUCT', scope_id: 'p1', max_reward_cap: 30 }), rule({ max_reward_cap: 20 })];
  const result = await calculateCommission(items, 0, 100, 'order');
  assert.equal(result.netCommission, 50);
  assert.deepEqual(result.breakdown.map(line => line.item_value), [50, 50]);
  assert.equal(result.campaignsUsed.length, 2);
});
test('minimum-order and exhausted campaign candidates fall through to another eligible campaign', async () => {
  rules = [rule({ campaign_id: 'minimum', scope_type: 'PRODUCT', scope_id: 'p1', min_order_value: 500 }), rule({ campaign_id: 'exhausted', scope_type: 'CATEGORY', scope_id: 'c1' }), rule({ reward_value: 10, max_reward_cap: null })];
  const result = await calculateCommission(items, 0, 200, 'order');
  assert.equal(result.netCommission, 20);
  assert.deepEqual(result.campaignsUsed.map(c => c.campaign_id), ['campaign']);
  const referral = await matchReferralCampaign({ orderId: 'order2', items: [{ productId: 'p1', categoryId: 'c1' }], eligibleBase: 200 });
  assert.equal(referral.campaign_id, 'campaign');
});
test('equal-specificity campaign tie is stable regardless of query order', () => {
  const a = rule({ campaign_id: 'a' }), b = rule({ campaign_id: 'b' });
  assert.equal(matchingRulesForItem([b, a], {})[0].campaign_id, 'a');
  assert.equal(matchingRulesForItem([a, b], {})[0].campaign_id, 'a');
});
test('default commissions preserve category fallback and tier bonus when no campaign matches', async () => {
  const result = await calculateCommission(items, 2, 100, 'order');
  assert.equal(result.netCommission, 7);
});
const referral = id => ({ id, referrer_id: 'referrer', referrer_profile_id: 'referrer', referrer_profile: { ...profiles.get('referrer') }, referee_id: id + '-user', status: 'RETURN_WINDOW_ACTIVE', campaign_id: 'campaign', applied_reward_value: 75, membership_eligible: true });
test('concurrent campaign reward credits cannot exceed the referrer lifetime allowance', async () => {
  transactions.set('one', referral('one')); transactions.set('two', referral('two'));
  await Promise.all([processReturnWindowExpiry('one'), processReturnWindowExpiry('two')]);
  assert.equal(profiles.get('referrer').total_earnings, 100);
  assert.equal(rewards.reduce((sum, reward) => sum + reward.amount, 0), 20);
  assert.equal(locks, 2);
  assert.equal(transactions.get('one').referrer_reward_amount + transactions.get('two').referrer_reward_amount, 20);
});
test('reward replay is a no-op and zero allowance creates no active zero-value reward', async () => {
  profiles.get('referrer').total_earnings = 100;
  transactions.set('one', referral('one'));
  await processReturnWindowExpiry('one'); await processReturnWindowExpiry('one');
  assert.equal(rewards.length, 0);
  assert.equal(profiles.get('referrer').total_earnings, 100);
});
test('a previous order disqualifies first-order-only referral rewards', async () => {
  priorOrder = { id: 'previous' };
  await onOrderPlaced('user', 'new-order', 'NEW', 200);
  assert.equal(locks, 0);
  assert.equal(transactions.size, 0);
});
test('notification preview whitespace matches actual rendering and variable validation', () => {
  assert.equal(interpolate('Earn {{ amount }} in {{validity_days}} days', { amount: 20, validity_days: 7 }), 'Earn 20 in 7 days');
  assert.match(validateTemplateVariables('REWARD_CREDITED', '{{ unknown }}', ''), /Unsupported/);
});

test('disabling first-order-only rules permits a later qualifying order', async () => {
  priorOrder = { id: 'previous' }; firstOrderOnly = false;
  await onOrderPlaced('user', 'new-order', 'NEW', 200);
  assert.equal(orderPlacements, 1);
});
test('referral rewards wait until durable affiliate precedence is resolved', async () => {
  transactions.set('one', { ...referral('one'), order_id: 'order1' });
  await processReturnWindowExpiry('one');
  assert.equal(rewards.length, 0); assert.equal(transactions.get('one').status, 'RETURN_WINDOW_ACTIVE');
});
