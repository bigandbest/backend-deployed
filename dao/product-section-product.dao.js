import prisma from '../config/prisma.js';

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

    async upsertMany(assignments) {
        // Handle multiple assignments with upsert
        const results = [];
        for (const assignment of assignments) {
            const { section_id, product_id, display_order } = assignment;
            const result = await prisma.product_section_products.upsert({
                where: {
                    section_id_product_id: {
                        section_id,
                        product_id
                    }
                },
                update: { display_order },
                create: { section_id, product_id, display_order }
            });
            results.push(result);
        }
        return results;
    }

    async deleteBySectionAndProduct(sectionId, productId) {
        return await prisma.product_section_products.deleteMany({
            where: {
                section_id: sectionId,
                product_id: productId
            }
        });
    }

    async listByProduct(productId) {
        return await prisma.product_section_products.findMany({
            where: { product_id: productId },
            include: {
                product_sections: true
            },
            orderBy: { display_order: 'asc' }
        });
    }

    async getMaxOrder(sectionId) {
        const result = await prisma.product_section_products.findFirst({
            where: { section_id: sectionId },
            orderBy: { display_order: 'desc' },
            select: { display_order: true }
        });
        return result ? result.display_order : -1;
    }

    async deleteBySection(sectionId) {
        return await prisma.product_section_products.deleteMany({
            where: { section_id: Number(sectionId) }
        });
    }

    async listBySection(sectionId, { offset = 0, limit = 50, categoryIds = null } = {}) {
        return await prisma.product_section_products.findMany({
            where: {
                section_id: sectionId,
                product: {
                    active: true,
                    ...(categoryIds && categoryIds.length > 0
                        ? { category_id: { in: categoryIds } }
                        : {})
                }
            },
            include: { product: true },
            orderBy: { display_order: 'asc' },
            skip: offset,
            take: limit,
        });
    }

    async countBySection(sectionId, { categoryIds = null } = {}) {
        return await prisma.product_section_products.count({
            where: {
                section_id: sectionId,
                product: {
                    active: true,
                    ...(categoryIds && categoryIds.length > 0
                        ? { category_id: { in: categoryIds } }
                        : {})
                }
            },
        });
    }
}

export default new ProductSectionProductDAO();
