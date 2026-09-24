import { INT_ENABLED } from './env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma, reset, mk, orderOf, dbq } from './db.js';
import { createSectionOrderService } from '../../../services/homepage/SectionOrderService.js';
import { MappingRequestError } from '../../../services/homepage/errors.js';

const opts = { skip: !INT_ENABLED && 'set TEST_DATABASE_URL (localhost only) to run integration tests' };
const svc = createSectionOrderService({ prisma });
const keys = async () => (await dbq(`SELECT section_key k FROM product_sections ORDER BY display_order ASC NULLS LAST, id`)).map((r) => r.k);
const dense = async () => (await orderOf()).map((r) => r.display_order);
const ids = {};

test.beforeEach(async () => {
  if (!INT_ENABLED) return;
  await reset();
  // deliberately messy legacy state: 10,20,30 scale, a tie, a NULL — like the pre-migration database
  for (const [k, o, active] of [['a', 10, true], ['b', 20, true], ['c', 20, true], ['d', 40, false], ['e', null, true], ['f', 60, true]]) {
    ids[k] = await mk.section({ key: k, type: 'HERO_CAROUSEL', order: o, active });
  }
});
test.after(async () => { if (INT_ENABLED) await prisma.$disconnect(); });

test('normalize(): dense 1..N, order unchanged (ties by id, NULL last), idempotent', opts, async () => {
  const before = await keys();
  await svc.normalize();
  assert.deepEqual(await keys(), before);
  assert.deepEqual(await dense(), [1, 2, 3, 4, 5, 6]);
  await svc.normalize();
  assert.deepEqual(await dense(), [1, 2, 3, 4, 5, 6]);
});

test('reorder active rows: requested order wins, result dense, hidden row keeps its slot', opts, async () => {
  await svc.normalize(); // a b c d(hidden) f e ... -> canonical
  const start = await keys();
  const active = start.filter((k) => k !== 'd');
  const reversed = [...active].reverse().map((k) => ({ id: ids[k] })); // client only sends the visible rows
  const out = await svc.reorderSections(reversed);
  const after = await keys();
  assert.equal(after.indexOf('d'), start.indexOf('d'), 'hidden row did not move');
  assert.deepEqual(after.filter((k) => k !== 'd'), [...active].reverse());
  assert.deepEqual(out.map((x) => x.display_order), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(await dense(), [1, 2, 3, 4, 5, 6]);
});

test('reorder including a hidden row moves it like any other', opts, async () => {
  await svc.normalize();
  await svc.reorderSections([{ id: ids.d }, { id: ids.a }]); // d takes a's slot, a takes d's slot
  const k = await keys();
  assert.ok(k.indexOf('d') < k.indexOf('a'));
});

test('hidden -> active: re-activating a section does not move it; a later reorder places it correctly', opts, async () => {
  await svc.normalize();
  const before = await keys();
  await dbq(`UPDATE product_sections SET is_active = true WHERE id = $1`, ids.d);
  assert.deepEqual(await keys(), before, 'toggle never touches order');
  await svc.reorderSections([{ id: ids.f }, { id: ids.d }]); // f now goes where d was
  const k = await keys();
  assert.equal(k.indexOf('f'), before.indexOf('d'));
  assert.equal(k.indexOf('d'), before.indexOf('f'));
});

test('explicit display_order values in the request decide the requested order', opts, async () => {
  await svc.normalize();
  await svc.reorderSections([{ id: ids.a, display_order: 3 }, { id: ids.b, display_order: 1 }, { id: ids.c, display_order: 2 }]);
  const k = await keys();
  assert.deepEqual(k.filter((x) => ['a', 'b', 'c'].includes(x)), ['b', 'c', 'a']);
});

test('unknown id / duplicate id / empty / non-numeric are rejected with 400 and NOTHING is written', opts, async () => {
  await svc.normalize();
  const snapshot = await dbq(`SELECT id, display_order FROM product_sections ORDER BY id`);
  const bad = (p, code) => assert.rejects(p, (e) => e instanceof MappingRequestError && e.status === 400 && e.code === code);
  await bad(svc.reorderSections([{ id: ids.a }, { id: 999999 }]), 'UNKNOWN_ID');
  await bad(svc.reorderSections([{ id: ids.a }, { id: ids.a }]), 'DUPLICATE_ID');
  await bad(svc.reorderSections([]), 'INVALID_ORDER_REQUEST');
  await bad(svc.reorderSections([{ id: 'abc' }]), 'INVALID_ID');
  await bad(svc.reorderSections(undefined), 'INVALID_ORDER_REQUEST');
  assert.deepEqual(await dbq(`SELECT id, display_order FROM product_sections ORDER BY id`), snapshot);
});

test('atomic: a failure inside the transaction rolls every row back (no partial reorder)', opts, async () => {
  await svc.normalize();
  const before = await keys();
  // force the audit insert to fail AFTER the order UPDATE ran inside the same transaction
  await dbq(`ALTER TABLE section_audit_log ADD CONSTRAINT force_fail CHECK (action <> 'SECTION_REORDERED') NOT VALID`);
  try {
    await assert.rejects(svc.reorderSections([...before].reverse().map((k) => ({ id: ids[k] }))));
  } finally {
    await dbq(`ALTER TABLE section_audit_log DROP CONSTRAINT force_fail`);
  }
  assert.deepEqual(await keys(), before, 'order untouched after the failed transaction');
});

test('repeated + concurrent reorders always leave a valid dense permutation (advisory lock serialises them)', opts, async () => {
  await svc.normalize();
  const all = await keys();
  const rnd = (n) => [...all].sort(() => Math.random() - 0.5).slice(0, n).map((k) => ({ id: ids[k] }));
  await Promise.all(Array.from({ length: 8 }, (_, i) => svc.reorderSections(rnd(2 + (i % 4)))));
  assert.deepEqual(await dense(), [1, 2, 3, 4, 5, 6], 'dense, no ties, no gaps');
  assert.deepEqual((await keys()).sort(), [...all].sort(), 'same rows, none lost');
  await svc.reorderSections(all.map((k) => ({ id: ids[k] })));
  await svc.reorderSections(all.map((k) => ({ id: ids[k] })));
  assert.deepEqual(await keys(), all, 'repeating the same request is idempotent');
});

test('reorder writes one audit row', opts, async () => {
  await svc.normalize();
  await svc.reorderSections([{ id: ids.b }, { id: ids.a }]);
  const a = await dbq(`SELECT action FROM section_audit_log`);
  assert.deepEqual(a.map((r) => r.action), ['SECTION_REORDERED']);
});
