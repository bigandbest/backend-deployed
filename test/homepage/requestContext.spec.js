import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContext, parseKeys, feedEnabled, cacheControlFor } from '../../services/homepage/requestContext.js';

const req = (query = {}, headers = {}) => ({ query, headers });

test('platform is required and validated', () => {
  assert.ok(parseContext(req({})).error);
  assert.ok(parseContext(req({ platform: 'tv' })).error);
  assert.deepEqual(parseContext(req({ platform: 'web' })).ctx, { platform: 'web', warehouseId: null, pincode: null });
});

test('warehouse_id must be a positive integer; contract version must be 1', () => {
  assert.equal(parseContext(req({ platform: 'web', warehouse_id: '3' })).ctx.warehouseId, 3);
  assert.ok(parseContext(req({ platform: 'web', warehouse_id: 'abc' })).error);
  assert.ok(parseContext(req({ platform: 'web', warehouse_id: '-1' })).error);
  assert.ok(parseContext(req({ platform: 'web', warehouse_id: '1; DROP' })).error);
  assert.ok(parseContext(req({ platform: 'web', v: '2' })).error);
  assert.ok(parseContext(req({ platform: 'web', v: '1' })).ctx);
});

test('pincode header: valid is used, malformed is silently ignored (never breaks the homepage)', () => {
  assert.equal(parseContext(req({ platform: 'web' }, { 'x-user-pincode': '560001' })).ctx.pincode, '560001');
  assert.equal(parseContext(req({ platform: 'web' }, { 'x-user-pincode': '56000' })).ctx.pincode, null);
  assert.equal(parseContext(req({ platform: 'web' }, { 'x-user-pincode': "560001'; --" })).ctx.pincode, null);
});

test('keys: required, <= 8, key-pattern only, de-duplicated', () => {
  assert.ok(parseKeys(req({})).error);
  assert.ok(parseKeys(req({ keys: '' })).error);
  assert.ok(parseKeys(req({ keys: 'a_b,../etc' })).error);
  assert.ok(parseKeys(req({ keys: 'Upper' })).error);
  assert.ok(parseKeys(req({ keys: Array.from({ length: 9 }, (_, i) => `key_${i}`).join(',') })).error);
  assert.deepEqual(parseKeys(req({ keys: 'quick_picks, daily_deals ,quick_picks' })).keys, ['quick_picks', 'daily_deals']);
});

test('feed defaults ON (kill switch is explicit opt-out); cache headers never share pincode-specific responses', () => {
  assert.equal(feedEnabled({}), true, 'enabled by default: the feed is the only homepage path');
  assert.equal(feedEnabled({ HOMEPAGE_FEED_ENABLED: 'true' }), true);
  assert.equal(feedEnabled({ HOMEPAGE_FEED_ENABLED: 'no' }), false);
  assert.equal(feedEnabled({ HOMEPAGE_FEED_ENABLED: 'false' }), false);
  assert.match(cacheControlFor('560001'), /private, no-store/);
  assert.match(cacheControlFor(null), /s-maxage=60/);
});
