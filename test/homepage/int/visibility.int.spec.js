import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, reset, mk, dbq } from './db.js';
import { homepageFeedService } from '../../../services/homepage/index.js';
import { homepageEligibility, assertMappingAllowed, listTypes } from '../../../services/homepage/registry/index.js';
import { SECTION_DEFINITIONS } from '../../../services/homepage/registry/definitions.js';
import { RESOLVERS } from '../../../services/homepage/resolvers/index.js';

const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };
const get = async (platform, keys) => homepageFeedService.getSections({ platform, warehouseId: null, pincode: null }, keys);
const statusOf = async (platform, key) => (await get(platform, [key])).sections[0].status;
test.beforeEach(async () => { if (INT_ENABLED) await reset(); });
test.after(async () => { if (INT_ENABLED) await prisma.$disconnect(); });

// a banner so HERO sections are OK when eligible
const hero = () => dbq(`INSERT INTO add_banner (name, banner_type, image_url, active) VALUES ('h', 'hero', 'x.png', true)`);

// ── eligibility: the admin rule and the feed must agree for every condition ─────────────────────────
const cases = [
  ['is_active=false', { active: false }],
  ['show_on_home=false', { show: false }],
  ['null section_type', { type: null }],
  ['unknown section_type', { type: 'NOT_A_REAL_TYPE' }],
  ['mobile-only type on web', { type: 'MOBILE_BANNERS' }],
  ['section.platforms excludes the platform', { platforms: ['mobile'] }],
  ['fully eligible', {}],
];
for (const [name, o] of cases) {
  test(`visibility: "${name}" — homepageEligibility() and the feed give the SAME answer on web and mobile`, opts, async () => {
    await hero();
    const key = 'sec';
    const row = { key, type: 'HERO_CAROUSEL', active: true, show: true, platforms: ['web', 'mobile'], ...o };
    await mk.section({ key, order: 1, ...row });
    const db = (await dbq(`SELECT is_active, show_on_home, section_type, platforms FROM product_sections WHERE section_key = $1`, key))[0];
    const elig = homepageEligibility(db);
    for (const platform of ['web', 'mobile']) {
      const inFeed = (await statusOf(platform, key)) !== 'GONE';
      assert.equal(inFeed, elig.eligible && elig.platforms.includes(platform), `${name} @ ${platform}: feed=${inFeed} eligibility=${JSON.stringify(elig)}`);
    }
    if (name === 'fully eligible') assert.equal(elig.eligible, true);
    else if (name !== 'section.platforms excludes the platform' && name !== 'mobile-only type on web') assert.equal(elig.eligible, false);
  });
}

test('eligibility reasons are explicit and independent (is_active vs show_on_home vs type vs platform)', opts, async () => {
  const base = { is_active: true, show_on_home: true, section_type: 'HERO_CAROUSEL', platforms: ['web', 'mobile'] };
  assert.deepEqual(homepageEligibility({ ...base, is_active: false }).reasons, ['HIDDEN']);
  assert.deepEqual(homepageEligibility({ ...base, show_on_home: false }).reasons, ['NOT_ON_HOME']);
  assert.deepEqual(homepageEligibility({ ...base, section_type: null }).reasons, ['NO_SECTION_TYPE']);
  assert.deepEqual(homepageEligibility({ ...base, section_type: 'BOGUS' }).reasons, ['UNKNOWN_TYPE']);
  assert.deepEqual(homepageEligibility({ ...base, section_type: 'MOBILE_BANNERS', platforms: ['web'] }).reasons, ['NO_SUPPORTED_PLATFORM']);
  assert.deepEqual(homepageEligibility({ ...base, section_type: 'MOBILE_BANNERS' }).platforms, ['mobile']);
  const many = homepageEligibility({ is_active: false, show_on_home: false, section_type: null, platforms: [] });
  assert.deepEqual(many.reasons, ['HIDDEN', 'NOT_ON_HOME', 'NO_SECTION_TYPE']);
});

test('unknown section type: the feed skips it (GONE), the guard refuses mappings, no crash', opts, async () => {
  await mk.section({ key: 'bogus', type: 'NOT_A_REAL_TYPE', order: 1 });
  const feed = await homepageFeedService.getFeed({ platform: 'web', warehouseId: null, pincode: null });
  assert.equal(feed.sections.find((s) => s.key === 'bogus'), undefined);
  assert.equal(await statusOf('web', 'bogus'), 'GONE');
  assert.equal(assertMappingAllowed({ section_type: 'NOT_A_REAL_TYPE' }, 'PRODUCT').ok, false);
});

test('a pair child is eligible only if its parent is', opts, async () => {
  const parent = await mk.section({ key: 'pair', type: 'DUAL_CATEGORY_PAIR', config: { theme: 'dual' }, active: false });
  const kid = { is_active: true, show_on_home: true, section_type: 'DUAL_CATEGORY_PAIR', platforms: ['web', 'mobile'] };
  const parentRow = (await dbq(`SELECT is_active, show_on_home, section_type, platforms FROM product_sections WHERE id = $1`, parent))[0];
  assert.deepEqual(homepageEligibility(kid, { parent: parentRow }).reasons, ['PARENT_NOT_ELIGIBLE']);
});

// ── the single capability definition ───────────────────────────────────────
test('capability definition is complete for every type and RESOLVERS implements exactly those types', async () => {
  const required = ['type', 'label', 'renderer', 'mappings', 'platforms', 'defaultLoad', 'source', 'selection', 'ordering', 'emptyBehavior', 'errorBehavior', 'availability', 'timeoutMs', 'configSchema', 'usesProducts', 'usesCategories', 'isParent', 'supportsPagination'];
  for (const [type, def] of Object.entries(SECTION_DEFINITIONS)) {
    for (const f of required) assert.ok(def[f] !== undefined, `${type} is missing "${f}"`);
    assert.equal(def.type, type);
    assert.equal(def.emptyBehavior, 'OMIT');
    assert.ok(['ANNOTATE', 'NONE'].includes(def.availability));
    assert.ok(def.platforms.length > 0);
  }
  assert.deepEqual(Object.keys(RESOLVERS).sort(), listTypes().sort(), 'a resolver for every type and no orphan resolvers');
  const renderers = Object.values(SECTION_DEFINITIONS).map((d) => d.renderer);
  assert.equal(new Set(renderers).size, renderers.length, 'renderer keys are unique per type');
});

test('mapping capability matrix comes ONLY from the definition', async () => {
  const cfg = { source: 'MAPPED' };
  const ok = (type, kind, extra = {}) => assertMappingAllowed({ section_type: type, config: cfg, ...extra }, kind).ok;
  assert.equal(ok('PRODUCT_CAROUSEL', 'PRODUCT'), true);
  assert.equal(ok('PRODUCT_CAROUSEL', 'CATEGORY'), true);
  assert.equal(ok('PRODUCT_CAROUSEL', 'GROUP'), true);
  assert.equal(ok('PRODUCT_CAROUSEL', 'SUBCATEGORY'), false);
  assert.equal(assertMappingAllowed({ section_type: 'PRODUCT_CAROUSEL', config: { source: 'SUPER_SAVER' } }, 'PRODUCT').ok, false);
  assert.equal(ok('CATEGORY_GRID', 'SUBCATEGORY'), true);
  assert.equal(ok('CATEGORY_GRID', 'CATEGORY'), false);
  assert.equal(ok('CATEGORY_GRID', 'PRODUCT'), false);
  assert.equal(ok('TABBED_PRODUCTS', 'SUBCATEGORY'), true);
  assert.equal(ok('DUAL_CATEGORY_PAIR', 'CATEGORY'), false, 'pair PARENT has no mappings');
  assert.equal(ok('DUAL_CATEGORY_PAIR', 'CATEGORY', { parent_section_id: 5 }), true, 'pair CHILD does');
  for (const t of ['HERO_CAROUSEL', 'DEAL_CARDS', 'BRAND_GRID', 'STORE_GRID', 'VIDEO_CARDS', 'BANNER_STRIP', 'PROMO_CARDS', 'MOBILE_BANNERS', 'TESTIMONIALS']) {
    for (const k of ['PRODUCT', 'CATEGORY', 'GROUP', 'SUBCATEGORY']) assert.equal(ok(t, k), false, `${t} must not accept ${k}`);
  }
});

// ── CATEGORY_GRID: mapped subcategories only (owner decision 2026-09-23) ────
test('CATEGORY_GRID with NOTHING mapped is EMPTY (no "all categories" fallback)', opts, async () => {
  const c = await mk.category('Grocery'); await mk.subcategory('Atta', c);
  await mk.section({ key: 'grid', type: 'CATEGORY_GRID', order: 1 });
  const v = (await get('web', ['grid'])).sections[0];
  assert.equal(v.status, 'EMPTY');
  assert.equal(v.data, null);
});

test('CATEGORY_GRID shows ONLY mapped subcategories and the categories that own them', opts, async () => {
  const groc = await mk.category('Grocery'); const snack = await mk.category('Snacks'); const toys = await mk.category('Toys');
  const atta = await mk.subcategory('Atta', groc, { sort_order: 2 }); const rice = await mk.subcategory('Rice', groc, { sort_order: 1 });
  const dal = await mk.subcategory('Dal', groc); // NOT mapped
  const chips = await mk.subcategory('Chips', snack);
  await mk.subcategory('Lego', toys); // whole category unmapped
  const grid = await mk.section({ key: 'grid', type: 'CATEGORY_GRID', order: 1 });
  await mk.mapSubcategory(grid, atta); await mk.mapSubcategory(grid, rice); await mk.mapSubcategory(grid, chips);
  const r = await get('web', ['grid']);
  const v = r.sections[0];
  assert.equal(v.status, 'OK');
  assert.deepEqual(v.data.categoryIds.map((id) => r.entities.categories[id].name), ['Grocery', 'Snacks'], 'categories by name, unmapped category absent');
  assert.deepEqual(new Set(v.data.subcategoryIds), new Set([atta, rice, chips]));
  assert.ok(!v.data.subcategoryIds.includes(dal), 'unmapped subcategory of a shown category is not mapped');
});

test('CATEGORY_GRID ignores inactive mappings, inactive subcategories and inactive categories', opts, async () => {
  const live = await mk.category('Live'); const dead = await mk.category('Dead', { active: false });
  const a = await mk.subcategory('a', live); const off = await mk.subcategory('off', live, { active: false });
  const b = await mk.subcategory('b', dead); const muted = await mk.subcategory('muted', live);
  const grid = await mk.section({ key: 'grid', type: 'CATEGORY_GRID', order: 1 });
  await mk.mapSubcategory(grid, a); await mk.mapSubcategory(grid, off); await mk.mapSubcategory(grid, b); await mk.mapSubcategory(grid, muted, { active: false });
  const v = (await get('web', ['grid'])).sections[0];
  assert.deepEqual(v.data.subcategoryIds, [a]);
});

test('CATEGORY_GRID limit applies to categories; feed result identical on web and mobile', opts, async () => {
  const cats = [];
  for (const n of ['A', 'B', 'C']) { const c = await mk.category(n); cats.push(await mk.subcategory(n + 's', c)); }
  const grid = await mk.section({ key: 'grid', type: 'CATEGORY_GRID', order: 1, config: { limit: 2 } });
  for (const s of cats) await mk.mapSubcategory(grid, s);
  const w = (await get('web', ['grid'])).sections[0]; const m = (await get('mobile', ['grid'])).sections[0];
  assert.equal(w.data.categoryIds.length, 2);
  assert.deepEqual(w.data, m.data, 'same configuration => same semantic dataset on both platforms');
});

// ── hero: no cross-type fallback ───────────────────────────────────────────
test('HERO_CAROUSEL with no hero banners is EMPTY even when other banner types exist (fallback removed)', opts, async () => {
  await dbq(`INSERT INTO add_banner (name, banner_type, image_url, active) VALUES ('p', 'promo', 'p.png', true), ('m', 'mega', 'm.png', true)`);
  await mk.section({ key: 'hero', type: 'HERO_CAROUSEL', order: 1 });
  assert.equal(await statusOf('web', 'hero'), 'EMPTY');
  await hero();
  assert.equal(await statusOf('web', 'hero'), 'OK');
});

test('every feed view carries the renderer key from the definition', opts, async () => {
  await hero();
  await mk.section({ key: 'hero', type: 'HERO_CAROUSEL', order: 1 });
  const v = (await get('web', ['hero'])).sections[0];
  assert.equal(v.renderer, SECTION_DEFINITIONS.HERO_CAROUSEL.renderer);
});
