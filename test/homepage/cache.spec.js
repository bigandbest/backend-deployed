import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedLoadPlan, cachedSelectProducts, cachedHydrateProducts, cachedResolver, cacheEnabled } from '../../services/homepage/cache/cachedDeps.js';
import { createHomepageInvalidator } from '../../services/homepage/cache/HomepageInvalidator.js';
import { homepagePlanKey, homepageSelectionKey, homepageProductKey, homepageSectionViewKey, homepageCategoriesKey } from '../../lib/cacheKeys.js';

const origLog = console.log;
test.before(() => { console.log = () => {}; });
test.after(() => { console.log = origLog; });

// In-memory CacheStore (JSON round-trip like Redis; TTLs recorded, not enforced)
function fakeStore() {
  const m = new Map(); const ttls = new Map(); const stats = { get: 0, mget: 0, set: 0, setMany: 0 };
  return {
    m, ttls, stats,
    get: async (k) => { stats.get++; return m.has(k) ? JSON.parse(m.get(k)) : null; },
    set: async (k, v, ttl) => { stats.set++; m.set(k, JSON.stringify(v)); ttls.set(k, ttl); },
    mget: async (ks) => { stats.mget++; return ks.map((k) => (m.has(k) ? JSON.parse(m.get(k)) : null)); },
    setMany: async (entries, ttl) => { stats.setMany++; for (const [k, v] of entries) { m.set(k, JSON.stringify(v)); ttls.set(k, ttl); } },
  };
}

test('plan: miss loads once, then hits; concurrent misses share ONE load (single-flight)', async () => {
  const store = fakeStore(); let loads = 0;
  const load = cachedLoadPlan(async () => { loads++; await new Promise((r) => setTimeout(r, 10)); return { sections: [1], mappings: {} }; }, { store });
  const [a, b, c] = await Promise.all([load(), load(), load()]);
  assert.equal(loads, 1); assert.deepEqual(a, b); assert.deepEqual(b, c);
  await load();
  assert.equal(loads, 1, 'served from cache');
  assert.equal(store.ttls.get(homepagePlanKey()), 300);
});

test('selection: hits skip the DB; only misses are computed; source/limit change is a miss', async () => {
  const store = fakeStore(); const seen = [];
  const sel = cachedSelectProducts(async (specs) => { seen.push(specs.map((s) => s.id)); return new Map(specs.map((s) => [s.id, [`p${s.id}`]])); }, { store });
  await sel([{ id: 1, source: 'MAPPED', limit: 20 }, { id: 2, source: 'MAPPED', limit: 20 }]);
  assert.deepEqual(seen[0], [1, 2]);
  const r = await sel([{ id: 1, source: 'MAPPED', limit: 20 }, { id: 3, source: 'MAPPED', limit: 20 }]);
  assert.deepEqual(seen[1], [3], 'only the miss is recomputed');
  assert.deepEqual([...r.entries()], [[1, ['p1']], [3, ['p3']]]);
  await sel([{ id: 1, source: 'MAPPED', limit: 12 }]);
  assert.deepEqual(seen[2], [1], 'changed limit => stale selection is NOT served');
  await sel([{ id: 1, source: 'SUPER_SAVER', limit: 12 }]);
  assert.deepEqual(seen[3], [1], 'changed source => miss');
});

test('products: per-warehouse keys, 60s TTL, only misses hydrated, shared across sections', async () => {
  const store = fakeStore(); const hydrated = [];
  const h = cachedHydrateProducts(async (ids) => { hydrated.push([...ids]); return new Map(ids.map((i) => [i, { id: i, price: 1 }])); }, { store });
  await h(['a', 'b'], { warehouseId: null });
  await h(['b', 'c'], { warehouseId: null });
  assert.deepEqual(hydrated, [['a', 'b'], ['c']]);
  await h(['a'], { warehouseId: 3 });
  assert.deepEqual(hydrated[2], ['a'], 'warehouse 3 is a different cache namespace');
  assert.equal(store.ttls.get(homepageProductKey(null, 'a')), 60);
  assert.ok(store.m.has('hp:prod:v1:wh0:a') && store.m.has('hp:prod:v1:wh3:a'));
});

test('view cache: keyed by section, invalidated when the section row changes (updated_at stamp)', async () => {
  const store = fakeStore(); let calls = 0;
  const inner = async ({ sections }) => { calls++; return new Map(sections.map((s) => [s.id, { data: { n: calls } }])); };
  const r = cachedResolver('BRAND_GRID', inner, { store });
  const sec = { id: 10, updated_at: '2026-09-21T10:00:00.000Z', config: {} };
  assert.equal((await r({ sections: [sec] })).get(10).data.n, 1);
  assert.equal((await r({ sections: [sec] })).get(10).data.n, 1, 'hit');
  assert.equal(calls, 1);
  const edited = { ...sec, updated_at: '2026-09-21T11:00:00.000Z' };
  assert.equal((await r({ sections: [edited] })).get(10).data.n, 2, 'admin edit => recomputed');
  // mixed hit + miss only resolves the miss
  const other = { id: 11, updated_at: null, config: {} };
  await r({ sections: [edited, other] });
  assert.equal(calls, 3);
  assert.ok(store.m.has(homepageSectionViewKey(10)));
});

test('view cache is NOT applied to entity-sharing types (categories register into the request store)', async () => {
  const store = fakeStore(); let calls = 0;
  const inner = async ({ sections }) => { calls++; return new Map(sections.map((s) => [s.id, { data: {} }])); };
  const r = cachedResolver('CATEGORY_GRID', inner, { store });
  await r({ sections: [{ id: 1 }] }); await r({ sections: [{ id: 1 }] });
  assert.equal(calls, 2);
  assert.equal(store.stats.mget, 0);
});

test('HOMEPAGE_CACHE=off bypasses every layer', async () => {
  assert.equal(cacheEnabled({ HOMEPAGE_CACHE: 'off' }), false);
  assert.equal(cacheEnabled({}), true);
  const store = fakeStore(); let loads = 0;
  const load = cachedLoadPlan(async () => { loads++; return { sections: [] }; }, { store, enabled: () => false });
  await load(); await load();
  assert.equal(loads, 2); assert.equal(store.stats.get + store.stats.set, 0);
});

test('a dead cache (all misses, writes dropped) degrades to the DB path without errors', async () => {
  const dead = { get: async () => null, set: async () => {}, mget: async (ks) => ks.map(() => null), setMany: async () => {} };
  const sel = cachedSelectProducts(async (specs) => new Map(specs.map((s) => [s.id, ['x']])), { store: dead });
  assert.deepEqual([...(await sel([{ id: 1, source: 'MAPPED', limit: 5 }])).values()], [['x']]);
});

// ── invalidation matrix ────────────────────────────────────────────────────
function fakePrisma() {
  const sections = [
    { id: 1, section_type: 'PRODUCT_CAROUSEL' }, { id: 2, section_type: 'PRODUCT_CAROUSEL' },
    { id: 3, section_type: 'HERO_CAROUSEL' }, { id: 4, section_type: 'BANNER_STRIP' }, { id: 5, section_type: 'DEAL_CARDS' }, { id: 6, section_type: 'STORE_GRID' },
  ];
  return {
    product_sections: { findMany: async ({ where }) => sections.filter((s) => !where || (where.section_type ? (where.section_type.in ? where.section_type.in.includes(s.section_type) : s.section_type === where.section_type) : true)).map((s) => ({ id: s.id })) },
    warehouses: { findMany: async () => [{ id: 1 }, { id: 2 }] },
  };
}
const inv = () => { const deleted = []; const i = createHomepageInvalidator({ prisma: fakePrisma(), del: async (...k) => { deleted.push(...k); }, log: () => {} }); return { i, deleted }; };

test('SECTION_CHANGED with an id: plan + that section only', async () => {
  const { i, deleted } = inv();
  await i.emit('SECTION_CHANGED', { sectionId: '2' });
  assert.deepEqual(deleted.sort(), [homepagePlanKey(), homepageSelectionKey(2), homepageSectionViewKey(2)].sort());
});

test('SECTION_CHANGED without a numeric id (reorder / key-addressed): plan + every section', async () => {
  const { i, deleted } = inv();
  await i.emit('SECTION_CHANGED', { sectionId: 'order' });
  assert.ok(deleted.includes(homepagePlanKey()));
  for (const id of [1, 2, 3, 4, 5, 6]) assert.ok(deleted.includes(homepageSelectionKey(id)) && deleted.includes(homepageSectionViewKey(id)));
});

test('banner / deal / store events delete ONLY the affected section types', async () => {
  let r = inv(); await r.i.emit('BANNER_UPDATED');
  assert.deepEqual(r.deleted.sort(), [homepageSectionViewKey(3), homepageSectionViewKey(4)].sort());
  r = inv(); await r.i.emit('DAILY_DEAL_UPDATED');
  assert.deepEqual(r.deleted, [homepageSectionViewKey(5)]);
  r = inv(); await r.i.emit('STORE_UPDATED');
  assert.deepEqual(r.deleted, [homepageSectionViewKey(6)]);
  assert.ok(!r.deleted.includes(homepagePlanKey()), 'small-table events never drop the plan');
});

test('product event: that product in wh0 + every warehouse, plus product-section selections (membership)', async () => {
  const { i, deleted } = inv();
  await i.emit('PRODUCT_UPDATED', { productId: 'pid-1' });
  for (const wh of [0, 1, 2]) assert.ok(deleted.includes(homepageProductKey(wh, 'pid-1')));
  assert.ok(deleted.includes(homepageSelectionKey(1)) && deleted.includes(homepageSelectionKey(2)));
  assert.ok(!deleted.includes(homepagePlanKey()));
  assert.ok(!deleted.includes(homepageSectionViewKey(3)), 'a product edit never drops banner views');
});

test('category / group events drop plan + category hierarchy (hp:cats) + product-section selections', async () => {
  const { i, deleted } = inv();
  await i.emit('CATEGORY_UPDATED');
  assert.deepEqual(deleted.sort(), [homepagePlanKey(), homepageCategoriesKey(), homepageSelectionKey(1), homepageSelectionKey(2)].sort());
  const g = inv();
  await g.i.emit('GROUP_UPDATED');
  assert.ok(g.deleted.includes(homepageCategoriesKey()), 'GROUP_UPDATED also clears hp:cats');
});

test('invalidator never throws (DB or Redis failure)', async () => {
  const bad = createHomepageInvalidator({ prisma: { product_sections: { findMany: async () => { throw new Error('db'); } } }, del: async () => {}, log: () => {} });
  await bad.emit('SECTION_CHANGED', { sectionId: 'x' }); // resolves
  const badDel = createHomepageInvalidator({ prisma: fakePrisma(), del: async () => { throw new Error('redis'); }, log: () => {} });
  await badDel.emit('BANNER_UPDATED');
  assert.ok(true);
});

test('unknown events are a no-op', async () => {
  const { i, deleted } = inv();
  await i.emit('SOMETHING_ELSE');
  assert.deepEqual(deleted, []);
});
