/**
 * Allocation Engine facade (Fulfillment Architecture Consolidation).
 *
 * findWarehouseForProduct(s) remain pure pass-throughs to warehouseService.js
 * (Stage 1) — internals still move to the consolidated engine in a later
 * stage, not yet done. resolveSubOrderItems() (Stage 3) is new logic: it
 * fixes source_type propagation so seller allocations are no longer
 * silently relabeled as 'division' on their way into sub-order creation.
 */

import {
    findWarehouseForProduct as _findWarehouseForProduct,
    findWarehouseForProducts as _findWarehouseForProducts,
} from './warehouseService.js';

export const findWarehouseForProduct = (productId, pincode, productType, quantity = 1, variantId = null) =>
    _findWarehouseForProduct(productId, pincode, productType, quantity, variantId);

export const findWarehouseForProducts = (items, pincode) =>
    _findWarehouseForProducts(items, pincode);

/**
 * Stage 3 (Fulfillment Architecture Consolidation): converts allocation
 * results into the resolvedItems shape subOrderService.createSubOrders()
 * expects, with CORRECT source_type propagation.
 *
 * Replaces legacyResolveSubOrderItems() (Stage 2's temporary shim, which
 * intentionally preserved the seller→division relabeling bug). This version
 * fixes that bug: a seller allocation now stays 'seller' all the way through
 * to the sub-order, matching the logic placeOrderWithDetailedAddress already
 * had correct (orderController.js, "assignment_source === 'seller'" check).
 *
 * Never overwrite 'seller' → 'division' — only 'zonal' is inferred from the
 * warehouse's own type; everything else respects assignment_source exactly
 * as the allocation engine determined it.
 *
 * @param {Array<{productId, variantId, quantity, price, warehouseInfo}>} normalizedItems
 * @param {Object<number, string>} warehouseTypeMap - warehouse_id -> warehouse type
 * @returns {Array} resolvedItems shape expected by subOrderService.createSubOrders()
 */
export const resolveSubOrderItems = (normalizedItems, warehouseTypeMap) => {
    const estimatedDeliveryMinutes = { seller: 120, division: 120, zonal: 30 };

    return normalizedItems
        .filter((i) => i.warehouseInfo)
        .map(({ productId, variantId, quantity, price, warehouseInfo }) => {
            const wType = warehouseTypeMap[warehouseInfo.warehouse_id];
            const sourceType = wType === 'zonal'
                ? 'zonal'
                : (warehouseInfo.assignment_source === 'seller' ? 'seller' : 'division');
            return {
                product_id: productId,
                variant_id: variantId,
                quantity,
                price,
                source_type: sourceType,
                source_id: warehouseInfo.warehouse_id,
                seller_id: warehouseInfo.seller_id || null,
                estimated_delivery_minutes: estimatedDeliveryMinutes[sourceType],
            };
        });
};

export default {
    findWarehouseForProduct,
    findWarehouseForProducts,
    resolveSubOrderItems,
};
