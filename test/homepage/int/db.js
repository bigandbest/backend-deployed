import crypto from 'crypto';
import prisma from '../../../config/prisma.js';

export { prisma };
const q = (sql, ...a) => prisma.$queryRawUnsafe(sql, ...a);
export const uuid = () => crypto.randomUUID();

/** Wipes every table the homepage specs use (scratch DB only — env.js already refused non-local hosts). */
export async function reset() {
  await prisma.$executeRawUnsafe(`TRUNCATE product_section_products, product_section_categories, product_section_groups,
    section_subcategory_mappings, section_audit_log, inventory, bulk_pricing_tiers, product_variants, products, groups,
    subcategories, categories, product_sections, add_banner RESTART IDENTITY CASCADE`);
}

export const mk = {
  async category(name, { active = true } = {}) {
    return (await q(`INSERT INTO categories (name, active) VALUES ($1, $2) RETURNING id::text`, name, active))[0].id;
  },
  async subcategory(name, categoryId, { active = true, sort_order = 0 } = {}) {
    return (await q(`INSERT INTO subcategories (name, category_id, active, sort_order) VALUES ($1, $2::uuid, $3, $4) RETURNING id::text`, name, categoryId, active, sort_order))[0].id;
  },
  async group(name, subcategoryId) {
    return (await q(`INSERT INTO groups (name, subcategory_id) VALUES ($1, $2::uuid) RETURNING id::text`, name, subcategoryId))[0].id;
  },
  /** @param {{ categoryId?, subcategoryId?, groupId?, active?, variant?: boolean|'inactive', ageDays?: number }} o */
  async product(name, o = {}) {
    const id = (await q(
      `INSERT INTO products (name, category_id, subcategory_id, group_id, active, created_at)
       VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, now() - ($6 || ' days')::interval) RETURNING id::text`,
      name, o.categoryId ?? null, o.subcategoryId ?? null, o.groupId ?? null, o.active ?? true, String(o.ageDays ?? 0),
    ))[0].id;
    if (o.variant !== false) {
      await q(`INSERT INTO product_variants (product_id, sku, title, price, active, is_default, updated_at) VALUES ($1::uuid, $2, $3, 10, $4, true, now())`,
        id, `sku-${id}`, `${name} v`, o.variant !== 'inactive');
    }
    return id;
  },
  async section({ key, type = null, config = {}, order = 0, active = true, show = true, platforms = ['web', 'mobile'], parent = null, slot = null, name, component = 'X' }) {
    return (await q(
      `INSERT INTO product_sections (section_key, section_name, component_name, section_type, config, display_order, is_active, show_on_home, platforms, parent_section_id, slot)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::text[], $10, $11) RETURNING id`,
      key, name ?? key, component, type, JSON.stringify(config), order, active, show, platforms, parent, slot,
    ))[0].id;
  },
  pin: (sectionId, productId, order = 0) => q(`INSERT INTO product_section_products (section_id, product_id, display_order) VALUES ($1, $2::uuid, $3)`, sectionId, productId, order),
  mapCategory: (sectionId, categoryId) => q(`INSERT INTO product_section_categories (section_id, category_id) VALUES ($1, $2::uuid)`, sectionId, categoryId),
  mapGroup: (sectionId, groupId) => q(`INSERT INTO product_section_groups (section_id, group_id, is_active) VALUES ($1, $2::uuid, true)`, sectionId, groupId),
  mapSubcategory: (sectionId, subId, { active = true, order = 0 } = {}) => q(`INSERT INTO section_subcategory_mappings (section_id, subcategory_id, is_active, display_order) VALUES ($1, $2::uuid, $3, $4)`, sectionId, subId, active, order),
};

export const orderOf = async () => (await q(`SELECT id, display_order FROM product_sections ORDER BY display_order ASC NULLS LAST, id ASC`));
export const dbq = q;
