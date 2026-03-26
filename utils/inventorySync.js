import prisma from "../config/prisma.js";

/**
 * No-op sync — inventory is now the source of truth.
 * recalculateSellerStock() in seller.dao.js already upserts directly into inventory.
 * This function is kept for call-site compatibility but does nothing extra.
 */
export async function syncInventoryForVariant(variantId, warehouseId, tx = prisma) {
    // inventory is already updated by the caller — nothing to do here.
}

export async function syncAllInventoryFromPWS() {
    console.warn("syncAllInventoryFromPWS: product_warehouse_stock table does not exist. Skipping.");
    return { total: 0, synced: 0 };
}
