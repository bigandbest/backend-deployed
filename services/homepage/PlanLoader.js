// Loads the homepage "plan": every deliverable section + its mapping ids, in ~6 queries total
// (vs 4+ per section today). Pure DB read — caching is layered on top in lib/homepageCache (Phase 5).

const SECTION_SELECT = {
  id: true, section_key: true, section_name: true, description: true, component_name: true,
  section_type: true, config: true, config_version: true,
  platforms: true, load_mode: true, display_order: true,
  parent_section_id: true, slot: true, updated_at: true,
};

/**
 * @returns {Promise<{ sections: object[], mappings: Record<number, { PRODUCT:string[], CATEGORY:string[], GROUP:string[], SUBCATEGORY:string[] }> }>}
 */
export async function loadPlan(prisma) {
  // Active, homepage-eligible, typed sections. Children (pair left/right) are included; the assembler nests them.
  const sections = await prisma.product_sections.findMany({
    where: { is_active: true, show_on_home: true, section_type: { not: null } },
    select: SECTION_SELECT,
    orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
  });

  const ids = sections.map((s) => s.id);
  const mappings = Object.fromEntries(
    ids.map((id) => [id, { PRODUCT: [], CATEGORY: [], GROUP: [], SUBCATEGORY: [] }]),
  );
  if (ids.length === 0) return { sections, mappings };

  const [pins, cats, groups, subs] = await Promise.all([
    prisma.product_section_products.findMany({
      where: { section_id: { in: ids } },
      select: { section_id: true, product_id: true },
      orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
    }),
    prisma.product_section_categories.findMany({
      where: { section_id: { in: ids } },
      select: { section_id: true, category_id: true },
      orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
    }),
    prisma.product_section_groups.findMany({
      where: { section_id: { in: ids } },
      select: { section_id: true, group_id: true },
      orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
    }),
    prisma.section_subcategory_mappings.findMany({
      where: { section_id: { in: ids }, is_active: true },
      select: { section_id: true, subcategory_id: true },
      orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
    }),
  ]);

  for (const r of pins) mappings[r.section_id]?.PRODUCT.push(r.product_id);
  for (const r of cats) mappings[r.section_id]?.CATEGORY.push(r.category_id);
  for (const r of groups) mappings[r.section_id]?.GROUP.push(r.group_id);
  for (const r of subs) mappings[r.section_id]?.SUBCATEGORY.push(r.subcategory_id);

  return { sections, mappings };
}
