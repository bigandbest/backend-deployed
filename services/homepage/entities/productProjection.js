// HomepageProduct — the slim card projection (plan §13). Pure function: unit-testable without a DB.
//
// Facts this relies on (verified in the schema): price / old_price / discount_percentage / title / net_quantity live on
// product_variants, NOT on products; the legacy `product.price|old_price|discount|uom` reads in controllers resolve to
// the default variant (or are undefined). Stock comes from inventoryDAO.getStockByVariantIds (net of reserved,
// seller stock included), exactly as the current section content computes it.

const num = (v) => (v == null ? null : Number(v));

const pickDefaultVariant = (variants) => variants.find((v) => v.isDefault) || variants[0] || null;

/**
 * @param {object} row       products row selected by EntityHydrator (variants[] already active-only)
 * @param {Map<string, {available_stock:number}>} stockMap  variantId -> stock info
 * @returns {object|null}    HomepageProduct, or null if the product has no purchasable variant
 */
export function toHomepageProduct(row, stockMap) {
  const variants = (row.variants || []).map((v) => {
    const price = num(v.price);
    const rawOld = num(v.old_price);
    // Only ever expose a REAL old price (project rule: never fabricate a strike-through price).
    const oldPrice = rawOld != null && price != null && rawOld > price ? rawOld : null;
    const stock = stockMap.get(v.id)?.available_stock ?? 0;
    return {
      id: v.id,
      title: v.title ?? null,
      netQuantity: v.net_quantity ?? null,
      packagingDetails: v.packaging_details ?? null,
      isDefault: v.is_default === true,
      price,
      oldPrice,
      stock,
      inStock: stock > 0,
      bulkTiers: (v.bulk_pricing_tiers || []).map((t) => ({
        minQuantity: t.min_quantity,
        maxQuantity: t.max_quantity ?? null,
        unitPrice: num(t.unit_price),
      })),
    };
  });

  if (variants.length === 0) return null;

  const def = pickDefaultVariant(variants);
  const stock = variants.reduce((s, v) => s + v.stock, 0);
  const declared = (row.variants || []).find((v) => v.id === def.id)?.discount_percentage;
  const discountPct =
    declared != null && declared > 0
      ? declared
      : def.oldPrice != null && def.price > 0
        ? Math.round(((def.oldPrice - def.price) / def.oldPrice) * 100)
        : null;

  const brand = row.brands?.[0]?.brand;

  return {
    id: row.id,
    name: row.name,
    image: row.media?.[0]?.url ?? null,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    storeName: row.store?.name ?? null,
    rating: num(row.rating),
    reviewCount: row.review_count ?? null,
    price: def.price,
    oldPrice: def.oldPrice,
    discountPct,
    inStock: stock > 0,
    stock,
    defaultVariantId: def.id,
    variants: variants.map(({ isDefault, ...v }) => v),
  };
}
