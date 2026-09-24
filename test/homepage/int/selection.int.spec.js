import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, reset, mk, dbq } from './db.js';
import { homepageFeedService } from '../../../services/homepage/index.js';
import { selectForSection } from '../../../services/homepage/entities/ProductSelectionBatch.js';
import { createPinService } from '../../../services/homepage/PinService.js';
import { getProductsInSection } from '../../../controller/productSectionController.js';

const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };
const ctx = { platform: 'web', warehouseId: null, pincode: null };
const pins = createPinService({ prisma });
const view = async (key) => (await homepageFeedService.getSections(ctx, [key])).sections[0];
const ids = async (key) => (await view(key)).data?.productIds ?? [];
const admin = async (sectionId, query = {}) => {
  const out = await new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    getProductsInSection({ params: { id: String(sectionId) }, query: { limit: '100', ...query } }, res);
  });
  return out;
};
const adminIds = async (sectionId, query) => (await admin(sectionId, query)).body.data.map((p) => p.id);

let cat, sub, sid;
const carousel = (key, source = 'MAPPED', limit = 20, extra = {}) => mk.section({ key, type: 'PRODUCT_CAROUSEL', config: { source, limit }, ...extra });

test.beforeEach(async () => {
  if (!INT_ENABLED) return;
  await reset();
  cat = await mk.category('Grocery'); sub = await mk.subcategory('Staples', cat);
  sid = await carousel('c1');
});
test.after(async () => { if (INT_ENABLED) await prisma.$disconnect(); });

// ── empty / no fallback ────────────────────────────────────────────────────
test('MAPPED section with NO mappings is EMPTY — even though newest/other products exist (no fallback)', opts, async () => {
  await mk.product('newest', { categoryId: cat, subcategoryId: sub });
  const v = await view('c1');
  assert.equal(v.status, 'EMPTY');
  assert.equal(v.data, null);
  assert.deepEqual(await selectForSection(prisma, { id: sid, source: 'MAPPED' }), []);
});

test('admin/See-All list of an EMPTY mapped section is EMPTY (no newest-100 fallback)', opts, async () => {
  for (let i = 0; i < 5; i++) await mk.product('p' + i, { categoryId: cat, subcategoryId: sub });
  const r = await admin(sid);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data, []);
  assert.equal(r.body.pagination.total, 0);
});

test('sections that do not use products return an empty admin list with a reason, not products', opts, async () => {
  const hero = await mk.section({ key: 'hero1', type: 'HERO_CAROUSEL' });
  await mk.product('p', { categoryId: cat, subcategoryId: sub });
  const r = await admin(hero);
  assert.deepEqual(r.body.data, []);
  assert.equal(r.body.meta.reason, 'SECTION_DOES_NOT_USE_PRODUCTS');
});

test('unknown numeric section id is a 404 (not a silent product list)', opts, async () => {
  await mk.product('p', { categoryId: cat, subcategoryId: sub });
  assert.equal((await admin(987654)).status, 404);
});

// ── product mapping ────────────────────────────────────────────────────────
test('pin appears in the feed and in the admin list; removing it makes both EMPTY again', opts, async () => {
  const A = await mk.product('A', { categoryId: cat, subcategoryId: sub });
  await pins.pin(sid, [A]);
  assert.deepEqual(await ids('c1'), [A]);
  assert.deepEqual(await adminIds(sid), [A]);
  await pins.unpin(sid, A);
  assert.equal((await view('c1')).status, 'EMPTY');
  assert.deepEqual(await adminIds(sid), []);
});

test('pinned products keep the admin order (display_order), reorder is reflected', opts, async () => {
  const [A, B, C] = [await mk.product('A'), await mk.product('B'), await mk.product('C')];
  await pins.pin(sid, [A, B, C]);
  assert.deepEqual(await ids('c1'), [A, B, C]);
  await pins.reorder(sid, [{ product_id: C }, { product_id: B }, { product_id: A }]);
  assert.deepEqual(await ids('c1'), [C, B, A]);
  assert.deepEqual(await adminIds(sid), [C, B, A]);
});

test('inactive pinned product is excluded AND does not consume the limit', opts, async () => {
  const lim = await carousel('lim', 'MAPPED', 2);
  const off = await mk.product('off', { active: false });
  const noVariant = await mk.product('nov', { variant: false });
  const badVariant = await mk.product('bad', { variant: 'inactive' });
  const [X, Y, Z] = [await mk.product('X'), await mk.product('Y'), await mk.product('Z')];
  await pins.pin(lim, [off, noVariant, badVariant, X, Y, Z]);
  assert.deepEqual(await ids('lim'), [X, Y], 'limit is filled with ACTIVE products only');
});

test('deleting a pinned product is refused by the database; deleting a category/group cascades its mapping', opts, async () => {
  const A = await mk.product('A'); await pins.pin(sid, [A]);
  await assert.rejects(dbq(`DELETE FROM products WHERE id = $1::uuid`, A));
  const c2 = await mk.category('Temp'); await mk.mapCategory(sid, c2);
  const sub2 = await mk.subcategory('S2', c2); const g = await mk.group('G', sub2); await mk.mapGroup(sid, g);
  await dbq(`DELETE FROM groups WHERE id = $1::uuid`, g);
  await dbq(`DELETE FROM subcategories WHERE id = $1::uuid`, sub2);
  await dbq(`DELETE FROM categories WHERE id = $1::uuid`, c2);
  assert.equal((await dbq(`SELECT count(*)::int n FROM product_section_categories WHERE section_id = $1`, sid))[0].n, 0);
  assert.equal((await dbq(`SELECT count(*)::int n FROM product_section_groups WHERE section_id = $1`, sid))[0].n, 0);
  assert.deepEqual(await ids('c1'), [A], 'missing category/group simply contribute nothing');
});

// ── category mapping ───────────────────────────────────────────────────────
test('category mapping selects the category\'s active products, newest first; feed == admin list', opts, async () => {
  const old = await mk.product('old', { categoryId: cat, subcategoryId: sub, ageDays: 10 });
  const mid = await mk.product('mid', { categoryId: cat, subcategoryId: sub, ageDays: 5 });
  const neu = await mk.product('new', { categoryId: cat, subcategoryId: sub, ageDays: 1 });
  await mk.product('other-cat', { categoryId: await mk.category('Other') });
  await mk.product('inactive', { categoryId: cat, active: false });
  await mk.mapCategory(sid, cat);
  assert.deepEqual(await ids('c1'), [neu, mid, old]);
  assert.deepEqual(await adminIds(sid), [neu, mid, old]);
});

// ── group mapping (documented semantics: group -> its SUBCATEGORY's products) ─
test('GROUP SEMANTICS: a mapped group selects ALL active products of the group\'s subcategory, NOT products.group_id', opts, async () => {
  const g1 = await mk.group('Atta', sub);
  const member = await mk.product('member', { categoryId: cat, subcategoryId: sub, groupId: g1 });
  const nonMember = await mk.product('non-member-same-subcategory', { categoryId: cat, subcategoryId: sub }); // no group_id
  const otherSub = await mk.subcategory('Other', cat);
  const strayMember = await mk.product('group_id-but-other-subcategory', { categoryId: cat, subcategoryId: otherSub, groupId: g1 });
  await mk.mapGroup(sid, g1);
  const got = new Set(await ids('c1'));
  assert.ok(got.has(member));
  assert.ok(got.has(nonMember), 'subcategory-wide: products without this group_id are included');
  assert.ok(!got.has(strayMember), 'products.group_id is NOT what selects');
});

test('GROUP SEMANTICS: groups sharing a subcategory select the SAME set, each product exactly once', opts, async () => {
  const g1 = await mk.group('G1', sub); const g2 = await mk.group('G2', sub); const g3 = await mk.group('G3', sub);
  const P = [await mk.product('P1', { subcategoryId: sub, groupId: g1, ageDays: 3 }), await mk.product('P2', { subcategoryId: sub, groupId: g2, ageDays: 2 }), await mk.product('P3', { subcategoryId: sub, ageDays: 1 })];
  const one = await carousel('one'); const three = await carousel('three');
  await mk.mapGroup(one, g1);
  await mk.mapGroup(three, g1); await mk.mapGroup(three, g2); await mk.mapGroup(three, g3);
  const a = await ids('one'); const b = await ids('three');
  assert.deepEqual(a, b, 'mapping more groups of the same subcategory adds nothing');
  assert.equal(new Set(b).size, b.length, 'no duplicates');
  assert.deepEqual(new Set(b), new Set(P));
});

test('groups of different subcategories combine', opts, async () => {
  const sub2 = await mk.subcategory('S2', cat);
  const g1 = await mk.group('G1', sub); const g2 = await mk.group('G2', sub2);
  const a = await mk.product('a', { subcategoryId: sub }); const b = await mk.product('b', { subcategoryId: sub2 });
  await mk.mapGroup(sid, g1); await mk.mapGroup(sid, g2);
  assert.deepEqual(new Set(await ids('c1')), new Set([a, b]));
});

// ── duplicates + precedence ────────────────────────────────────────────────
test('same product via pin + category + group appears ONCE; precedence pins -> groups -> categories', opts, async () => {
  const g = await mk.group('G', sub);
  const both = await mk.product('both', { categoryId: cat, subcategoryId: sub, ageDays: 9 });
  const viaGroup = await mk.product('viaGroup', { subcategoryId: sub, ageDays: 8 });
  const cat2 = await mk.category('C2');
  const viaCat = await mk.product('viaCat', { categoryId: cat2, ageDays: 7 });
  const pinned = await mk.product('pinned', { categoryId: cat, ageDays: 1 });
  await pins.pin(sid, [pinned, both]);
  await mk.mapGroup(sid, g); await mk.mapCategory(sid, cat2);
  const got = await ids('c1');
  assert.equal(new Set(got).size, got.length);
  assert.deepEqual(got, [pinned, both, viaGroup, viaCat]);
});

test('same category mapped twice is a no-op (unique) and does not duplicate products', opts, async () => {
  await mk.product('p', { categoryId: cat, subcategoryId: sub });
  await mk.mapCategory(sid, cat);
  await assert.rejects(mk.mapCategory(sid, cat));
  assert.equal((await ids('c1')).length, 1);
});

test('the limit truncates AFTER de-duplication and ordering', opts, async () => {
  const lim = await carousel('lim3', 'MAPPED', 3);
  const prods = [];
  for (let i = 0; i < 6; i++) prods.push(await mk.product('p' + i, { categoryId: cat, ageDays: i }));
  await mk.mapCategory(lim, cat);
  assert.deepEqual(await ids('lim3'), prods.slice(0, 3));
  assert.equal((await admin(lim)).body.data.length, 6, 'admin/See-All returns the whole selection');
  assert.equal((await admin(lim)).body.meta.homepageLimit, 3);
});

// ── automatic sources are explicit contracts, not fallbacks ────────────────
test('NEW_ARRIVALS / SUPER_SAVER are global sources that ignore mappings; a MAPPED sibling is still EMPTY', opts, async () => {
  const na = await carousel('na', 'NEW_ARRIVALS', 2);
  const ss = await carousel('ss', 'SUPER_SAVER', 2);
  const oldP = await mk.product('old', { ageDays: 20 }); const newP = await mk.product('new', { ageDays: 1 }); const mid = await mk.product('mid', { ageDays: 5 });
  assert.deepEqual(await ids('na'), [newP, mid]);
  assert.equal((await view('ss')).status, 'OK');
  assert.equal((await view('c1')).status, 'EMPTY', 'mapped section next to global ones gets no automatic products');
  assert.deepEqual(await adminIds(na), [newP, mid, oldP], 'admin list uses the same source');
});

test('admin list == feed selection for every mapping kind (same service, first N)', opts, async () => {
  const g = await mk.group('G', sub);
  const c2 = await mk.category('C2');
  const list = [];
  for (let i = 0; i < 4; i++) list.push(await mk.product('pin' + i, { categoryId: cat, ageDays: i }));
  const vg = await mk.product('vg', { subcategoryId: sub, ageDays: 2 });
  const vc = await mk.product('vc', { categoryId: c2, ageDays: 1 });
  await pins.pin(sid, list.slice(0, 2)); await mk.mapGroup(sid, g); await mk.mapCategory(sid, c2);
  const feed = await ids('c1'); const adm = await adminIds(sid);
  assert.deepEqual(adm.slice(0, feed.length), feed);
  assert.ok(adm.includes(vg) && adm.includes(vc));
});
