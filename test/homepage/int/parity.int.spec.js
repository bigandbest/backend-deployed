import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prisma, reset, mk } from './db.js';
import { homepageFeedService } from '../../../services/homepage/index.js';

// ADMIN config → DB → CANONICAL FEED → WEB adapter / MOBILE mappers.
// The real feed JSON is fed through the real web adapter (frontend-deployed) and the real mobile mapper (bbm-app);
// both must yield the SAME semantic dataset (ids + order) for product, category and group mapping.
const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };
const root = new URL('../../../../', import.meta.url);
const load = (rel) => import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL(rel, root), 'utf8')).toString('base64'));
const web = await load('frontend-deployed/src/api/homepage.adapter.js');
const mobile = await import(new URL('bbm-app/services/feedMappers.ts', root).href);
const ctx = { platform: 'web', warehouseId: null, pincode: null };

const feed = async () => homepageFeedService.getFeed(ctx);
const sectionOf = (f, key) => f.sections.find((s) => s.key === key);
const webProductIds = (s, e) => {
  const p = web.sectionProps(s, e);
  return (p.feed?.data?.products ?? p.feedData ?? p.initialProducts).map((x) => x.id);
};
const mobileProductIds = (s, e) => mobile.feedPropsFor(s, e).feedProducts.map((x) => x.id);

let cat, sub;
test.beforeEach(async () => { if (!INT_ENABLED) return; await reset(); cat = await mk.category('Grocery'); sub = await mk.subcategory('Staples', cat); });
test.after(async () => { if (INT_ENABLED) await prisma.$disconnect(); });

test('PRODUCT mapping: pinned product A appears identically on web and mobile; removing it removes it on both', opts, async () => {
  const sid = await mk.section({ key: 'c1', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED', limit: 20 } });
  const a = await mk.product('A', { categoryId: cat, subcategoryId: sub });
  await mk.product('newest-unmapped', { categoryId: cat, subcategoryId: sub });
  await mk.pin(sid, a, 1);
  let f = await feed(); let s = sectionOf(f, 'c1');
  assert.deepEqual(s.data.productIds, [a]);
  assert.deepEqual(webProductIds(s, f.entities), [a]);
  assert.deepEqual(mobileProductIds(s, f.entities), [a]);
  await prisma.$executeRawUnsafe('DELETE FROM product_section_products');
  f = await feed(); s = sectionOf(f, 'c1');
  assert.equal(s.status, 'EMPTY');
  assert.equal(web.sectionProps(s, f.entities), null);
  assert.deepEqual(mobile.feedPropsFor(s, f.entities), {});
});

test('CATEGORY mapping (products): same ids, same order, on both clients', opts, async () => {
  const sid = await mk.section({ key: 'c1', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED', limit: 20 } });
  const other = await mk.category('Other');
  const p1 = await mk.product('p1', { categoryId: cat, subcategoryId: sub, ageDays: 1 });
  const p2 = await mk.product('p2', { categoryId: cat, subcategoryId: sub, ageDays: 2 });
  await mk.product('x', { categoryId: other });
  await mk.mapCategory(sid, cat);
  const f = await feed(); const s = sectionOf(f, 'c1');
  assert.deepEqual(s.data.productIds, [p1, p2]);
  assert.deepEqual(webProductIds(s, f.entities), s.data.productIds);
  assert.deepEqual(mobileProductIds(s, f.entities), s.data.productIds);
});

test('GROUP mapping (group → subcategory products): same ids, same order, on both clients', opts, async () => {
  const sid = await mk.section({ key: 'c1', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED', limit: 20 } });
  const g = await mk.group('G', sub);
  const p1 = await mk.product('p1', { categoryId: cat, subcategoryId: sub, ageDays: 1 });
  const p2 = await mk.product('p2', { categoryId: cat, subcategoryId: sub, ageDays: 2 });
  await mk.mapGroup(sid, g);
  const f = await feed(); const s = sectionOf(f, 'c1');
  assert.deepEqual(s.data.productIds, [p1, p2]);
  assert.deepEqual(webProductIds(s, f.entities), s.data.productIds);
  assert.deepEqual(mobileProductIds(s, f.entities), s.data.productIds);
});

test('CATEGORY_GRID: only mapped subcategories, identical on web and mobile; unmapped category absent; nothing mapped ⇒ EMPTY', opts, async () => {
  const sid = await mk.section({ key: 'grid', type: 'CATEGORY_GRID', config: { limit: 24 } });
  const sub2 = await mk.subcategory('Snacks', cat);
  await mk.subcategory('Unmapped', cat);
  const other = await mk.category('Toys'); await mk.subcategory('Lego', other);
  let f = await feed();
  assert.equal(sectionOf(f, 'grid').status, 'EMPTY');
  await mk.mapSubcategory(sid, sub, { order: 1 });
  await mk.mapSubcategory(sid, sub2, { order: 2 });
  f = await feed(); const s = sectionOf(f, 'grid');
  assert.equal(s.status, 'OK');
  const w = web.sectionProps(s, f.entities).initialCategories.map((c) => [c.id, c.subcategories.map((x) => x.id)]);
  const m = mobile.feedPropsFor(s, f.entities).feedCategories.map((c) => [c.id, c.subcategories.map((x) => x.id)]);
  assert.deepEqual(w, m);
  // Sub-order inside a category is the hierarchy's (sort_order, name) — identical on both clients; the SET is the mapping.
  assert.deepEqual(m.map(([c, subs]) => [c, [...subs].sort()]), [[cat, [sub, sub2].sort()]]);
});
