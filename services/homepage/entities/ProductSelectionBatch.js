// Batched product-ID selection for ALL product-carousel sections in one pass (plan §18/§19).
// Replaces "per section: 3 product queries with take:100 and no ORDER BY" with a constant number of queries:
//   pins (1) + categories (1 raw) + groups (1 raw) + at most one SUPER_SAVER and one NEW_ARRIVALS query.
//
// PARITY NOTE (decided): group -> products keeps today's semantics — every active product in the group's SUBCATEGORY
// (productSectionController.computeAndCacheSectionContent step 3) — not products.group_id. Revisit separately.
// Deliberate improvement over today: results are ORDERED (created_at DESC, id) so selection is deterministic.
//
// THIS IS THE ONLY PRODUCT-SELECTION ALGORITHM. The homepage feed (HomepageFeedService) and the admin/See-All list
// (GET /product-sections/:id/products via selectForSection) both call it — there is no second implementation and no
// fallback: nothing mapped => an empty list. Only ACTIVE products with at least one ACTIVE variant are ever selected,
// and that filter is applied INSIDE the query (pins included) so inactive pins never consume the limit.
//
// GROUP SEMANTICS (documented + tested): group -> group.subcategory_id -> all active products of that subcategory.
// Groups that share a subcategory therefore select the SAME product set (DISTINCT (section, subcategory) below keeps
// them from repeating each product once per group). products.group_id is intentionally NOT used (owner decision
// 2026-09-21, parity first). If group membership is wanted later it is a one-line change of the JOIN below.

const dedupe = (ids) => [...new Set(ids)];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{ id:number, source:'MAPPED'|'SUPER_SAVER'|'NEW_ARRIVALS', limit:number }>} specs
 * @returns {Promise<Map<number, string[]>>} sectionId -> ordered, de-duplicated product ids (<= limit)
 */
export async function selectProducts(prisma, specs) {
  const result = new Map(specs.map((s) => [s.id, []]));
  if (specs.length === 0) return result;

  const mapped = specs.filter((s) => s.source === 'MAPPED');
  const superSaver = specs.filter((s) => s.source === 'SUPER_SAVER');
  const newArrivals = specs.filter((s) => s.source === 'NEW_ARRIVALS');

  const tasks = [];
  const parts = { pins: [], cats: [], groups: [], superSaver: [], newArrivals: [] };

  if (mapped.length) {
    const ids = mapped.map((s) => s.id);
    const cap = Math.max(...mapped.map((s) => s.limit));

    tasks.push(
      prisma.$queryRaw`
        SELECT m.section_id AS section_id, m.product_id::text AS product_id
        FROM product_section_products m
        JOIN products p ON p.id = m.product_id AND p.active = true
        WHERE m.section_id = ANY(${ids}::int[])
          AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = true)
        ORDER BY m.section_id, m.display_order ASC NULLS LAST, m.id ASC`
        .then((rows) => { parts.pins = rows; }),
    );

    tasks.push(
      prisma.$queryRaw`
        SELECT section_id, product_id FROM (
          SELECT m.section_id AS section_id, p.id::text AS product_id,
                 ROW_NUMBER() OVER (PARTITION BY m.section_id ORDER BY p.created_at DESC NULLS LAST, p.id) AS rn
          FROM product_section_categories m
          JOIN products p ON p.category_id = m.category_id AND p.active = true
          WHERE m.section_id = ANY(${ids}::int[])
            AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = true)
        ) t WHERE rn <= ${cap}::int
        ORDER BY section_id, rn`
        .then((rows) => { parts.cats = rows; }),
    );

    tasks.push(
      prisma.$queryRaw`
        SELECT section_id, product_id FROM (
          SELECT m.section_id AS section_id, p.id::text AS product_id,
                 ROW_NUMBER() OVER (PARTITION BY m.section_id ORDER BY p.created_at DESC NULLS LAST, p.id) AS rn
          -- DISTINCT (section, subcategory) first: several groups of one section can share a subcategory, and joining
          -- products per GROUP would repeat every product once per group, burning the per-section row cap on duplicates.
          FROM (
            SELECT DISTINCT m0.section_id, g0.subcategory_id
            FROM product_section_groups m0
            JOIN groups g0 ON g0.id = m0.group_id
            WHERE m0.section_id = ANY(${ids}::int[])
          ) m
          JOIN products p ON p.subcategory_id = m.subcategory_id AND p.active = true
          WHERE EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = true)
        ) t WHERE rn <= ${cap}::int
        ORDER BY section_id, rn`
        .then((rows) => { parts.groups = rows; }),
    );
  }

  if (superSaver.length) {
    const cap = Math.max(...superSaver.map((s) => s.limit));
    tasks.push(
      prisma.$queryRaw`
        SELECT p.id::text AS product_id
        FROM products p JOIN product_variants pv ON pv.product_id = p.id
        WHERE p.active = true AND pv.active = true
        GROUP BY p.id
        ORDER BY MIN(pv.price) ASC, p.id
        LIMIT ${cap}::int`
        .then((rows) => { parts.superSaver = rows.map((r) => r.product_id); }),
    );
  }

  if (newArrivals.length) {
    const cap = Math.max(...newArrivals.map((s) => s.limit));
    tasks.push(
      prisma.products
        .findMany({
          where: { active: true, variants: { some: { active: true } } },
          select: { id: true },
          orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
          take: cap,
        })
        .then((rows) => { parts.newArrivals = rows.map((r) => r.id); }),
    );
  }

  await Promise.all(tasks);

  const bySection = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.section_id)) m.set(r.section_id, []);
      m.get(r.section_id).push(r.product_id);
    }
    return m;
  };
  const pins = bySection(parts.pins);
  const cats = bySection(parts.cats);
  const groups = bySection(parts.groups);

  for (const s of mapped) {
    // precedence: admin pins first, then group-derived, then category-derived
    const merged = dedupe([...(pins.get(s.id) || []), ...(groups.get(s.id) || []), ...(cats.get(s.id) || [])]);
    result.set(s.id, merged.slice(0, s.limit));
  }
  for (const s of superSaver) result.set(s.id, parts.superSaver.slice(0, s.limit));
  for (const s of newArrivals) result.set(s.id, parts.newArrivals.slice(0, s.limit));

  return result;
}

/** Upper bound for a single section's full (See-All / admin) selection. */
export const MAX_SECTION_SELECTION = 1000;

/**
 * Full ordered selection for ONE section — what the admin panel and "See All" show. Same algorithm as the feed;
 * only the limit differs (the feed truncates to config.limit, this returns everything up to MAX_SECTION_SELECTION).
 * @returns {Promise<string[]>}
 */
export async function selectForSection(prisma, { id, source = 'MAPPED' }) {
  const map = await selectProducts(prisma, [{ id, source, limit: MAX_SECTION_SELECTION }]);
  return map.get(id) || [];
}

// Exported for tests: the pure merge/precedence rule.
export const _internal = { dedupe };
