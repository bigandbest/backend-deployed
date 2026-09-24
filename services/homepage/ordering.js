// Pure ordering rules shared by section reorder and pin reorder (no IO → unit-testable).
//
// MODEL: one canonical order per list — `display_order ASC (NULLS LAST), id ASC` — stored DENSE (1..N, no gaps, no ties).
//
// SLOT-PRESERVING REORDER: the client sends the ids it wants to reorder, in the order it wants them (it may send only a
// subset — e.g. the admin list only moves visible rows). The rows it did NOT mention keep their slots; the mentioned
// rows are re-placed into the slots THEY occupied, in the requested order. Then every row is renumbered 1..N.
//   current  [A B C D E]   request [D B]        → slots of {B,D} = 1,3 → [A D C B E]
//   A hidden row that was not sent keeps its exact slot, so hiding/unhiding never moves it.
import { MappingRequestError } from './errors.js';

/**
 * Orders the requested items. If EVERY item carries a finite numeric position the items are sorted by
 * (position, original index); otherwise the array order is authoritative. Duplicates are rejected.
 * @template T
 * @param {Array<T>} items
 * @param {{ idOf:(x:T)=>string|number|undefined, positionOf?:(x:T)=>any, label?:string }} opts
 * @returns {Array<string|number>} ids in requested order
 */
export function orderRequested(items, { idOf, positionOf = () => undefined, label = 'items' }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new MappingRequestError(400, 'INVALID_ORDER_REQUEST', `${label} must be a non-empty array`);
  }
  const ids = items.map((x) => idOf(x));
  const bad = ids.filter((id) => id === undefined || id === null || id === '' || (typeof id === 'number' && !Number.isSafeInteger(id)));
  if (bad.length) throw new MappingRequestError(400, 'INVALID_ID', `${label} contain invalid ids`, { invalid: bad.length });
  const seen = new Set();
  const dup = new Set();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  if (dup.size) throw new MappingRequestError(400, 'DUPLICATE_ID', `${label} contain duplicate ids`, { duplicates: [...dup] });

  const positions = items.map((x) => positionOf(x));
  const usePositions = positions.every((p) => p !== undefined && p !== null && p !== '' && Number.isFinite(Number(p)));
  if (!usePositions) return ids;
  return items
    .map((x, i) => ({ id: ids[i], pos: Number(positions[i]), i }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i)
    .map((x) => x.id);
}

/**
 * @param {Array<string|number>} current ids in canonical current order
 * @param {Array<string|number>} requested ids (already ordered + de-duplicated) to re-place
 * @returns {Array<string|number>} the full new order (position = index + 1)
 * @throws {MappingRequestError} 400 UNKNOWN_ID listing ids that are not in `current`
 */
export function applySlotOrder(current, requested, { label = 'ids' } = {}) {
  const currentSet = new Set(current);
  const unknown = requested.filter((id) => !currentSet.has(id));
  if (unknown.length) throw new MappingRequestError(400, 'UNKNOWN_ID', `unknown ${label}`, { unknown });
  const requestedSet = new Set(requested);
  const next = [...current];
  let k = 0;
  for (let i = 0; i < current.length; i++) if (requestedSet.has(current[i])) next[i] = requested[k++];
  return next;
}

/** Dense positions for an ordered id list: [{ id, display_order }] with display_order = 1..N. */
export const toDense = (ordered) => ordered.map((id, i) => ({ id, display_order: i + 1 }));
