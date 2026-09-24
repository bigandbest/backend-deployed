// Atomic, validated section reorder. Replaces the old "Promise.all of per-row updates with whatever numbers the
// client sent" — which could apply partially, tie, and leave hidden rows on a stale scale.
//
// Guarantees: ONE transaction; a transaction-scoped advisory lock serialises concurrent reorders (last committed
// request wins, none interleave); every row ends with a dense 1..N display_order; ids are validated (unknown /
// duplicate → 400, nothing written). Cache invalidation is done by the route middleware AFTER the 2xx (=after commit).
import { applySlotOrder, orderRequested, toDense } from './ordering.js';

const ORDER_LOCK = 'product_sections_display_order';

export function createSectionOrderService({ prisma }) {
  /**
   * @param {Array<{id:number|string, display_order?:number}>} items
   * @param {{id?:string, role?:string}} [actor]
   * @returns {Promise<Array<{id:number, display_order:number}>>} the complete new order
   */
  async function reorderSections(items, actor = {}) {
    const requested = orderRequested(items, {
      idOf: (x) => (x && /^\d+$/.test(String(x.id)) ? Number(x.id) : undefined),
      positionOf: (x) => x?.display_order,
      label: 'sections',
    });

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ORDER_LOCK}))`;
      const rows = await tx.$queryRaw`SELECT id FROM product_sections ORDER BY display_order ASC NULLS LAST, id ASC`;
      const current = rows.map((r) => r.id);
      const next = applySlotOrder(current, requested, { label: 'section ids' });
      const dense = toDense(next);

      await tx.$executeRaw`
        UPDATE product_sections s SET display_order = v.pos
        FROM (SELECT unnest(${dense.map((d) => d.id)}::int[]) AS id, unnest(${dense.map((d) => d.display_order)}::int[]) AS pos) v
        WHERE s.id = v.id AND s.display_order IS DISTINCT FROM v.pos`;

      await tx.section_audit_log.create({
        data: {
          section_id: null,
          actor_id: actor.id ? String(actor.id).slice(0, 64) : null,
          actor_role: actor.role ? String(actor.role).slice(0, 32) : null,
          action: 'SECTION_REORDERED',
          diff: { requested, order: dense.map((d) => d.id) },
        },
      });
      return dense;
    }, { timeout: 20000, maxWait: 10000 });
  }

  /** Renumbers every row 1..N in canonical order (idempotent; used by the one-off normalisation and by tests). */
  async function normalize() {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ORDER_LOCK}))`;
      await tx.$executeRaw`
        UPDATE product_sections s SET display_order = r.pos
        FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY display_order ASC NULLS LAST, id ASC)::int AS pos FROM product_sections) r
        WHERE s.id = r.id AND s.display_order IS DISTINCT FROM r.pos`;
    });
  }

  return { reorderSections, normalize };
}
