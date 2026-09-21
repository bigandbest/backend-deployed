import { toHomepageProduct } from './productProjection.js';

// Prisma select for the slim card projection. NOTE: bulk tiers are only tiny tables (5 rows in the snapshot).
export const PRODUCT_SELECT = {
  id: true,
  name: true,
  rating: true,
  review_count: true,
  brands: { take: 1, select: { brand: { select: { id: true, name: true } } } },
  store: { select: { name: true } },
  media: { where: { is_primary: true }, take: 1, select: { url: true } },
  variants: {
    where: { active: true },
    orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    select: {
      id: true, title: true, price: true, old_price: true, discount_percentage: true,
      net_quantity: true, packaging_details: true, is_default: true,
      bulk_pricing_tiers: {
        orderBy: { min_quantity: 'asc' },
        select: { min_quantity: true, max_quantity: true, unit_price: true },
      },
    },
  },
};

const STOCK_CHUNK = 1000; // inventoryDAO.getStockByVariantIds silently truncates beyond 1000 — chunk instead.

/**
 * One product query + chunked inventory queries for the UNION of every section's product ids.
 * @returns {Promise<Map<string, object>>} productId -> HomepageProduct (only active products with a variant)
 */
export async function hydrateProducts({ prisma, inventoryDAO }, ids, { warehouseId = null } = {}) {
  const out = new Map();
  if (!ids || ids.length === 0) return out;

  const rows = await prisma.products.findMany({
    where: { id: { in: ids }, active: true },
    select: PRODUCT_SELECT,
  });

  const variantIds = rows.flatMap((r) => r.variants.map((v) => v.id));
  const stockMap = new Map();
  for (let i = 0; i < variantIds.length; i += STOCK_CHUNK) {
    const part = await inventoryDAO.getStockByVariantIds(variantIds.slice(i, i + STOCK_CHUNK), warehouseId);
    for (const [k, v] of part) stockMap.set(k, v);
  }

  for (const row of rows) {
    const p = toHomepageProduct(row, stockMap);
    if (p) out.set(p.id, p);
  }
  return out;
}
