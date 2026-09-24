import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, reset, mk, dbq } from './db.js';
import { createPinService } from '../../../services/homepage/PinService.js';
import { MappingRequestError } from '../../../services/homepage/errors.js';

const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };
const pins = createPinService({ prisma });
const rows = (sid) => dbq(`SELECT product_id::text p, display_order o FROM product_section_products WHERE section_id=$1 ORDER BY display_order, id`, sid);
const rejects = (p, code, status) => assert.rejects(p, (e) => e instanceof MappingRequestError && e.code === code && (status === undefined || e.status === status));

let sid, A, B, C;
test.before(async () => { if (INT_ENABLED) await reset(); });
test.beforeEach(async () => {
  if (!INT_ENABLED) return;
  await reset();
  sid = await mk.section({ key: 'carousel', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED' } });
  [A, B, C] = [await mk.product('A'), await mk.product('B'), await mk.product('C')];
});
test.after(async () => { if (INT_ENABLED) await prisma.$disconnect(); });

test('unique (section_id, product_id) is enforced by the database', opts, async () => {
  await mk.pin(sid, A, 1);
  await assert.rejects(mk.pin(sid, A, 2)); // duplicate insert is refused by the constraint…
  assert.equal((await rows(sid)).length, 1); // …so still exactly one row
  const idx = await dbq(`SELECT indexdef FROM pg_indexes WHERE indexname = 'product_section_products_section_id_product_id_key'`);
  assert.match(idx[0].indexdef, /UNIQUE INDEX .*\(section_id, product_id\)/);
  const sec = await dbq(`SELECT 1 FROM pg_indexes WHERE tablename = 'product_section_products' AND indexdef LIKE '%(section_id)%'`);
  assert.ok(sec.length >= 1, 'section_id is indexed');
});

test('add: appends in request order after existing pins', opts, async () => {
  await pins.pin(sid, [A]);
  const r = await pins.pin(sid, [C, B]);
  assert.deepEqual(r.added, [C, B]);
  assert.deepEqual((await rows(sid)).map((x) => x.p), [A, C, B]);
  assert.deepEqual((await rows(sid)).map((x) => x.o), [1, 2, 3]);
});

test('add is idempotent: duplicate add (same request, or later) creates nothing and keeps positions', async (t) => {
  await pins.pin(sid, [A, B]);
  const again = await pins.pin(sid, [B, A, A]); // duplicate inside the request too
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.alreadyMapped.sort(), [A, B].sort());
  assert.deepEqual((await rows(sid)).map((x) => [x.p, x.o]), [[A, 1], [B, 2]]);
}, opts);

test('add: concurrent identical requests never create duplicates and never fail', opts, async () => {
  const res = await Promise.all([pins.pin(sid, [A, B]), pins.pin(sid, [A, B]), pins.pin(sid, [B, C])]);
  assert.equal(res.length, 3);
  const r = await rows(sid);
  assert.equal(new Set(r.map((x) => x.p)).size, r.length, 'no duplicate pins');
  assert.deepEqual(new Set(r.map((x) => x.p)), new Set([A, B, C]));
});

test('add: unknown product -> 404 PRODUCT_NOT_FOUND and NOTHING is written', opts, async () => {
  await rejects(pins.pin(sid, [A, '00000000-0000-4000-8000-000000000000']), 'PRODUCT_NOT_FOUND', 404);
  assert.equal((await rows(sid)).length, 0);
});

test('add: malformed ids / empty / unknown section are 4xx, never a 500', opts, async () => {
  await rejects(pins.pin(sid, ['not-a-uuid']), 'INVALID_ID', 400);
  await rejects(pins.pin(sid, []), 'INVALID_REQUEST', 400);
  await rejects(pins.pin(sid, undefined), 'INVALID_REQUEST', 400);
  await rejects(pins.pin(999999, [A]), 'SECTION_NOT_FOUND', 404);
});

test('inactive products CAN be pinned (stored) but selection excludes them (see selection spec)', opts, async () => {
  const off = await mk.product('off', { active: false });
  const r = await pins.pin(sid, [off]);
  assert.deepEqual(r.added, [off]);
});

test('reorder: slot-preserving, dense 1..N, persisted', opts, async () => {
  await pins.pin(sid, [A, B, C]);
  const out = await pins.reorder(sid, [{ product_id: C }, { product_id: A }, { product_id: B }]);
  assert.deepEqual(out.map((x) => [x.product_id, x.display_order]), [[C, 1], [A, 2], [B, 3]]);
  assert.deepEqual((await rows(sid)).map((x) => [x.p, x.o]), [[C, 1], [A, 2], [B, 3]]);
});

test('reorder: with explicit display_order values the positions decide', opts, async () => {
  await pins.pin(sid, [A, B, C]);
  await pins.reorder(sid, [{ product_id: A, display_order: 30 }, { product_id: B, display_order: 10 }, { product_id: C, display_order: 20 }]);
  assert.deepEqual((await rows(sid)).map((x) => x.p), [B, C, A]);
});

test('reorder: a subset keeps the products it did not mention in their slots', opts, async () => {
  await pins.pin(sid, [A, B, C]);
  await pins.reorder(sid, [{ product_id: C }, { product_id: A }]); // slots of A and C are 1 and 3
  assert.deepEqual((await rows(sid)).map((x) => x.p), [C, B, A]);
});

test('reorder: unpinned product -> 400 PRODUCT_NOT_PINNED, duplicates -> 400, nothing changes', opts, async () => {
  await pins.pin(sid, [A, B]);
  await rejects(pins.reorder(sid, [{ product_id: C }]), 'PRODUCT_NOT_PINNED', 400);
  await rejects(pins.reorder(sid, [{ product_id: A }, { product_id: A }]), 'DUPLICATE_ID', 400);
  await rejects(pins.reorder(sid, []), 'INVALID_REQUEST', 400);
  await rejects(pins.reorder(sid, [{ product_id: 'x' }]), 'INVALID_ID', 400);
  assert.deepEqual((await rows(sid)).map((x) => x.p), [A, B]);
});

test('remove: deletes the pin; removing again / a never-pinned product is a deterministic no-op (removed: 0)', opts, async () => {
  await pins.pin(sid, [A, B]);
  assert.deepEqual(await pins.unpin(sid, A), { removed: 1 });
  assert.deepEqual(await pins.unpin(sid, A), { removed: 0 });
  assert.deepEqual(await pins.unpin(sid, C), { removed: 0 });
  assert.deepEqual((await rows(sid)).map((x) => x.p), [B]);
  await rejects(pins.unpin(sid, 'nope'), 'INVALID_ID', 400);
});

test('pins are per section', opts, async () => {
  const other = await mk.section({ key: 'other', type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED' } });
  await pins.pin(sid, [A]); await pins.pin(other, [A, B]);
  await pins.unpin(sid, A);
  assert.deepEqual((await rows(other)).map((x) => x.p), [A, B]);
});
