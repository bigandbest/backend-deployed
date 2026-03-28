import prisma from '../config/prisma.js';
import productDao from '../dao/product.dao.js';

export const findStockInWarehouses = async (productId, warehouseIds, quantity = 1, variantId = null, warehouseType = null) => {
  if (!warehouseIds?.length) return null;

  return prisma.inventory.findFirst({
    where: {
      warehouse_id: { in: warehouseIds },
      stock_qty: { gte: quantity },
      product_variants: {
        ...(variantId ? { id: variantId } : {}),
        products: { id: productId },
      },
      ...(warehouseType ? { warehouses: { type: warehouseType, is_active: true } } : {}),
    },
    include: { warehouses: true },
    orderBy: { stock_qty: 'desc' },
  });
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
 * Priority: seller → division → zonal → null (unavailable)
 */
export const findWarehouseForProduct = async (productId, pincode, productType, quantity = 1, variantId = null) => {
  try {
    const product = await productDao.getProductById(productId);
    if (!product) {
      console.warn(`Product not found: ${productId}`);
      return null;
    }

    const normalizedPincode = String(pincode || '').trim();

    const divisionMappings = normalizedPincode
      ? await getDivisionWarehousesForPincode(normalizedPincode)
      : [];
    const divisionWarehouseIds = divisionMappings.map((m) => m.warehouse_id);

    // 1. Seller stock in a division warehouse
    if (divisionWarehouseIds.length > 0) {
      const sellerProduct = await prisma.seller_products.findFirst({
        where: {
          product_id: productId,
          warehouse_id: { in: divisionWarehouseIds },
          is_active: true,
          status: 'APPROVED',
          stock_quantity: { gte: quantity },
          ...(variantId ? { variant_id: variantId } : {}),
          sellers: { is_active: true, is_open: true },
        },
        include: { sellers: true, warehouses: true },
        orderBy: { stock_quantity: 'desc' },
      });

      if (sellerProduct) {
        return {
          warehouse_id: sellerProduct.warehouse_id,
          warehouse_name: sellerProduct.warehouses?.name || 'Division Warehouse',
          seller_id: sellerProduct.seller_id,
          assignment_source: 'seller',
        };
      }
    }

    // 2. Division warehouse stock
    const divisionStock = await findStockInWarehouses(productId, divisionWarehouseIds, quantity, variantId, 'division');
    if (divisionStock) {
      return {
        warehouse_id: divisionStock.warehouse_id,
        warehouse_name: divisionStock.warehouses?.name || 'Division Warehouse',
        seller_id: null,
        assignment_source: 'division',
      };
    }

    // 3. Zonal warehouse stock
    const zonalWarehouses = normalizedPincode ? await getZonalWarehousesForPincode(normalizedPincode) : [];
    const zonalWarehouseIds = zonalWarehouses.map((w) => w.id);
    const zonalStock = await findStockInWarehouses(productId, zonalWarehouseIds, quantity, variantId, 'zonal');
    if (zonalStock) {
      return {
        warehouse_id: zonalStock.warehouse_id,
        warehouse_name: zonalStock.warehouses?.name || 'Zonal Warehouse',
        seller_id: null,
        assignment_source: 'zonal',
      };
    }

    return null;
  } catch (err) {
    console.error('Error in findWarehouseForProduct:', err);
    return null;
  }
};
