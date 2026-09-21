// Per-request pincode availability overlay (plan §26). Mirrors productController.enrichWithAvailability and
// productSectionController's enrichment, but runs ONCE over the union of all products in the response.
// Never part of any cache key or cached value; replaces map entries instead of mutating them so shared/cached
// product objects are never modified.

export const PINCODE_PATTERN = /^\d{6}$/;

export function createAvailabilityOverlay(cartAvailabilityDAO) {
  return async function applyAvailability(productsMap, pincode) {
    if (!PINCODE_PATTERN.test(pincode) || productsMap.size === 0) return;

    const items = [...productsMap.values()].map((p) => ({
      product_id: p.id,
      variant_id: p.defaultVariantId ?? null,
      quantity: 1,
    }));

    const availability = await cartAvailabilityDAO.checkBulkAvailability(items, pincode);
    for (const [id, p] of productsMap) {
      productsMap.set(id, { ...p, availability: availability[id] ?? { available: true } });
    }
  };
}
