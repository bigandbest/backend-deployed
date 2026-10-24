import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let config, profile, application, links, clicks, stats;
const prisma = {
  affiliate_profiles: {
    findUnique: async () => profile,
    update: async () => { stats.profileUpdates++; return profile; },
  },
  affiliate_configs: { findFirst: async () => config },
  affiliate_applications: { findFirst: async () => application, create: async ({ data }) => { stats.applicationWrites++; return { id: "app-new", ...data }; } },
  products: { findUnique: async ({ where }) => where.id === '11111111-1111-4111-8111-111111111111' ? { id: '11111111-1111-4111-8111-111111111111', name: 'Soap' } : null },
  categories: { findUnique: async () => ({ id: '22222222-2222-4222-8222-222222222222', name: 'Skin Care' }) },
  affiliate_links: {
    create: async ({ data }) => { const row = { id: 'link1', is_active: true, ...data }; links.set(data.link_code, row); return row; },
    findUnique: async ({ where }) => links.get(where.link_code) || null,
    update: async () => { stats.linkClicks++; },
    updateMany: async ({ data }) => { stats.linkOrders += data.total_orders.increment; return { count: 1 }; },
  },
  affiliate_clicks: {
    create: async ({ data }) => { const row = { id: 'click1', is_converted: false, ...data }; clicks.set(row.id, row); return row; },
    findUnique: async ({ where }) => clicks.get(where.id) || null,
    updateMany: async ({ where, data }) => {
      const row = clicks.get(where.id);
      if (!row || row.is_converted !== where.is_converted) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
  },
  $transaction: async operation => { stats.transactions++; return operation(prisma); },
};
mock.module('../../config/prisma.js', { defaultExport: prisma });
mock.module('../../services/affiliateService.js', { namedExports: {
  generateLinkCode: async () => 'TRACK123', generateAffiliateCode: async () => 'AFF1', processAffiliateOrder: async () => null,
} });
const { generateLink, updateAffiliateProfile, requestPayout } = await import('../../controller/affiliateDashboardController.js');
const { recordRefClick } = await import('../../controller/affiliateTrackingController.js');
const { getApplicationStatus, applyForAffiliate } = await import('../../controller/affiliateApplicationController.js');
const { default: dao } = await import('../../dao/affiliate.dao.js');
const response = () => ({ statusCode: 200, body: null, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const request = body => ({ body, user: { id: 'customer1' }, headers: {}, ip: '127.0.0.1' });
beforeEach(() => {
  config = { is_enabled: true, new_links_enabled: true, new_applications_enabled: true, cookie_duration_hours: 24 };
  profile = { id: 'affiliate1', affiliate_code: 'AFF1', status: 'ACTIVE', is_blocked: false };
  application = { id: 'app1', status: 'REJECTED' };
  links = new Map(); clicks = new Map(); stats = { profileUpdates: 0, linkClicks: 0, linkOrders: 0, applicationWrites: 0, transactions: 0 };
});

test('product generation and click recording preserve the generated link identity end to end', async () => {
  const generated = response();
  await generateLink(request({ destination_type: 'PRODUCT', product_id: '11111111-1111-4111-8111-111111111111', campaign_name: 'Soap Campaign' }), generated);
  assert.equal(generated.statusCode, 201);
  const link = generated.body.data;
  const url = new URL(link.full_url);
  assert.match(url.pathname, /\/pages\/singleproduct\/11111111-1111-4111-8111-111111111111$/);
  assert.equal(url.searchParams.get('ref'), 'AFF1');
  assert.equal(url.searchParams.get('link_code'), link.link_code);
  const recorded = response();
  await recordRefClick(request({ affiliate_code: url.searchParams.get('ref'), link_code: url.searchParams.get('link_code'), destination_url: url.toString() }), recorded);
  assert.equal(recorded.body.success, true);
  assert.equal(clicks.get('click1').link_id, link.id);
  assert.equal(stats.linkClicks, 1);
  assert.ok(new Date(recorded.body.data.expiresAt) > new Date());
});

test('store and category links retain share tracking parameters', async () => {
  for (const body of [{ destination_type: 'HOMEPAGE' }, { destination_type: 'CATEGORY', category_id: '22222222-2222-4222-8222-222222222222' }]) {
    const res = response(); await generateLink(request(body), res);
    assert.equal(res.statusCode, 201);
    const url = new URL(res.body.data.full_url);
    assert.equal(url.searchParams.get('ref'), 'AFF1');
    assert.equal(url.searchParams.get('link_code'), 'TRACK123');
    if (body.category_id) assert.equal(url.searchParams.get('category'), 'Skin Care');
  }
});

test('paused programs and incomplete product destinations cannot create links', async () => {
  config.is_enabled = false;
  let res = response(); await generateLink(request({ destination_type: 'HOMEPAGE' }), res);
  assert.equal(res.statusCode, 400);
  config.is_enabled = true;
  for (const body of [{ destination_type: 'PRODUCT' }, { destination_type: 'CATEGORY' }, { destination_type: 'SEARCH', search_query: ' ' }, { destination_type: 'OTHER' }]) {
    res = response(); await generateLink(request(body), res); assert.equal(res.statusCode, 400);
  }
  assert.equal(links.size, 0);
});

test('inactive and other-affiliate links cannot receive click credit', async () => {
  for (const row of [{ affiliate_id: 'other', is_active: true }, { affiliate_id: 'affiliate1', is_active: false }]) {
    links.set('TRACK123', { id: 'link1', link_code: 'TRACK123', ...row });
    const res = response(); await recordRefClick(request({ affiliate_code: 'AFF1', link_code: 'TRACK123' }), res);
    assert.equal(res.statusCode, 400); assert.equal(clicks.size, 0);
  }
});

test('legacy affiliate ref links remain valid', async () => {
  const res = response(); await recordRefClick(request({ affiliate_code: 'AFF1' }), res);
  assert.equal(res.body.success, true); assert.equal(clicks.get('click1').link_id, null);
});

test('repeated conversion finalization counts a generated link order only once', async () => {
  clicks.set('click1', { id: 'click1', affiliate_id: 'affiliate1', link_id: 'link1', is_converted: false });
  const order = { click_id: 'click1', affiliate_id: 'affiliate1', order_id: 'order1', final_order_value: 100, final_commission: 5 };
  await Promise.all([dao.finalizeClickAttribution(order), dao.finalizeClickAttribution(order)]);
  assert.equal(stats.linkOrders, 1);
});

test('rejected applicants receive the current admin application pause flag', async () => {
  config.new_applications_enabled = false;
  const res = response(); await getApplicationStatus(request({}), res);
  assert.equal(res.body.data.status, 'REJECTED'); assert.equal(res.body.new_applications_enabled, false);
});


test('application API rejects malformed contact/payment data and missing consent without storing a row', async () => {
  const valid = { full_name: 'Sample User', phone: '9876543210', primary_platform: 'Instagram', promotion_strategy: 'I will share product reviews and honest recommendations with my audience.', payment_method: 'UPI', upi_id: 'sample@upi', agreed_to_terms: true };
  for (const patch of [{ phone: {} }, { upi_id: 'invalid' }, { agreed_to_terms: false }, { estimated_audience: '12.5' }]) {
    const res = response(); await applyForAffiliate(request({ ...valid, ...patch }), res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.fields[Object.keys(patch)[0]]);
  }
  assert.equal(stats.applicationWrites, 0);
  const res = response(); await applyForAffiliate(request(valid), res);
  assert.equal(res.statusCode, 201); assert.equal(stats.applicationWrites, 1);
});

test('malformed product IDs return a field error instead of reaching Prisma with invalid UUIDs', async () => {
  const res = response(); await generateLink(request({ destination_type: 'PRODUCT', product_id: { id: 'bad' } }), res);
  assert.equal(res.statusCode, 400); assert.ok(res.body.fields.product_id); assert.equal(links.size, 0);
});


test('profile updates cannot persist malformed active payout details', async () => {
  const res = response();
  await updateAffiliateProfile(request({ payment_method: 'BANK_TRANSFER', bank_account_number: '001234567890', bank_ifsc_code: 'invalid', account_holder_name: 'Sample User' }), res);
  assert.equal(res.statusCode, 400); assert.ok(res.body.fields.bank_ifsc_code);
  assert.equal(stats.profileUpdates, 0);
});

test('payouts with invalid saved details fail before any commission transaction', async () => {
  config.withdrawal_enabled = true; config.minimum_payout_amount = 100;
  profile.available_balance = 1000; profile.payment_method = 'UPI'; profile.upi_id = 'invalid';
  const res = response(); await requestPayout(request({}), res);
  assert.equal(res.statusCode, 400); assert.ok(res.body.fields.upi_id);
  assert.equal(stats.transactions, 0);
});
