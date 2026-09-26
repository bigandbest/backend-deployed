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

// ── single-flight on the per-key caches (cache-expiry stampede) ─────────────────────────────────────────
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test('hydrate: concurrent misses share ONE hydration; callers get equal but independent copies', async () => {
  const store = fakeStore(); let calls = 0; const seen = [];
  const h = cachedHydrateProducts(async (ids) => { calls++; seen.push([...ids]); await tick(); return new Map(ids.map((id) => [id, { id, name: 'p' + id, tags: ['x'] }])); }, { store });
  const results = await Promise.all(Array.from({ length: 50 }, () => h(['a', 'b', 'c'], {})));
  assert.equal(calls, 1, '50 concurrent feed requests, one hydrate');
  assert.deepEqual(seen, [['a', 'b', 'c']]);
  results.forEach((m) => assert.deepEqual([...m.keys()].sort(), ['a', 'b', 'c']));
  results[1].get('a').tags.push('mutated'); results[1].get('a').name = 'changed';
  assert.deepEqual(results[2].get('a'), { id: 'a', name: 'pa', tags: ['x'] }, 'a caller mutating its copy must not leak into another request');
  await h(['a', 'b', 'c'], {});
  assert.equal(calls, 1, 'afterwards served from the cache');
});

test('hydrate: overlapping id sets only hydrate each product once; different warehouses never share', async () => {
  const store = fakeStore(); const seen = [];
  const h = cachedHydrateProducts(async (ids, o) => { seen.push([o.warehouseId ?? null, [...ids].sort().join()]); await tick(); return new Map(ids.map((id) => [id, { id, wh: o.warehouseId ?? null }])); }, { store });
  const [x, y, z] = await Promise.all([h(['a', 'b', 'c'], {}), h(['b', 'c', 'd'], {}), h(['a'], { warehouseId: 3 })]);
  const flat = seen.filter(([wh]) => wh === null).flatMap(([, ids]) => ids.split(','));
  assert.deepEqual(flat.sort(), ['a', 'b', 'c', 'd'], 'a,b,c,d each hydrated exactly once in warehouse 0');
  assert.deepEqual([...x.keys()].sort(), ['a', 'b', 'c']); assert.deepEqual([...y.keys()].sort(), ['b', 'c', 'd']);
  assert.equal(z.get('a').wh, 3, 'warehouse 3 is a separate flight/namespace');
  assert.equal(seen.filter(([wh]) => wh === 3).length, 1);
});

test('hydrate: a product the hydrator does not return is absent for every waiting caller', async () => {
  const store = fakeStore(); let calls = 0;
  const h = cachedHydrateProducts(async (ids) => { calls++; await tick(); return new Map(ids.filter((i) => i !== 'gone').map((id) => [id, { id }])); }, { store });
  const rs = await Promise.all([h(['a', 'gone'], {}), h(['a', 'gone'], {}), h(['gone'], {})]);
  assert.equal(calls, 1);
  assert.deepEqual([...rs[0].keys()], ['a']); assert.deepEqual([...rs[1].keys()], ['a']); assert.equal(rs[2].size, 0);
});

test('hydrate: owner failure rejects the owner (as before) and waiting callers recompute instead of failing', async () => {
  const store = fakeStore(); let calls = 0;
  const h = cachedHydrateProducts(async (ids) => { calls++; await tick(); if (calls === 1) throw new Error('db down'); return new Map(ids.map((id) => [id, { id }])); }, { store });
  const [owner, waiter] = await Promise.allSettled([h(['a'], {}), h(['a'], {})]);
  assert.equal(owner.status, 'rejected'); assert.match(owner.reason.message, /db down/);
  assert.equal(waiter.status, 'fulfilled'); assert.deepEqual([...waiter.value.keys()], ['a']);
  assert.equal(calls, 2, 'failure was not cached and not sticky');
});

test('select: concurrent misses share one selection; a different limit is a different flight', async () => {
  const store = fakeStore(); const seen = [];
  const sel = cachedSelectProducts(async (specs) => { seen.push(specs.map((s) => `${s.id}:${s.limit}`)); await tick(); return new Map(specs.map((s) => [s.id, ['p' + s.limit]])); }, { store });
  const spec = { id: 5, source: 'MAPPED', limit: 12 };
  const rs = await Promise.all([...Array.from({ length: 30 }, () => sel([spec])), sel([{ ...spec, limit: 20 }])]);
  assert.equal(seen.filter((x) => x.includes('5:12')).length, 1, 'limit 12: one selection for 30 requests');
  assert.equal(seen.filter((x) => x.includes('5:20')).length, 1);
  assert.deepEqual(rs[0].get(5), ['p12']); assert.deepEqual(rs[30].get(5), ['p20']);
  rs[0].get(5).push('leak'); assert.deepEqual(rs[1].get(5), ['p12'], 'copies are independent');
});

test('view cache: concurrent misses of one section share ONE resolver call (expiry / invalidation stampede)', async () => {
  const store = fakeStore(); let calls = 0;
  const inner = async ({ sections }) => { calls++; await tick(); return new Map(sections.map((s) => [s.id, { data: { partners: [{ id: 'p' }] } }])); };
  const r = cachedResolver('BRAND_PARTNERS', inner, { store });
  const sec = { id: 7, updated_at: '2026-09-25T10:00:00.000Z', config: {} };
  const rs = await Promise.all(Array.from({ length: 40 }, () => r({ sections: [sec] })));
  assert.equal(calls, 1);
  rs[0].get(7).data.partners.push('leak'); assert.equal(rs[1].get(7).data.partners.length, 1);
  await r({ sections: [sec] }); assert.equal(calls, 1, 'cached afterwards');
  await Promise.all([r({ sections: [{ ...sec, updated_at: '2026-09-25T12:00:00.000Z' }] }), r({ sections: [{ ...sec, updated_at: '2026-09-25T12:00:00.000Z' }] })]);
  assert.equal(calls, 2, 'a changed section stamp is its own flight');
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
    { id: 7, section_type: 'BRAND_PARTNERS' },
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

test('partner events delete ONLY the BRAND_PARTNERS section views (never the plan or other types)', async () => {
  const r = inv(); await r.i.emit('PARTNER_UPDATED');
  assert.deepEqual(r.deleted, [homepageSectionViewKey(7)]);
  assert.ok(!r.deleted.includes(homepagePlanKey()));
  const b = inv(); await b.i.emit('BRAND_UPDATED');
  assert.ok(!b.deleted.includes(homepageSectionViewKey(7)), 'a brand edit does not touch partner views');
});

test('BRAND_PARTNERS view is cached (one resolver call for repeated feeds) and follows the section updated_at stamp', async () => {
  const store = fakeStore(); let calls = 0;
  const inner = async ({ sections }) => { calls++; return new Map(sections.map((s) => [s.id, { data: { partners: [{ id: 'p', n: calls }] } }])); };
  const r = cachedResolver('BRAND_PARTNERS', inner, { store });
  const sec = { id: 7, updated_at: '2026-09-25T10:00:00.000Z', config: { limit: 12 } };
  for (let i = 0; i < 5; i++) await r({ sections: [sec] });
  assert.equal(calls, 1, 'five feed requests, one partners query');
  assert.equal(store.ttls.get(homepageSectionViewKey(7)), 300, 'default view TTL is the fallback if an invalidation is ever missed');
  await store.m.delete(homepageSectionViewKey(7)); // what PARTNER_UPDATED does
  await r({ sections: [sec] });
  assert.equal(calls, 2, 'after invalidation the next feed rebuilds it');
  await r({ sections: [{ ...sec, updated_at: '2026-09-25T11:00:00.000Z' }] });
  assert.equal(calls, 3, 'section edit (e.g. limit change) => recomputed');
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
