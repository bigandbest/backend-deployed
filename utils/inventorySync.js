import prisma from "../config/prisma.js";

/**
 * Sync inventory table from product_warehouse_stock for a specific variant+warehouse.
 * Call this whenever product_warehouse_stock is updated.
 * 
 * inventory.stock_qty = sum of all PWS stock_quantity for this variant+warehouse
 */
export async function syncInventoryForVariant(variantId, warehouseId, tx = prisma) {
    // Get the total stock from product_warehouse_stock
    const pwsRecord = await tx.product_warehouse_stock.findFirst({
        where: {
            variant_id: variantId,
            warehouse_id: parseInt(warehouseId),
            is_active: true,
        },
        select: { stock_quantity: true, reserved_quantity: true },
    });

    const stockQty = pwsRecord?.stock_quantity || 0;
    const reservedQty = pwsRecord?.reserved_quantity || 0;

    // Upsert into inventory table
    await tx.inventory.upsert({
        where: {
            variant_id_warehouse_id: {
                variant_id: variantId,
                warehouse_id: parseInt(warehouseId),
            },
        },
        update: {
            stock_qty: stockQty,
            reserved_qty: reservedQty,
            updated_at: new Date(),
        },
        create: {
            variant_id: variantId,
            warehouse_id: parseInt(warehouseId),
            stock_qty: stockQty,
            reserved_qty: reservedQty,
            seller_stock: 0,
            admin_stock: stockQty,
            updated_at: new Date(),
        },
    });
}

/**
 * Sync all inventory records from product_warehouse_stock.
 * Use this for initial migration or periodic reconciliation.
 */
export async function syncAllInventoryFromPWS() {
    // Get all active product_warehouse_stock records
    const allPWS = await prisma.product_warehouse_stock.findMany({
        where: { is_active: true },
        select: {
            variant_id: true,
            warehouse_id: true,
            stock_quantity: true,
            reserved_quantity: true,
        },
    });

    console.log(`Syncing ${allPWS.length} PWS records to inventory...`);

    let synced = 0;
    for (const pws of allPWS) {
        if (!pws.variant_id) continue; // Skip records without variant_id

        try {
            await prisma.inventory.upsert({
                where: {
                    variant_id_warehouse_id: {
                        variant_id: pws.variant_id,
                        warehouse_id: pws.warehouse_id,
                    },
                },
                update: {
                    stock_qty: pws.stock_quantity,
                    reserved_qty: pws.reserved_quantity || 0,
                    updated_at: new Date(),
                },
                create: {
                    variant_id: pws.variant_id,
                    warehouse_id: pws.warehouse_id,
                    stock_qty: pws.stock_quantity,
                    reserved_qty: pws.reserved_quantity || 0,
                    seller_stock: 0,
                    admin_stock: pws.stock_quantity,
                    updated_at: new Date(),
                },
            });
            synced++;
        } catch (err) {
            console.error(`Failed to sync inventory for variant ${pws.variant_id} warehouse ${pws.warehouse_id}:`, err.message);
        }
    }

    console.log(`Synced ${synced}/${allPWS.length} records to inventory table.`);
    return { total: allPWS.length, synced };
}
