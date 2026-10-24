import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrowthPublicService } from '../../services/growthPublicService.js';

const now = new Date('2026-10-24T12:00:00Z');
function service({ referral = null, affiliate = null, campaigns = [] } = {}) {
  return createGrowthPublicService({ now: () => now, prisma: {
    referral_configs: { findFirst: async () => referral },
    affiliate_configs: { findFirst: async () => affiliate },
    affiliate_category_commissions: { findMany: async () => [] },
    campaigns: { findMany: async () => campaigns },
    products: { findMany: async () => [{ id: 'product', name: 'Soap' }] },
    categories: { findMany: async () => [{ id: 'category', name: 'Care' }] },
  } });
}

test('public config projects admin acquisition overrides, numeric rewards, and nested referral tiers', async () => {
  const data = await service({
    referral: { is_enabled: false, new_referral_signups_enabled: true, referrer_reward_amount: '90', tiered_rewards_config: { tiers: [{ name: 'Gold', minReferrals: 10, reward: 125 }] }, enable_ip_tracking: true, updated_by: 'private-admin' },
    affiliate: { is_enabled: false, new_links_enabled: true, new_applications_enabled: true, minimum_payout_amount: '500', withdrawal_enabled: true },
  }).getConfig();
  assert.equal(data.referral.new_signups_enabled, false);
  assert.equal(data.affiliate.new_links_enabled, false);
  assert.equal(data.affiliate.new_applications_enabled, false);
  assert.equal(data.affiliate.withdrawal_enabled, true, 'withdrawal pause is independent from acquisition');
  assert.equal(data.referral.referrer_reward_amount, 90);
  assert.deepEqual(data.referral.tiers, [{ name: 'Gold', minReferrals: 10, reward: 125 }]);
  assert.equal('enable_ip_tracking' in data.referral, false);
  assert.equal('updated_by' in data.referral, false);
});

test('missing config returns established program defaults without writes', async () => {
  const data = await service().getConfig();
  assert.equal(data.affiliate.cookie_duration_hours, 24);
  assert.equal(data.affiliate.minimum_payout_amount, 500);
  assert.equal(data.referral.referrer_reward_amount, 75);
  assert.equal(data.referral.new_signups_enabled, true);
});

const campaign = (id, scope, extra = {}) => ({
  id, name: id, description: 'internal operator notes', channel: 'AFFILIATE', is_active: true,
  starts_at: new Date('2026-10-23T00:00:00Z'), ends_at: new Date('2026-10-25T00:00:00Z'),
  usage_limit: null, used_count: 0,
  campaign_rule: { scope_type: scope, scope_id: scope === 'PRODUCT' ? 'product' : scope === 'CATEGORY' ? 'category' : null, reward_type: 'PERCENTAGE', reward_value: '15', max_reward_cap: '100', min_order_value: '200' }, ...extra,
});
test('campaign feed includes product, category, store scopes and excludes ended, inactive, exhausted, other-channel offers', async () => {
  const data = await service({ campaigns: [
    campaign('product', 'PRODUCT'), campaign('category', 'CATEGORY'), campaign('store', 'STORE_WIDE'),
    campaign('ended', 'STORE_WIDE', { ends_at: now }),
    campaign('scheduled', 'STORE_WIDE', { starts_at: new Date('2026-10-25T00:00:00Z') }),
    campaign('inactive', 'STORE_WIDE', { is_active: false }),
    campaign('exhausted', 'STORE_WIDE', { usage_limit: 1, used_count: 1 }),
    campaign('referral', 'STORE_WIDE', { channel: 'REFERRAL' }),
  ] }).getCampaigns('AFFILIATE');
  assert.deepEqual(data.map(row => row.id), ['product', 'category', 'store']);
  assert.deepEqual(data.map(row => row.scope_name), ['Soap', 'Care', 'Entire store']);
  assert.equal(data[0].reward_value, 15);
  assert.equal(data[0].min_order_value, 200);
  assert.ok(data.every(row => !('description' in row) && !('used_count' in row)));
});

test('campaign channels are validated before catalog access', async () => {
  await assert.rejects(service().getCampaigns('ADMIN'), { status: 400 });
});
