import prisma from '../utils/prisma.js';

class ProductSectionProductDAO {
    async link(sectionId, productId, displayOrder = 0) {
        return await prisma.product_section_products.create({
            data: {
                section_id: sectionId,
                product_id: productId,
                display_order: displayOrder
            }
        });
    }

    async unlink(id) {
        return await prisma.product_section_products.delete({
            where: { id }
        });
    }

    async listBySection(sectionId) {
        return await prisma.product_section_products.findMany({
            where: { section_id: sectionId },
            include: { product: true },
            orderBy: { display_order: 'asc' }
        });
    }

    async updateOrder(id, displayOrder) {
        return await prisma.product_section_products.update({
            where: { id },
            data: { display_order: displayOrder }
        });
    }
}

export default new ProductSectionProductDAO();
