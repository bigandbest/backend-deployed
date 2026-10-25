import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
let referral, returns, profile, creates;
const prisma = {
  $queryRaw: async () => [],
  referral_transactions: {
    findFirst: async ({ where }) => where.status.in.includes(referral.status) ? { ...referral } : null,
    findUnique: async () => ({ ...referral }),
    update: async ({ data }) => { Object.assign(referral, data); return referral; },
  },
  orders: { findUnique: async () => ({ subtotal: 400, coupon_discount: 40, order_items: [{ id: 'item1', price: 100, quantity: 2 }, { id: 'item2', price: 200, quantity: 1 }] }) },
  return_orders: { findMany: async () => returns },
  user_referral_profiles: {
    findUnique: async ({ where }) => where.user_id ? profile : null,
    upsert: async ({ create }) => { if (!profile) { creates++; profile = { id: 'profile', ...create }; } return profile; },
  },
};
let tail = Promise.resolve();
prisma.$transaction = async operation => { let release; const previous = tail; tail = new Promise(resolve => { release = resolve; }); await previous; try { return await operation(prisma); } finally { release(); } };
mock.module('../../config/prisma.js', { defaultExport: prisma });
const { onOrderReturned, getOrCreateReferralProfile } = await import('../../services/referralService.js');
beforeEach(() => { referral = { id: 'referral', status: 'RETURN_WINDOW_ACTIVE', order_amount: 360, return_amount: 0, status_history: [] }; returns = [{ return_order_items: [{ order_item_id: 'item1', quantity: 1 }] }]; profile = null; creates = 0; });
test('replayed partial referral returns preserve the discounted eligible base and deduct once', async () => {
  await Promise.all([onOrderReturned('order1', 'PARTIAL', 999), onOrderReturned('order1', 'PARTIAL', 999)]);
  assert.equal(referral.order_amount, 270); assert.equal(referral.return_amount, 100); assert.equal(referral.status_history.length, 1);
});
test('subsequent completed referral returns recalculate the cumulative eligible amount', async () => {
  await onOrderReturned('order1', 'PARTIAL', 100); returns.push({ return_order_items: [{ order_item_id: 'item1', quantity: 1 }] });
  await onOrderReturned('order1', 'PARTIAL', 100); assert.equal(referral.order_amount, 180); assert.equal(referral.return_amount, 200);
});
test('parallel referral reads create only one profile', async () => {
  const profiles = await Promise.all([getOrCreateReferralProfile('user1', 'Test'), getOrCreateReferralProfile('user1', 'Test')]);
  assert.equal(creates, 1); assert.equal(profiles[0].referral_code, profiles[1].referral_code);
});
