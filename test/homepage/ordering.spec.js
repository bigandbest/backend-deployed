import test from 'node:test';
import assert from 'node:assert/strict';
import { orderRequested, applySlotOrder, toDense } from '../../services/homepage/ordering.js';
import { MappingRequestError } from '../../services/homepage/errors.js';

const idOf = (x) => x.id;
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof MappingRequestError); return `${e.status}:${e.code}`; } assert.fail('expected MappingRequestError'); };

test('applySlotOrder: requested rows re-occupy THEIR slots; others do not move', () => {
  assert.deepEqual(applySlotOrder(['A', 'B', 'C', 'D', 'E'], ['D', 'B']), ['A', 'D', 'C', 'B', 'E']);
  assert.deepEqual(applySlotOrder(['A', 'B', 'C'], ['C', 'B', 'A']), ['C', 'B', 'A']);
  assert.deepEqual(applySlotOrder(['A', 'B', 'C'], ['A', 'B']), ['A', 'B', 'C'], 'same relative order = no-op');
  assert.deepEqual(applySlotOrder(['A', 'B', 'C'], ['B']), ['A', 'B', 'C'], 'single row = no-op');
});

test('hidden rows keep their slot when only the visible rows are sent', () => {
  // canonical: a b [h] c d ; the admin only lists visible rows and reverses them
  const out = applySlotOrder(['a', 'b', 'h', 'c', 'd'], ['d', 'c', 'b', 'a']);
  assert.deepEqual(out, ['d', 'c', 'h', 'b', 'a']);
  assert.equal(out.indexOf('h'), 2);
});

test('applySlotOrder is a permutation and idempotent', () => {
  const cur = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 50; i++) {
    const req = cur.filter(() => Math.random() > 0.4).sort(() => Math.random() - 0.5);
    const once = applySlotOrder(cur, req);
    assert.deepEqual([...once].sort(), cur);
    assert.deepEqual(applySlotOrder(once, req), once, 'applying the same request twice changes nothing');
  }
});

test('applySlotOrder rejects ids that are not in the list', () => {
  assert.equal(code(() => applySlotOrder(['A', 'B'], ['A', 'Z'])), '400:UNKNOWN_ID');
});

test('toDense numbers 1..N with no gaps or ties', () => {
  assert.deepEqual(toDense(['x', 'y', 'z']), [{ id: 'x', display_order: 1 }, { id: 'y', display_order: 2 }, { id: 'z', display_order: 3 }]);
});

test('orderRequested: array order, or explicit positions (stable) when EVERY item has one', () => {
  assert.deepEqual(orderRequested([{ id: 3 }, { id: 1 }, { id: 2 }], { idOf }), [3, 1, 2]);
  assert.deepEqual(orderRequested([{ id: 'a', p: 30 }, { id: 'b', p: 10 }, { id: 'c', p: 20 }], { idOf, positionOf: (x) => x.p }), ['b', 'c', 'a']);
  assert.deepEqual(orderRequested([{ id: 'a', p: 5 }, { id: 'b', p: 5 }], { idOf, positionOf: (x) => x.p }), ['a', 'b'], 'equal positions keep request order');
  assert.deepEqual(orderRequested([{ id: 'a', p: 2 }, { id: 'b' }], { idOf, positionOf: (x) => x.p }), ['a', 'b'], 'partial positions are ignored, array order wins');
});

test('orderRequested rejects empty, duplicate and invalid ids', () => {
  assert.equal(code(() => orderRequested([], { idOf })), '400:INVALID_ORDER_REQUEST');
  assert.equal(code(() => orderRequested(undefined, { idOf })), '400:INVALID_ORDER_REQUEST');
  assert.equal(code(() => orderRequested([{ id: 1 }, { id: 1 }], { idOf })), '400:DUPLICATE_ID');
  assert.equal(code(() => orderRequested([{ id: undefined }], { idOf })), '400:INVALID_ID');
  assert.equal(code(() => orderRequested([{ id: 1.5 }], { idOf })), '400:INVALID_ID');
});
