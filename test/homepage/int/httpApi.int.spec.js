import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma, reset, mk, dbq } from './db.js';
import productSectionRoutes from '../../../routes/productSectionRoutes.js';
import sectionMappingRoutes from '../../../routes/sectionMappingRoutes.js';
import subStoreRoutes from '../../../routes/subStoreRoute.js';
import uniqueSectionRoutes from '../../../routes/uniqueSectionRoutes.js';
import { invalidateHomepageOnWrite as hpInvalidate } from '../../../middleware/homepageInvalidate.js';
import { homepageInvalidator } from '../../../services/homepage/index.js';

const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };

// Same mounts + middleware order as server.js.
const app = express();
app.use(express.json());
app.use('/api/product-sections', hpInvalidate('SECTION_CHANGED', { idFrom: 'section' }), productSectionRoutes);
app.use('/api/section-mappings', hpInvalidate('SECTION_CHANGED', { idFrom: 'section' }), sectionMappingRoutes);
app.use('/api/store-section-mappings', hpInvalidate('SECTION_CHANGED'), subStoreRoutes);
app.use('/api/unique-sections', uniqueSectionRoutes);
app.use('/api/unique-sections-products', uniqueSectionRoutes);

let server, base;
const sign = (role) => jwt.sign({ id: 'test-user', role, email: 't@t.t' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const ADMIN = sign('ADMIN'); const USER = sign('USER');
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
};

// invalidation spy: records what the middleware emits AND what the DB looked like at emit time (proves "after commit")
let emitted = []; const realEmit = homepageInvalidator.emit;
test.before(async () => {
  if (!INT_ENABLED) return;
  server = http.createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  homepageInvalidator.emit = async (event, payload) => {
    const snapshot = (await dbq(`SELECT id, is_active, display_order FROM product_sections ORDER BY id`));
    const pins = (await dbq(`SELECT count(*)::int n FROM product_section_products`))[0].n;
    emitted.push({ event, payload, snapshot, pins });
  };
});
test.after(async () => { homepageInvalidator.emit = realEmit; if (server) await new Promise((r) => server.close(r)); if (INT_ENABLED) await prisma.$disconnect(); });
let carousel, grid, pairParent, pairLeft, hero, P1, P2, cat;
test.beforeEach(async () => {
  if (!INT_ENABLED) return;
  emitted = [];
  await reset();
  cat = await mk.category('Cat');
  carousel = await mk.section({ key: 'car', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED' }, order: 1 });
  grid = await mk.section({ key: 'grid', type: 'CATEGORY_GRID', order: 2 });
  pairParent = await mk.section({ key: 'pair', type: 'DUAL_CATEGORY_PAIR', config: { theme: 'dual' }, order: 3 });
  pairLeft = await mk.section({ key: 'pair_left', type: 'DUAL_CATEGORY_PAIR', config: { theme: 'dual' }, order: 4, parent: pairParent, slot: 'left' });
  hero = await mk.section({ key: 'hero', type: 'HERO_CAROUSEL', order: 5 });
  P1 = await mk.product('P1'); P2 = await mk.product('P2');
});

// ── security ───────────────────────────────────────────────────────────────
const WRITES = [
  ['PATCH', '/api/product-sections/order', { sections: [] }], ['PATCH', '/api/product-sections/1/toggle'], ['PUT', '/api/product-sections/1', { section_name: 'x' }],
  ['POST', '/api/product-sections/1/products', { product_ids: [] }], ['DELETE', '/api/product-sections/1/products/00000000-0000-4000-8000-000000000000'], ['PUT', '/api/product-sections/1/products/order', { products: [] }],
  ['POST', '/api/product-sections/1/categories', { category_ids: [] }], ['PUT', '/api/product-sections/1/categories', { category_ids: [] }], ['DELETE', '/api/product-sections/1/categories/00000000-0000-4000-8000-000000000000'],
  ['POST', '/api/product-sections/1/groups', { group_ids: [] }], ['DELETE', '/api/product-sections/1/groups/00000000-0000-4000-8000-000000000000'],
  ['POST', '/api/section-mappings/1/subcategories', { subcategory_ids: [] }], ['PUT', '/api/section-mappings/1/subcategories', { mappings: [] }],
  ['DELETE', '/api/section-mappings/1/subcategories/00000000-0000-4000-8000-000000000000'], ['PATCH', '/api/section-mappings/1/subcategories/order', {}], ['PATCH', '/api/section-mappings/1/subcategories/x/toggle', {}],
  ['POST', '/api/store-section-mappings/add', {}], ['PUT', '/api/store-section-mappings/update/1', {}], ['DELETE', '/api/store-section-mappings/delete/1'],
  ['POST', '/api/store-section-mappings/store-sections', {}], ['POST', '/api/store-section-mappings/section-products', {}], ['POST', '/api/store-section-mappings/section-group', {}],
  ['PUT', '/api/store-section-mappings/1/status', {}], ['DELETE', '/api/store-section-mappings/1'],
  ['POST', '/api/unique-sections/', {}], ['PUT', '/api/unique-sections/1', {}], ['DELETE', '/api/unique-sections/1'],
  ['POST', '/api/unique-sections/map', {}], ['DELETE', '/api/unique-sections/remove', {}], ['POST', '/api/unique-sections/bulk-map-by-names', {}],
  ['POST', '/api/unique-sections-products/map', {}], ['DELETE', '/api/unique-sections-products/remove', {}],
];
test(`security: every write method on all 4 routers is 401 without a token (${WRITES.length} routes)`, opts, async () => {
  for (const [m, p, b] of WRITES) {
    const r = await call(m, p, { body: b });
    assert.equal(r.status, 401, `${m} ${p} -> ${r.status}`);
  }
  assert.equal(emitted.length, 0, 'a rejected write never triggers cache invalidation');
});

test('security: a non-admin (role USER) token is 403 on every write route', opts, async () => {
  for (const [m, p, b] of WRITES) {
    const r = await call(m, p, { body: b, token: USER });
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
  }
});

test('security: a garbage / expired / wrongly-signed token is 401', opts, async () => {
  for (const t of ['abc', 'a.b.c', jwt.sign({ id: 'x', role: 'ADMIN' }, 'wrong-secret'), jwt.sign({ id: 'x', role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: -10 })]) {
    assert.equal((await call('PATCH', '/api/product-sections/order', { body: { sections: [] }, token: t })).status, 401);
  }
});

test('security: an ADMIN token passes the guard (reaches validation, not 401/403); reads stay public', opts, async () => {
  for (const [m, p, b] of [['POST', '/api/section-mappings/1/subcategories', {}], ['POST', '/api/store-section-mappings/store-sections', {}], ['POST', '/api/unique-sections/', {}]]) {
    const r = await call(m, p, { body: b, token: ADMIN });
    assert.ok(![401, 403].includes(r.status), `${m} ${p} -> ${r.status}`);
  }
  for (const p of ['/api/product-sections', '/api/product-sections/counts', `/api/product-sections/${carousel}/categories`, `/api/section-mappings/${grid}/subcategories`, '/api/store-section-mappings/list', '/api/unique-sections/list']) {
    const r = await call('GET', p);
    assert.ok(![401, 403].includes(r.status), `GET ${p} -> ${r.status}`);
  }
});

// ── product pin HTTP contract (was a 500) ──────────────────────────────────
test('POST /:id/products: valid pin is 200 (was a 500), duplicate is idempotent, ids are validated', opts, async () => {
  let r = await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: [P1, P2] } });
  assert.equal(r.status, 200); assert.equal(r.body.added, 2);
  r = await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: [P1] } });
  assert.equal(r.status, 200); assert.equal(r.body.added, 0); assert.equal(r.body.already_mapped, 1);
  assert.equal((await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: ['nope'] } })).status, 400);
  assert.equal((await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: ['00000000-0000-4000-8000-000000000000'] } })).status, 404);
  assert.equal((await call('POST', `/api/product-sections/999999/products`, { token: ADMIN, body: { product_ids: [P1] } })).status, 404);
  assert.equal((await dbq(`SELECT count(*)::int n FROM product_section_products`))[0].n, 2);
});

test('PUT /:id/products/order and DELETE: reorder persists dense order; delete of a non-pinned product is 200 removed:0', opts, async () => {
  await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: [P1, P2] } });
  let r = await call('PUT', `/api/product-sections/${carousel}/products/order`, { token: ADMIN, body: { products: [{ product_id: P2 }, { product_id: P1 }] } });
  assert.equal(r.status, 200); assert.deepEqual(r.body.data.map((x) => x.product_id), [P2, P1]);
  r = await call('DELETE', `/api/product-sections/${carousel}/products/${P2}`, { token: ADMIN });
  assert.equal(r.status, 200); assert.equal(r.body.removed, 1);
  r = await call('DELETE', `/api/product-sections/${carousel}/products/${P2}`, { token: ADMIN });
  assert.equal(r.status, 200); assert.equal(r.body.removed, 0);
  assert.equal((await call('PUT', `/api/product-sections/${carousel}/products/order`, { token: ADMIN, body: { products: [{ product_id: P2 }] } })).status, 400);
});

// ── capability guard (one definition drives UI + API) ──────────────────────
test('mapping endpoints refuse kinds the section type does not allow (400 MAPPING_NOT_ALLOWED)', opts, async () => {
  const bad = async (path, body) => { const r = await call('POST', path, { token: ADMIN, body }); assert.equal(r.status, 400, path); assert.equal(r.body.error.code, 'MAPPING_NOT_ALLOWED', path); };
  await bad(`/api/product-sections/${grid}/products`, { product_ids: [P1] });
  await bad(`/api/product-sections/${grid}/categories`, { category_ids: [cat] });
  await bad(`/api/product-sections/${hero}/groups`, { group_ids: [cat] });
  await bad(`/api/product-sections/${pairParent}/categories`, { category_ids: [cat] });
  await dbq(`UPDATE product_sections SET config = '{"source":"NEW_ARRIVALS"}' WHERE id = $1`, carousel);
  await bad(`/api/product-sections/${carousel}/products`, { product_ids: [P1] });
  const ok = await call('POST', `/api/product-sections/${pairLeft}/categories`, { token: ADMIN, body: { category_ids: [cat] } });
  assert.equal(ok.status, 200, 'pair CHILD accepts category mappings');
  assert.equal((await call('POST', `/api/product-sections/${pairLeft}/categories`, { token: ADMIN, body: { category_ids: [cat] } })).status, 200, 'and it is idempotent');
  assert.equal((await call('POST', `/api/product-sections/${pairLeft}/categories`, { token: ADMIN, body: { category_ids: ['00000000-0000-4000-8000-000000000000'] } })).status, 404, 'missing category is 404, not 500');
  assert.equal((await call('POST', `/api/product-sections/${carousel}/groups`, { token: ADMIN, body: { group_ids: ['x'] } })).status, 400);
});

test('GET /api/product-sections annotates every row with the SAME eligibility the feed uses', opts, async () => {
  await dbq(`UPDATE product_sections SET is_active = false WHERE id = $1`, hero);
  await dbq(`UPDATE product_sections SET show_on_home = false WHERE id = $1`, grid);
  const r = await call('GET', '/api/product-sections');
  const by = Object.fromEntries(r.body.data.map((s) => [s.section_key, s.homepage]));
  assert.equal(by.car.eligible, true);
  assert.deepEqual(by.hero.reasons, ['HIDDEN']);
  assert.deepEqual(by.grid.reasons, ['NOT_ON_HOME']);
  assert.deepEqual(by.pair_left.eligible, true);
});

// ── section ordering over HTTP ─────────────────────────────────────────────
test('PATCH /order: validated, atomic, dense; PUT /:id can no longer write display_order', opts, async () => {
  const before = await dbq(`SELECT id, display_order FROM product_sections ORDER BY id`);
  let r = await call('PATCH', '/api/product-sections/order', { token: ADMIN, body: { sections: [{ id: carousel }, { id: 424242 }] } });
  assert.equal(r.status, 400); assert.equal(r.body.error.code, 'UNKNOWN_ID');
  r = await call('PATCH', '/api/product-sections/order', { token: ADMIN, body: { sections: [{ id: carousel }, { id: carousel }] } });
  assert.equal(r.status, 400); assert.equal(r.body.error.code, 'DUPLICATE_ID');
  assert.deepEqual(await dbq(`SELECT id, display_order FROM product_sections ORDER BY id`), before, 'nothing written by rejected requests');
  r = await call('PATCH', '/api/product-sections/order', { token: ADMIN, body: { sections: [{ id: hero }, { id: carousel }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.map((x) => x.display_order), [1, 2, 3, 4, 5]);
  assert.equal(r.body.data[0].id, hero);
  const put = await call('PUT', `/api/product-sections/${carousel}`, { token: ADMIN, body: { section_name: 'renamed', display_order: 999 } });
  assert.equal(put.status, 200);
  assert.notEqual((await dbq(`SELECT display_order FROM product_sections WHERE id = $1`, carousel))[0].display_order, 999);
});

// ── cache invalidation: only after a COMMITTED 2xx ─────────────────────────
test('cache: every successful configuration write emits SECTION_CHANGED (edit, visibility, reorder, product/category/group mapping)', opts, async () => {
  const g = await mk.group('G', await mk.subcategory('S', cat));
  const steps = [
    ['PUT', `/api/product-sections/${carousel}`, { section_name: 'n' }],
    ['PATCH', `/api/product-sections/${carousel}/toggle`],
    ['PATCH', '/api/product-sections/order', { sections: [{ id: hero }, { id: carousel }] }],
    ['POST', `/api/product-sections/${carousel}/products`, { product_ids: [P1] }],
    ['DELETE', `/api/product-sections/${carousel}/products/${P1}`],
    ['POST', `/api/product-sections/${carousel}/categories`, { category_ids: [cat] }],
    ['DELETE', `/api/product-sections/${carousel}/categories/${cat}`],
    ['POST', `/api/product-sections/${carousel}/groups`, { group_ids: [g] }],
    ['DELETE', `/api/product-sections/${carousel}/groups/${g}`],
  ];
  for (const [m, p, b] of steps) {
    const before = emitted.length;
    const r = await call(m, p, { token: ADMIN, body: b });
    assert.equal(r.status, 200, `${m} ${p} -> ${r.status} ${JSON.stringify(r.body)}`);
    await new Promise((res) => setTimeout(res, 60)); // emit is fire-and-forget on 'finish'
    assert.equal(emitted.length, before + 1, `${m} ${p} must emit exactly once`);
    assert.equal(emitted.at(-1).event, 'SECTION_CHANGED');
  }
  const numeric = emitted.filter((e) => /^\d+$/.test(String(e.payload.sectionId)));
  assert.equal(numeric.length, emitted.length - 1, 'all but the reorder target one section; reorder (non-numeric) invalidates all');
});

test('cache: emission happens AFTER the DB commit (the DB already shows the change when the invalidator runs)', opts, async () => {
  await call('PATCH', `/api/product-sections/${hero}/toggle`, { token: ADMIN });
  await new Promise((res) => setTimeout(res, 60));
  const e = emitted.at(-1);
  assert.equal(e.snapshot.find((s) => s.id === hero).is_active, false, 'hero was toggled off before the cache was invalidated');
  await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: [P1] } });
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(emitted.at(-1).pins, 1, 'the pin row was committed before invalidation');
});

test('cache: a failed write (4xx) or a read NEVER invalidates', opts, async () => {
  await call('POST', `/api/product-sections/${carousel}/products`, { token: ADMIN, body: { product_ids: ['bad'] } });
  await call('PATCH', '/api/product-sections/order', { token: ADMIN, body: { sections: [{ id: 424242 }] } });
  await call('POST', `/api/product-sections/${grid}/products`, { token: ADMIN, body: { product_ids: [P1] } });
  await call('POST', '/api/product-sections/1/products', { body: { product_ids: [P1] } }); // 401
  await call('GET', '/api/product-sections'); await call('GET', `/api/product-sections/${carousel}/products`);
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(emitted.length, 0);
});
