import prisma from '../config/prisma.js';
import productDao from '../dao/product.dao.js';
import cache from '../utils/cache.js';

const WAREHOUSE_CACHE_TTL = 300; // 5 minutes in seconds

/**
 * Find available inventory in a set of warehouses for a given product+variant.
 * Accounts for both reserved_qty (hard locks) and soft_reserved_qty (cart locks).
 */
export const findStockInWarehouses = async (productId, warehouseIds, quantity = 1, variantId = null, warehouseType = null) => {
  if (!warehouseIds?.length) return null;

  const candidates = await prisma.inventory.findMany({
    where: {
      warehouse_id: { in: warehouseIds },
      product_variants: {
        ...(variantId ? { id: variantId } : {}),
        products: { id: productId },
      },
      ...(warehouseType ? { warehouses: { type: warehouseType, is_active: true } } : {}),
    },
    include: { warehouses: true },
    orderBy: { stock_qty: 'desc' },
    take: 20,
  });

  return candidates.find(inv =>
    (inv.stock_qty - (inv.reserved_qty || 0) - (inv.soft_reserved_qty || 0)) >= quantity
  ) || null;
};

export const getDivisionWarehousesForPincode = async (pincode) => {
  return prisma.warehouse_pincodes.findMany({
    where: {
      pincode,
      is_active: true,
      warehouse: { is_active: true, type: 'division' },
    },
    include: { warehouse: true },
  });
};

export const getZonalWarehousesForPincode = async (pincode) => {
  const zoneMappings = await prisma.zone_pincodes.findMany({
    where: { pincode, is_active: true },
    include: {
      delivery_zones: {
        include: {
          warehouse_zones: {
            where: { is_active: true },
            include: { warehouses: true },
          },
        },
      },
    },
  });

  const zonalWarehouses = [];
  const seenIds = new Set();

  for (const zoneMapping of zoneMappings) {
    for (const warehouseZone of zoneMapping.delivery_zones?.warehouse_zones || []) {
      const wh = warehouseZone.warehouses;
      if (wh && wh.is_active && wh.type === 'zonal' && !seenIds.has(wh.id)) {
        seenIds.add(wh.id);
        zonalWarehouses.push(wh);
      }
    }
  }

  return zonalWarehouses;
};

/**
 * Find the best warehouse for a product at a given pincode.
 *
 * Priority is FIXED per spec — never changes based on distance, price, or time:
 *   1. Division Warehouse  (city-level dark store, own inventory)
 *   2. Zonal Warehouse     (hyperlocal dark store, own inventory)
 *   3. Seller Store        (seller's stock, registered for this pincode)
 *
 * Rule 8: if both Division and Seller have stock → always choose Division.
 */
export const findWarehouseForProduct = async (productId, pincode, _productType, quantity = 1, variantId = null) => {
  const cacheKey = `wh:${productId}:${variantId || 'nv'}:${pincode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const normalizedPincode = String(pincode || '').trim();

    // These four lookups are mutually independent — none depends on another's
    // result, only the *priority order in which we act on them* matters. Fetching
    // them in parallel instead of one-await-at-a-time turns N sequential
    // network round-trips into 1, which matters a lot against a remote DB.
    const [product, divisionMappings, zonalWarehouses, sellerPincodeRows] = await Promise.all([
      productDao.getProductById(productId),
      normalizedPincode ? getDivisionWarehousesForPincode(normalizedPincode) : Promise.resolve([]),
      normalizedPincode ? getZonalWarehousesForPincode(normalizedPincode) : Promise.resolve([]),
      normalizedPincode
        ? prisma.seller_pincode_requests.findMany({
            where: { pincode: normalizedPincode, status: 'APPROVED' },
            include: {
              sellers: {
                select: {
                  id: true,
                  is_active: true,
                  is_open: true,
                  is_verified: true,
                  verification_status: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    if (!product) {
      console.warn(`Product not found: ${productId}`);
      return null;
    }

    // ── PRIORITY 1: Division Warehouse ──────────────────────────────────────
    const divisionWarehouseIds = divisionMappings.map((m) => m.warehouse_id);

    if (divisionWarehouseIds.length > 0) {
      const divisionStock = await findStockInWarehouses(
        productId, divisionWarehouseIds, quantity, variantId, 'division'
      );
      if (divisionStock) {
        const result = {
          warehouse_id: divisionStock.warehouse_id,
          warehouse_name: divisionStock.warehouses?.name || 'Division Warehouse',
          seller_id: null,
          assignment_source: 'division',
        };
        cache.set(cacheKey, result, WAREHOUSE_CACHE_TTL);
        return result;
      }
    }

    // ── PRIORITY 2: Zonal Warehouse ─────────────────────────────────────────
    const zonalWarehouseIds = zonalWarehouses.map((w) => w.id);

    if (zonalWarehouseIds.length > 0) {
      const zonalStock = await findStockInWarehouses(
        productId, zonalWarehouseIds, quantity, variantId, 'zonal'
      );
      if (zonalStock) {
        const result = {
          warehouse_id: zonalStock.warehouse_id,
          warehouse_name: zonalStock.warehouses?.name || 'Zonal Warehouse',
          seller_id: null,
          assignment_source: 'zonal',
        };
        cache.set(cacheKey, result, WAREHOUSE_CACHE_TTL);
        return result;
      }
    }

    // ── PRIORITY 3: Seller Stores ────────────────────────────────────────────
    if (normalizedPincode) {
      const activeSellers = sellerPincodeRows
        .filter(
          (r) =>
            r.sellers?.is_active &&
            r.sellers?.is_open &&
            r.sellers?.is_verified &&
            r.sellers?.verification_status === 'VERIFIED'
        )
        .map((r) => r.sellers);

      // Look up every active seller's stock in parallel, then pick the first
      // one (in the original priority order) with enough stock — same
      // selection outcome as the old sequential for-loop, just concurrent.
      const sellerProducts = await Promise.all(
        activeSellers.map((seller) =>
          prisma.seller_products.findFirst({
            where: {
              seller_id: seller.id,
              product_id: productId,
              ...(variantId ? { variant_id: variantId } : {}),
              is_active: true,
              status: 'APPROVED',
            },
            include: { warehouses: true },
            orderBy: { stock_quantity: 'desc' },
          })
        )
      );

      for (let i = 0; i < activeSellers.length; i++) {
        const seller = activeSellers[i];
        const sellerProduct = sellerProducts[i];

        if (
          sellerProduct &&
          sellerProduct.stock_quantity - (sellerProduct.reserved_quantity || 0) >= quantity
        ) {
          const result = {
            warehouse_id: sellerProduct.warehouse_id,
            warehouse_name: sellerProduct.warehouses?.name || 'Seller Store',
            seller_id: seller.id,
            assignment_source: 'seller',
          };
          cache.set(cacheKey, result, WAREHOUSE_CACHE_TTL);
          return result;
        }
      }
    }

    return null;
  } catch (err) {
    console.error('Error in findWarehouseForProduct:', err);
    return null;
  }
};

/**
 * Parallel warehouse selection for all cart items.
 * Collects ALL failures instead of stopping on the first one,
 * so the customer sees every undeliverable item at once.
 *
 * @param {Array<{productId, variantId, productType, quantity}>} items
 * @param {string} pincode  — delivery pincode (shared for all items)
 * @returns {{ successes: Array<{item, warehouseInfo}>, failures: Array<{productId, variantId, reason}> }}
 */
export const findWarehouseForProducts = async (items, pincode) => {
  const results = await Promise.allSettled(
    items.map(item =>
      findWarehouseForProduct(item.productId, pincode, item.productType, item.quantity, item.variantId)
    )
  );

  const successes = [];
  const failures = [];

  results.forEach((result, idx) => {
    const item = items[idx];
    if (result.status === 'rejected') {
      failures.push({
        productId: item.productId,
        variantId: item.variantId,
        reason: result.reason?.message || 'lookup_error',
      });
    } else if (!result.value) {
      failures.push({
        productId: item.productId,
        variantId: item.variantId,
        reason: 'out_of_stock',
      });
    } else {
      successes.push({ item, warehouseInfo: result.value });
    }
  });

  return { successes, failures };
};
