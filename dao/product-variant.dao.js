import prisma from '../config/prisma.js';

class ProductVariantDAO {
    async create(data) {
        return await prisma.product_variants.create({ data });
    }

    async getById(id) {
        return await prisma.product_variants.findUnique({
            where: { id },
            include: {
                product: true,
                variant_attributes: true,
                inventory: true
            }
        });
    }

    async getBySku(sku) {
        return await prisma.product_variants.findUnique({
            where: { sku },
            include: { product: true }
        });
    }

    async listByProduct(productId, activeOnly = true) {
        return await prisma.product_variants.findMany({
            where: {
                product_id: productId,
                ...(activeOnly && { active: true })
            },
            include: {
                variant_attributes: true,
                inventory: true,
                seller_products: {
                    where: { status: 'APPROVED', is_active: true },
                    select: { stock_quantity: true, reserved_quantity: true }
                }
            },
            orderBy: { price: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.product_variants.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.product_variants.delete({
            where: { id }
        });
    }
}

export default new ProductVariantDAO();
