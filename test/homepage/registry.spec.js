// Run with: npm run test:homepage   (node:test — the repo's Jest setup is CJS-in-ESM and not usable for ESM units)
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefinition, listTypes, validateSection, resolveLoad, describeTypes } from '../../services/homepage/registry/index.js';
import { validateConfig } from '../../services/homepage/registry/schema.js';

test('registry exposes every type used by the backfill migration', () => {
  const expected = [
    'HERO_CAROUSEL', 'CATEGORY_GRID', 'DUAL_CATEGORY_PAIR', 'PRODUCT_CAROUSEL', 'DEAL_CARDS', 'BRAND_GRID',
    'STORE_GRID', 'VIDEO_CARDS', 'BANNER_STRIP', 'PROMO_CARDS', 'MOBILE_BANNERS', 'TABBED_PRODUCTS', 'TESTIMONIALS',
  ];
  for (const t of expected) assert.ok(getDefinition(t), `missing definition ${t}`);
  assert.deepEqual([...listTypes()].sort(), [...expected].sort());
});

test('configs written by the M2 backfill are valid for their type', () => {
  const backfilled = [
    ['PRODUCT_CAROUSEL', { source: 'SUPER_SAVER', limit: 12 }],
    ['PRODUCT_CAROUSEL', { source: 'NEW_ARRIVALS', limit: 20 }],
    ['PRODUCT_CAROUSEL', { source: 'MAPPED', limit: 20 }],
    ['DUAL_CATEGORY_PAIR', { theme: 'dual' }],
    ['DUAL_CATEGORY_PAIR', { theme: 'discount' }],
    ['HERO_CAROUSEL', {}],
  ];
  for (const [type, config] of backfilled) {
    const r = validateSection({ type, config });
    assert.ok(r.ok, `${type} ${JSON.stringify(config)}: ${r.errors.join('; ')}`);
  }
});

test('defaults are applied and unknown keys rejected (mass-assignment protection)', () => {
  const ok = validateSection({ type: 'PRODUCT_CAROUSEL', config: {} });
  assert.ok(ok.ok);
  assert.equal(ok.config.source, 'MAPPED');
  assert.equal(ok.config.limit, 20);
  assert.equal(ok.config.layout, 'carousel');

  const bad = validateSection({ type: 'PRODUCT_CAROUSEL', config: { limit: 20, __proto__x: 1, evil: 'x' } });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /unknown config key "evil"/);
});

test('range / enum / type errors are reported', () => {
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { limit: 0 } }).ok, false);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { limit: 999 } }).ok, false);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { limit: '5' } }).ok, false);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { layout: 'masonry' } }).ok, false);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { showSeeAll: 'yes' } }).ok, false);
  assert.equal(validateSection({ type: 'NOPE', config: {} }).ok, false);
});

test('CTA href only allows relative paths or https (no javascript: / data:)', () => {
  assert.ok(validateSection({ type: 'PRODUCT_CAROUSEL', config: { ctaHref: '/category/abc' } }).ok);
  assert.ok(validateSection({ type: 'PRODUCT_CAROUSEL', config: { ctaHref: 'https://example.com/x' } }).ok);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { ctaHref: 'javascript:alert(1)' } }).ok, false);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', config: { ctaHref: 'http://insecure' } }).ok, false);
});

test('mapping capabilities are enforced per type', () => {
  assert.ok(validateSection({ type: 'PRODUCT_CAROUSEL', mappings: { PRODUCT: 3, GROUP: 2, CATEGORY: 1 } }).ok);
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', mappings: { SUBCATEGORY: 1 } }).ok, false);
  assert.equal(validateSection({ type: 'HERO_CAROUSEL', mappings: { PRODUCT: 1 } }).ok, false);
  assert.equal(validateSection({ type: 'CATEGORY_GRID', mappings: { CATEGORY: 1 } }).ok, false, 'category grid reads the hierarchy, not mappings');
  assert.ok(validateSection({ type: 'HERO_CAROUSEL', mappings: { PRODUCT: 0 } }).ok, 'zero count is fine');
  assert.equal(validateSection({ type: 'PRODUCT_CAROUSEL', mappings: { BOGUS: 1 } }).ok, false);
});

test('non-MAPPED product sources reject mappings that would be silently ignored', () => {
  const r = validateSection({ type: 'PRODUCT_CAROUSEL', config: { source: 'SUPER_SAVER' }, mappings: { GROUP: 2 } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /does not use mappings/);
  assert.ok(validateSection({ type: 'PRODUCT_CAROUSEL', config: { source: 'SUPER_SAVER' }, mappings: {} }).ok);
});

test('platform rules: MOBILE_BANNERS is mobile-only', () => {
  assert.ok(validateSection({ type: 'MOBILE_BANNERS', platforms: ['mobile'] }).ok);
  assert.equal(validateSection({ type: 'MOBILE_BANNERS', platforms: ['web'] }).ok, false);
  assert.equal(validateSection({ type: 'HERO_CAROUSEL', platforms: [] }).ok, false);
  assert.equal(validateSection({ type: 'HERO_CAROUSEL', platforms: ['tv'] }).ok, false);
});

test('pair children need a pair parent and a left/right slot', () => {
  assert.ok(validateSection({ type: 'DUAL_CATEGORY_PAIR', placement: { parentType: 'DUAL_CATEGORY_PAIR', slot: 'left' }, mappings: { CATEGORY: 1 } }).ok);
  assert.equal(validateSection({ type: 'DUAL_CATEGORY_PAIR', placement: { parentType: 'PRODUCT_CAROUSEL', slot: 'left' } }).ok, false);
  assert.equal(validateSection({ type: 'DUAL_CATEGORY_PAIR', placement: { parentType: 'DUAL_CATEGORY_PAIR', slot: 'middle' } }).ok, false);
});

test('load_mode validation and INITIAL/DEFERRED resolution', () => {
  assert.equal(validateSection({ type: 'HERO_CAROUSEL', loadMode: 'SOMETIMES' }).ok, false);
  // explicit wins
  assert.equal(resolveLoad({ load_mode: 'DEFERRED', section_type: 'HERO_CAROUSEL' }, 1, 6), 'DEFERRED');
  assert.equal(resolveLoad({ load_mode: 'INITIAL', section_type: 'TESTIMONIALS' }, 99, 6), 'INITIAL');
  // AUTO: type default OR within the position budget
  assert.equal(resolveLoad({ load_mode: 'AUTO', section_type: 'HERO_CAROUSEL' }, 30, 6), 'INITIAL');
  assert.equal(resolveLoad({ load_mode: 'AUTO', section_type: 'PRODUCT_CAROUSEL' }, 3, 6), 'INITIAL');
  assert.equal(resolveLoad({ load_mode: 'AUTO', section_type: 'PRODUCT_CAROUSEL' }, 7, 6), 'DEFERRED');
  // unknown type is never eager
  assert.equal(resolveLoad({ load_mode: 'AUTO', section_type: 'MYSTERY' }, 1, 6), 'DEFERRED');
});

test('describeTypes() is JSON-serialisable (no RegExp / functions leak to the admin UI)', () => {
  const round = JSON.parse(JSON.stringify(describeTypes()));
  assert.equal(round.length, listTypes().length);
  const pc = round.find((t) => t.type === 'PRODUCT_CAROUSEL');
  assert.deepEqual(pc.mappings, ['PRODUCT', 'CATEGORY', 'GROUP']);
  assert.ok(pc.config.some((f) => f.key === 'limit' && f.max === 50));
});

test('validateConfig: null/undefined config is treated as empty; arrays rejected', () => {
  assert.ok(validateConfig({ a: { type: 'int', default: 1 } }, undefined).ok);
  assert.ok(validateConfig({ a: { type: 'int', default: 1 } }, null).ok);
  assert.equal(validateConfig({ a: { type: 'int', default: 1 } }, []).ok, false);
  assert.equal(validateConfig({ a: { type: 'int', required: true } }, {}).ok, false);
});
