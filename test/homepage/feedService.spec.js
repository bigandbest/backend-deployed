import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomepageFeedService } from '../../services/homepage/HomepageFeedService.js';
import { toHomepageProduct } from '../../services/homepage/entities/productProjection.js';
import { createAvailabilityOverlay } from '../../services/homepage/AvailabilityOverlay.js';
import { RESOLVERS } from '../../services/homepage/resolvers/index.js';

// Silence structured logs during tests
const origLog = console.log; const origWarn = console.warn; const origErr = console.error;
test.before(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
test.after(() => { console.log = origLog; console.warn = origWarn; console.error = origErr; });

const sec = (o) => ({
  section_name: o.section_key, description: null, config: {}, config_version: 1, platforms: ['web', 'mobile'],
  load_mode: 'AUTO', parent_section_id: null, slot: null, ...o,
});

const product = (id) => ({ id, name: id, image: null, brand: null, storeName: null, rating: null, reviewCount: null, price: 10, oldPrice: null, discountPct: null, inStock: true, stock: 5, defaultVariantId: `v-${id}`, variants: [] });

function makeService(over = {}) {
  const calls = { selectProducts: 0, hydrate: 0, plan: 0 };
  const plan = over.plan ?? {
    sections: [
      sec({ id: 1, section_key: 'hero', section_type: 'HERO_CAROUSEL', display_order: 10 }),
      sec({ id: 2, section_key: 'quick', section_type: 'PRODUCT_CAROUSEL', display_order: 20, load_mode: 'INITIAL', config: { source: 'SUPER_SAVER', limit: 3 } }),
      sec({ id: 3, section_key: 'essentials', section_type: 'PRODUCT_CAROUSEL', display_order: 30, load_mode: 'DEFERRED', config: { source: 'MAPPED', limit: 3 } }),
      sec({ id: 4, section_key: 'mobile_only', section_type: 'MOBILE_BANNERS', display_order: 40, platforms: ['mobile'] }),
      sec({ id: 5, section_key: 'weekly', section_type: 'NOT_A_TYPE', display_order: 50 }),
    ],
    mappings: {},
  };
  const service = createHomepageFeedService({
    loadPlan: async () => { calls.plan++; return plan; },
    selectProducts: over.selectProducts ?? (async (specs) => { calls.selectProducts++; return new Map(specs.map((s) => [s.id, s.source === 'SUPER_SAVER' ? ['p1', 'p2', 'p3'] : ['p2', 'p4']])); }),
    hydrateProducts: over.hydrateProducts ?? (async (ids) => { calls.hydrate++; return new Map(ids.map((i) => [i, product(i)])); }),
    resolvers: over.resolvers ?? {
      ...RESOLVERS,
      HERO_CAROUSEL: async ({ sections }) => new Map(sections.map((s) => [s.id, { data: { banners: [{ id: 'b1' }] } }])),
      MOBILE_BANNERS: async ({ sections }) => new Map(sections.map((s) => [s.id, { data: { banners: [{ id: 'm1' }] } }])),
    },
    makeCategoryLoader: () => async () => new Map(),
    applyAvailability: over.applyAvailability,
    now: () => new Date('2026-09-21T10:00:00.000Z'),
    initialCount: over.initialCount ?? 1,
  });
  return { service, calls };
}

test('feed: ordered, typed, INITIAL resolved / DEFERRED stubbed, unknown types dropped', async () => {
  const { service } = makeService();
  const feed = await service.getFeed({ platform: 'web' });
  assert.equal(feed.version, 1);
  assert.equal(feed.generatedAt, '2026-09-21T10:00:00.000Z');
  assert.deepEqual(feed.sections.map((s) => s.key), ['hero', 'quick', 'essentials']); // mobile_only + unknown type excluded on web
  const [hero, quick, essentials] = feed.sections;
  assert.equal(hero.status, 'OK'); assert.equal(hero.load, 'INITIAL');
  assert.equal(quick.status, 'OK'); assert.deepEqual(quick.data.productIds, ['p1', 'p2', 'p3']);
  assert.equal(essentials.status, 'DEFERRED'); assert.equal(essentials.data, null);
  assert.deepEqual(hero.order, 1); assert.equal(essentials.order, 3);
});

test('feed: platform filter — mobile sees mobile-only sections', async () => {
  const { service } = makeService();
  const feed = await service.getFeed({ platform: 'mobile' });
  assert.ok(feed.sections.some((s) => s.key === 'mobile_only'));
});

test('feed: deferred sections do NOT trigger product selection/hydration of their own', async () => {
  const { service } = makeService();
  const feed = await service.getFeed({ platform: 'web' });
  // only "quick" is INITIAL among product sections -> its 3 products only; essentials' p4 is not hydrated
  assert.deepEqual(Object.keys(feed.entities.products).sort(), ['p1', 'p2', 'p3']);
});

test('sections: deferred keys resolve in ONE product batch; unknown/inactive keys are GONE', async () => {
  const { service, calls } = makeService();
  const res = await service.getSections({ platform: 'web' }, ['essentials', 'quick', 'does_not_exist']);
  assert.equal(calls.selectProducts, 1);
  assert.equal(calls.hydrate, 1);
  const byKey = Object.fromEntries(res.sections.map((s) => [s.key, s]));
  assert.equal(byKey.essentials.status, 'OK');
  assert.deepEqual(byKey.essentials.data.productIds, ['p2', 'p4']);
  assert.equal(byKey.does_not_exist.status, 'GONE');
  // products shared by two sections appear once in entities
  assert.equal(Object.keys(res.entities.products).filter((k) => k === 'p2').length, 1);
});

test('normalization: a product used by two sections is stored once and referenced by id', async () => {
  const plan = {
    sections: [
      sec({ id: 2, section_key: 'quick', section_type: 'PRODUCT_CAROUSEL', display_order: 20, config: { source: 'SUPER_SAVER', limit: 3 } }),
      sec({ id: 3, section_key: 'essentials', section_type: 'PRODUCT_CAROUSEL', display_order: 30, config: { source: 'MAPPED', limit: 3 } }),
    ],
    mappings: {},
  };
  const { service } = makeService({ plan, initialCount: 99 });
  const feed = await service.getFeed({ platform: 'web' });
  const ids = feed.sections.filter((s) => s.type === 'PRODUCT_CAROUSEL').flatMap((s) => s.data.productIds);
  assert.ok(ids.filter((i) => i === 'p2').length >= 2, 'p2 referenced by both sections');
  assert.equal(Object.keys(feed.entities.products).filter((k) => k === 'p2').length, 1);
});

test('error isolation: one failing resolver does not fail the feed', async () => {
  const { service } = makeService({
    resolvers: {
      ...RESOLVERS,
      HERO_CAROUSEL: async () => { throw new Error('db down'); },
    },
  });
  const feed = await service.getFeed({ platform: 'web' });
  const hero = feed.sections.find((s) => s.key === 'hero');
  assert.equal(hero.status, 'ERROR');
  assert.equal(hero.error.code, 'RESOLVER_FAILED');
  assert.equal(feed.sections.find((s) => s.key === 'quick').status, 'OK');
});

test('error isolation: product batch failure marks only product sections ERROR', async () => {
  const { service } = makeService({ selectProducts: async () => { throw new Error('boom'); } });
  const feed = await service.getFeed({ platform: 'web' });
  assert.equal(feed.sections.find((s) => s.key === 'quick').status, 'ERROR');
  assert.equal(feed.sections.find((s) => s.key === 'hero').status, 'OK');
});

test('timeout: a hung resolver becomes RESOLVER_TIMEOUT', async () => {
  const { service } = makeService({
    resolvers: { ...RESOLVERS, HERO_CAROUSEL: () => new Promise(() => {}) },
  });
  const feed = await service.getFeed({ platform: 'web' });
  assert.equal(feed.sections.find((s) => s.key === 'hero').error.code, 'RESOLVER_TIMEOUT');
});

test('empty results are EMPTY (clients omit), not ERROR', async () => {
  const { service } = makeService({ selectProducts: async (specs) => new Map(specs.map((s) => [s.id, []])) });
  const feed = await service.getFeed({ platform: 'web' });
  assert.equal(feed.sections.find((s) => s.key === 'quick').status, 'EMPTY');
});

test('invalid stored config falls back to defaults instead of failing the feed', async () => {
  const plan = { sections: [sec({ id: 9, section_key: 'bad', section_type: 'PRODUCT_CAROUSEL', display_order: 1, load_mode: 'INITIAL', config: { limit: 9999, evil: true } })], mappings: {} };
  const { service } = makeService({ plan });
  const feed = await service.getFeed({ platform: 'web' });
  assert.equal(feed.sections[0].config.limit, 20);
  assert.equal(feed.sections[0].config.source, 'MAPPED');
});

test('pair children are nested under their parent and never appear top-level', async () => {
  const plan = {
    sections: [
      sec({ id: 11, section_key: 'dual_deals', section_type: 'DUAL_CATEGORY_PAIR', display_order: 10, load_mode: 'INITIAL', config: { theme: 'dual' } }),
      sec({ id: 26, section_key: 'dual_deals_left', section_type: 'DUAL_CATEGORY_PAIR', display_order: 20, parent_section_id: 11, slot: 'left' }),
      sec({ id: 27, section_key: 'dual_deals_right', section_type: 'DUAL_CATEGORY_PAIR', display_order: 30, parent_section_id: 11, slot: 'right' }),
    ],
    mappings: { 26: { CATEGORY: ['c2', 'c1'], SUBCATEGORY: [] }, 27: { CATEGORY: ['c3'], SUBCATEGORY: [] } },
  };
  const cats = new Map([['c1', { id: 'c1', name: 'Alpha', subcategories: [] }], ['c2', { id: 'c2', name: 'Beta', subcategories: [] }], ['c3', { id: 'c3', name: 'Gamma', subcategories: [] }]]);
  const { service } = makeService({ plan });
  // inject a category loader through a custom service
  const svc = createHomepageFeedService({
    loadPlan: async () => plan, selectProducts: async () => new Map(), hydrateProducts: async () => new Map(),
    resolvers: RESOLVERS, makeCategoryLoader: () => async () => cats, initialCount: 6,
  });
  const feed = await svc.getFeed({ platform: 'web' });
  assert.deepEqual(feed.sections.map((s) => s.key), ['dual_deals']);
  const d = feed.sections[0].data;
  assert.deepEqual(d.left.categoryIds, ['c1', 'c2'], 'sorted by name, like exclude_inferred=true');
  assert.deepEqual(d.right.categoryIds, ['c3']);
  assert.deepEqual(Object.keys(feed.entities.categories).sort(), ['c1', 'c2', 'c3']);
  void service;
});

test('availability overlay: applied once over the union, failure never fails the feed', async () => {
  let overlayCalls = 0;
  const { service } = makeService({
    applyAvailability: async (map) => { overlayCalls++; for (const [id, p] of map) map.set(id, { ...p, availability: { available: false } }); },
  });
  const feed = await service.getFeed({ platform: 'web', pincode: '560001' });
  assert.equal(overlayCalls, 1);
  assert.equal(feed.entities.products.p1.availability.available, false);

  const { service: failing } = makeService({ applyAvailability: async () => { throw new Error('redis'); } });
  const ok = await failing.getFeed({ platform: 'web', pincode: '560001' });
  assert.equal(ok.sections.find((s) => s.key === 'quick').status, 'OK');
  assert.equal(ok.entities.products.p1.availability, undefined);

  const { service: none } = makeService({ applyAvailability: async () => { overlayCalls += 100; } });
  await none.getFeed({ platform: 'web' }); // no pincode -> overlay skipped
  assert.equal(overlayCalls, 1);
});

test('availability overlay implementation: validates pincode, replaces entries (no mutation of shared objects)', async () => {
  const dao = { checkBulkAvailability: async (items) => Object.fromEntries(items.filter((i) => i.product_id === 'a').map((i) => [i.product_id, { available: false }])) };
  const overlay = createAvailabilityOverlay(dao);
  const shared = product('a');
  const map = new Map([['a', shared], ['b', product('b')]]);
  await overlay(map, '560001');
  assert.equal(map.get('a').availability.available, false);
  assert.equal(map.get('b').availability.available, true, 'missing entry defaults to available');
  assert.equal(shared.availability, undefined, 'original object untouched');
  const before = new Map([['a', shared]]);
  await overlay(before, 'abc'); // invalid pincode -> no-op
  assert.equal(before.get('a').availability, undefined);
});

test('projection: real old price only, discount derived, stock net of inventory, no purchasable variant -> null', () => {
  const row = {
    id: 'p', name: 'X', rating: 4.5, review_count: 3, brands: [{ brand: { id: 'b', name: 'Br' } }], store: { name: 'S' }, media: [{ url: 'u' }],
    variants: [
      { id: 'v1', title: '1kg', price: 80, old_price: 100, discount_percentage: null, net_quantity: '1kg', packaging_details: null, is_default: true, bulk_pricing_tiers: [{ min_quantity: 5, max_quantity: null, unit_price: 70 }] },
      { id: 'v2', title: '2kg', price: 150, old_price: 120, discount_percentage: null, is_default: false, bulk_pricing_tiers: [] }, // old <= price? here old < price -> not a discount
    ],
  };
  const stock = new Map([['v1', { available_stock: 4 }]]);
  const p = toHomepageProduct(row, stock);
  assert.equal(p.price, 80); assert.equal(p.oldPrice, 100); assert.equal(p.discountPct, 20);
  assert.equal(p.stock, 4); assert.equal(p.inStock, true);
  assert.equal(p.variants[1].oldPrice, null, 'never expose an old price lower than price');
  assert.equal(p.variants[0].bulkTiers[0].unitPrice, 70);
  assert.equal(p.brand.name, 'Br'); assert.equal(p.image, 'u');
  assert.equal(toHomepageProduct({ ...row, variants: [] }, stock), null);
  const noStock = toHomepageProduct(row, new Map());
  assert.equal(noStock.inStock, false, 'no inventory row => 0 stock (parity with enrichProductsWithInventory)');
});
