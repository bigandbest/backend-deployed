// Manual product pins for a section (product_section_products). Requires the unique (section_id, product_id)
// constraint from migration 20260923100000. Every path is validated and transactional; a valid request never 500s.
//
//  pin      idempotent: already-pinned products keep their position, new ones are appended (max+1…). Unknown product → 404.
//           Inactive / variant-less products CAN be pinned (the mapping is stored) but are excluded by selection until
//           they become active — the admin list and the feed both apply that rule from the same selection service.
//  reorder  slot-preserving + dense (see ordering.js). Products not pinned to this section → 400 (never creates pins).
//  unpin    idempotent: returns how many rows were removed (0 when it was not pinned) — deterministic, never an error.
import { MappingRequestError } from './errors.js';
import { applySlotOrder, orderRequested, toDense } from './ordering.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_PINS_PER_REQUEST = 500;

const asUuids = (values, label) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new MappingRequestError(400, 'INVALID_REQUEST', `${label} must be a non-empty array`);
  }
  if (values.length > MAX_PINS_PER_REQUEST) {
    throw new MappingRequestError(400, 'TOO_MANY_ITEMS', `at most ${MAX_PINS_PER_REQUEST} ${label} per request`);
  }
  const bad = values.filter((v) => typeof v !== 'string' || !UUID.test(v));
  if (bad.length) throw new MappingRequestError(400, 'INVALID_ID', `${label} must be UUIDs`, { invalid: bad.slice(0, 20) });
  return [...new Set(values.map((v) => v.toLowerCase()))]; // de-duplicate, keep first-seen order
};

export function createPinService({ prisma }) {
  const lockSection = (tx, sectionId) => tx.$queryRaw`SELECT id FROM product_sections WHERE id = ${sectionId}::int FOR UPDATE`;

  async function listPins(client, sectionId) {
    return client.$queryRaw`
      SELECT id::text AS id, product_id::text AS product_id, display_order
      FROM product_section_products WHERE section_id = ${sectionId}::int
      ORDER BY display_order ASC NULLS LAST, id ASC`;
  }

  /** @returns {Promise<{ data: object[], added: string[], alreadyMapped: string[] }>} */
  async function pin(sectionId, productIds) {
    const ids = asUuids(productIds, 'product_ids');
    return prisma.$transaction(async (tx) => {
      const locked = await lockSection(tx, sectionId);
      if (locked.length === 0) throw new MappingRequestError(404, 'SECTION_NOT_FOUND', 'Product section not found');

      const found = await tx.products.findMany({ where: { id: { in: ids } }, select: { id: true } });
      const foundSet = new Set(found.map((p) => p.id));
      const missing = ids.filter((id) => !foundSet.has(id));
      if (missing.length) throw new MappingRequestError(404, 'PRODUCT_NOT_FOUND', 'some products do not exist', { missing });

      const existing = await listPins(tx, sectionId);
      const existingIds = new Set(existing.map((r) => r.product_id));
      const fresh = ids.filter((id) => !existingIds.has(id));
      let next = existing.reduce((m, r) => Math.max(m, r.display_order ?? 0), 0);
      if (fresh.length) {
        await tx.product_section_products.createMany({
          data: fresh.map((product_id) => ({ section_id: sectionId, product_id, display_order: ++next })),
          skipDuplicates: true,
        });
      }
      const rows = await tx.product_section_products.findMany({
        where: { section_id: sectionId, product_id: { in: ids } },
        orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
      });
      return { data: rows, added: fresh, alreadyMapped: ids.filter((id) => existingIds.has(id)) };
    }, { timeout: 20000, maxWait: 10000 });
  }

  /** @param {Array<{product_id:string, display_order?:number}>} items @returns {Promise<Array<{id:string, display_order:number}>>} */
  async function reorder(sectionId, items) {
    if (Array.isArray(items)) asUuids(items.map((x) => x?.product_id), 'products'); // uuid + size validation up front
    const requested = orderRequested(items, {
      idOf: (x) => (typeof x?.product_id === 'string' ? x.product_id.toLowerCase() : undefined),
      positionOf: (x) => x?.display_order,
      label: 'products',
    });
    return prisma.$transaction(async (tx) => {
      const locked = await lockSection(tx, sectionId);
      if (locked.length === 0) throw new MappingRequestError(404, 'SECTION_NOT_FOUND', 'Product section not found');
      const current = await listPins(tx, sectionId);
      const byProduct = new Map(current.map((r) => [r.product_id, r.id]));
      const unknown = requested.filter((id) => !byProduct.has(id));
      if (unknown.length) throw new MappingRequestError(400, 'PRODUCT_NOT_PINNED', 'products are not pinned to this section', { unknown });

      const next = applySlotOrder(current.map((r) => r.product_id), requested, { label: 'product ids' });
      const dense = toDense(next);
      await tx.$executeRaw`
        UPDATE product_section_products p SET display_order = v.pos, updated_at = now()
        FROM (SELECT unnest(${dense.map((d) => d.id)}::uuid[]) AS product_id, unnest(${dense.map((d) => d.display_order)}::int[]) AS pos) v
        WHERE p.section_id = ${sectionId}::int AND p.product_id = v.product_id AND p.display_order IS DISTINCT FROM v.pos`;
      return dense.map((d) => ({ product_id: d.id, display_order: d.display_order }));
    }, { timeout: 20000, maxWait: 10000 });
  }

  /** @returns {Promise<{ removed: number }>} */
  async function unpin(sectionId, productId) {
    if (typeof productId !== 'string' || !UUID.test(productId)) {
      throw new MappingRequestError(400, 'INVALID_ID', 'productId must be a UUID');
    }
    const r = await prisma.product_section_products.deleteMany({ where: { section_id: sectionId, product_id: productId.toLowerCase() } });
    return { removed: r.count };
  }

  return { pin, reorder, unpin };
}
