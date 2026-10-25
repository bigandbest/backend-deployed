import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
let rows, commissions, debits, shouldFail, delivered, writes;
const prisma = {
  orders: {
    findMany: async () => rows.filter(row => !row.affiliate_attribution_processed_at),
    update: async ({ where, data }) => { const row = rows.find(row => row.id === where.id); Object.assign(row, data, { affiliate_attribution_attempts: (row.affiliate_attribution_attempts || 0) + 1 }); writes++; },
  },
  order_items: { count: async () => 1 },
  order_tracking: { findFirst: async () => ({ timestamp: new Date('2026-10-20') }) },
  wallet_transactions: { findFirst: async ({ where }) => debits.has(where.reference_id) ? {} : null },
};
mock.module('../../services/affiliateReturnService.js', { namedExports: { reconcileAffiliateReturns: async () => {} } });
mock.module('../../config/prisma.js', { defaultExport: prisma });
mock.module('../../services/affiliateService.js', { namedExports: {
  processAffiliateOrder: async id => {
    if (shouldFail) throw new Error('Temporary database outage');
    if (!commissions.has(id)) commissions.set(id, { id: 'aff-' + id });
    return commissions.get(id);
  },
  onOrderDelivered: async (id, at) => { delivered.set(id, at); },
} });
const { normalizeAffiliateAttribution, reconcileAffiliateAttribution } = await import('../../services/affiliateAttribution.js');
const row = patch => ({ id: 'one', affiliate_attribution: { affiliate_code: 'AFF1', click_id: null }, status: 'pending', payment_method: 'COD', ...patch });
beforeEach(() => { rows = []; commissions = new Map(); debits = new Set(); shouldFail = false; delivered = new Map(); writes = 0; });
test('attribution input rejects malformed codes and click IDs and discards unknown fields', () => {
  assert.equal(normalizeAffiliateAttribution({ affiliate_code: {} }), null);
  assert.equal(normalizeAffiliateAttribution({ affiliate_code: 'AFF1', click_id: 'invalid' }), null);
  assert.deepEqual(normalizeAffiliateAttribution({ affiliate_code: ' AFF1 ', user_id: 'attacker' }), { affiliate_code: 'AFF1', click_id: null });
});
test('transient conversion failure remains durable and is reconciled on the next run', async () => {
  rows = [row()]; shouldFail = true;
  assert.equal((await reconcileAffiliateAttribution()).failed, 1);
  assert.equal(rows[0].affiliate_attribution_processed_at, undefined);
  assert.match(rows[0].affiliate_attribution_error, /outage/);
  shouldFail = false;
  assert.equal((await reconcileAffiliateAttribution()).processed, 1);
  assert.equal(rows[0].affiliate_attribution_error, null);
  assert.equal(commissions.size, 1);
  await reconcileAffiliateAttribution();
  assert.equal(commissions.size, 1);
  assert.equal(writes, 2);
});
test('unpaid wallet orders are deferred until a completed debit exists', async () => {
  rows = [row({ payment_method: 'Prepaid (wallet)' })];
  await reconcileAffiliateAttribution(); assert.equal(commissions.size, 0); assert.equal(writes, 0);
  debits.add('one'); await reconcileAffiliateAttribution(); assert.equal(commissions.size, 1);
});
test('cancelled, failed, returned and refunded orders never create a commission', async () => {
  rows = ['Cancelled', 'Canceled', 'FAILED', 'Returned', 'Refunded'].map((status, i) => row({ id: String(i), status }));
  await reconcileAffiliateAttribution(); assert.equal(commissions.size, 0);
  assert.ok(rows.every(order => order.affiliate_attribution_processed_at));
});
test('late attribution restores the delivery return window from recorded tracking', async () => {
  rows = [row({ status: 'Delivered' })]; await reconcileAffiliateAttribution();
  assert.equal(delivered.get('one').toISOString(), '2026-10-20T00:00:00.000Z');
});
