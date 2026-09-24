import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, reset, mk, dbq } from './db.js';
import { homepageFeedService } from '../../../services/homepage/index.js';

const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };
const ctx = { platform: 'web', warehouseId: null, pincode: null };
const view = async (key) => (await homepageFeedService.getSections(ctx, [key])).sections[0];

test.beforeEach(async () => { if (INT_ENABLED) { await reset(); await dbq('TRUNCATE partners'); } });
test.after(async () => { if (INT_ENABLED) await prisma.$disconnect(); });

test('BRAND_PARTNERS shows only active partners in admin order; none => EMPTY (no hardcoded logos)', opts, async () => {
  await mk.section({ key: 'bp', type: 'BRAND_PARTNERS', config: { limit: 20 } });
  assert.equal((await view('bp')).status, 'EMPTY');
  await dbq(`INSERT INTO partners (name, image_url, active, sort_order) VALUES ('B','b.png',true,2),('A','a.png',true,1),('Off','o.png',false,0)`);
  const v = await view('bp');
  assert.equal(v.status, 'OK');
  assert.deepEqual(v.data.partners.map((p) => p.name), ['A', 'B']);
});

test('weekly deal (two-rows PRODUCT_CAROUSEL): mapped products only, layout is carried in config, nothing mapped => EMPTY', opts, async () => {
  const cat = await mk.category('C'); const sub = await mk.subcategory('S', cat);
  const sid = await mk.section({ key: 'weekly_deal', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED', limit: 20, layout: 'two-rows' } });
  await mk.product('unmapped', { categoryId: cat, subcategoryId: sub });
  assert.equal((await view('weekly_deal')).status, 'EMPTY');
  const a = await mk.product('A', { categoryId: cat, subcategoryId: sub });
  await mk.pin(sid, a, 1);
  const v = await view('weekly_deal');
  assert.deepEqual(v.data.productIds, [a]);
  assert.equal(v.config.layout, 'two-rows');
});
