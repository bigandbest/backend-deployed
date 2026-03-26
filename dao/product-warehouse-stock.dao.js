import prisma from '../config/prisma.js';

const toStockShape = (inv) => inv ? ({
    ...inv,
    stock_quantity: inv.stock_qty,
    reserved_quantity: inv.reserved_qty,
}) : null;

class ProductWarehouseStockDAO {
    async getByProductAndWarehouse(productId, warehouseId) {
        const inv = await prisma.inventory.findFirst({
            where: { product_variants: { product_id: productId }, warehouse_id: parseInt(warehouseId) },
            include: { warehouses: true }
        });
        return toStockShape(inv);
    }

    async getByVariantAndWarehouse(variantId, warehouseId) {
        const inv = await prisma.inventory.findFirst({
            where: { variant_id: variantId, warehouse_id: parseInt(warehouseId) },
            include: { warehouses: true }
        });
        return toStockShape(inv);
    }

    async getByProductAndWarehouseWithDetails(productId, warehouseId) {
        return this.getByProductAndWarehouse(productId, warehouseId);
    }

    async listByProduct(productId) {
        const items = await prisma.inventory.findMany({
            where: { product_variants: { product_id: productId } },
            include: { warehouses: true, variant: true }
        });
        return items.map(toStockShape);
    }

    async listByVariant(variantId) {
        const items = await prisma.inventory.findMany({
            where: { variant_id: variantId },
            include: { warehouses: true }
        });
        return items.map(toStockShape);
    }

    async listByProducts(productIds) {
        const items = await prisma.inventory.findMany({
            where: { product_variants: { product_id: { in: productIds } } },
            include: {
                warehouses: { select: { id: true, name: true, type: true } },
                product_variants: { select: { id: true, title: true, sku: true } }
            }
        });
        return items.map(toStockShape);
    }

    async listByWarehouses(warehouseIds) {
        const items = await prisma.inventory.findMany({
            where: { warehouse_id: { in: warehouseIds.map(Number) } },
            include: {
                product_variants: { include: { products: { select: { id: true, name: true } } } },
                warehouses: { select: { id: true, name: true, type: true, parent_warehouse_id: true } }
            }
        });
        return items.map(toStockShape);
    }

    async listProductsInWarehouse(warehouseId) {
        const items = await prisma.inventory.findMany({
            where: { warehouse_id: parseInt(warehouseId) },
            include: {
                product_variants: {
                    include: {
                        product: {
                            select: {
                                id: true, name: true, rating: true,
                                category: { select: { id: true, name: true } },
                                media: { where: { is_primary: true }, take: 1, select: { url: true } }
                            }
                        }
                    }
                }
            }
        });
        return items.map(toStockShape);
    }

    async upsertStock(productId, warehouseId, stockData) {
        const variant = await prisma.product_variants.findFirst({
            where: { product_id: productId, is_default: true }
        }) ?? await prisma.product_variants.findFirst({ where: { product_id: productId } });
        if (!variant) return null;
        return this.upsertVariantStock(productId, variant.id, warehouseId, stockData);
    }

    async upsertVariantStock(productId, variantId, warehouseId, stockData) {
        const existing = await prisma.inventory.findFirst({
            where: { variant_id: variantId, warehouse_id: parseInt(warehouseId) }
        });
        const data = {
            stock_qty: stockData.stock_quantity ?? stockData.stock_qty ?? 0,
            reserved_qty: stockData.reserved_quantity ?? stockData.reserved_qty ?? 0,
            warehouse_id: parseInt(warehouseId),
            updated_at: new Date()
        };
        const result = existing
            ? await prisma.inventory.update({ where: { id: existing.id }, data })
            : await prisma.inventory.create({ data: { ...data, variant_id: variantId } });
        return toStockShape(result);
    }

    async createMany(records) {
        const data = records.map(r => ({
            variant_id: r.variant_id,
            warehouse_id: parseInt(r.warehouse_id),
            stock_qty: r.stock_quantity ?? 0,
            reserved_qty: r.reserved_quantity ?? 0
        }));
        return prisma.inventory.createMany({ data, skipDuplicates: true });
    }

    async updateStock(id, data) {
        const result = await prisma.inventory.update({
            where: { id },
            data: {
                stock_qty: data.stock_quantity ?? data.stock_qty,
                reserved_qty: data.reserved_quantity ?? data.reserved_qty
            }
        });
        return toStockShape(result);
    }
}

export default new ProductWarehouseStockDAO();
