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

    // Valid since @@unique([section_id, product_id]) exists (migration 20260923100000); one transaction, all-or-nothing.
    // Controllers use PinService (services/homepage/PinService.js); this stays for scripts/legacy callers.
    async upsertMany(assignments) {
        return await prisma.$transaction(
            assignments.map(({ section_id, product_id, display_order }) =>
                prisma.product_section_products.upsert({
                    where: { section_id_product_id: { section_id, product_id } },
                    update: { display_order },
                    create: { section_id, product_id, display_order },
                }),
            ),
        );
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
                    variants: { some: { active: true } },
                    ...(categoryIds && categoryIds.length > 0
                        ? { category_id: { in: categoryIds } }
                        : {})
                }
            },
            include: {
                product: {
                    include: {
                        variants: {
                            where: { active: true },
                            include: {
                                inventory: { select: { stock_qty: true, reserved_qty: true } },
                                seller_products: {
                                    where: { status: 'APPROVED', is_active: true },
                                    select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true },
                                },
                            },
                        },
                        media: { where: { is_primary: true }, take: 1, select: { url: true } },
                        brands: { select: { brand: { select: { name: true } } }, take: 1 },
                        category: { select: { id: true, name: true } },
                    },
                },
            },
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
                    variants: { some: { active: true } },
                    ...(categoryIds && categoryIds.length > 0
                        ? { category_id: { in: categoryIds } }
                        : {})
                }
            },
        });
    }
}

export default new ProductSectionProductDAO();
