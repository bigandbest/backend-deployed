import prisma from '../config/prisma.js';

class ProductSectionDAO {
    async create(data) {
        return await prisma.product_sections.create({ data });
    }

    async getById(id) {
        // Guard: product_sections.id is INT4 (max 2,147,483,647).
        // If the frontend accidentally sends a timestamp as the id, return null
        // so the caller gets a clean 404 instead of a Prisma INT4 overflow crash.
        if (id > 2147483647) return null;
        return await prisma.product_sections.findUnique({
            where: { id },
            include: {
                section_products: {
                    include: { product: true },
                    orderBy: { display_order: 'asc' }
                },
                section_subcategory_mappings: {
                    include: { subcategory: true },
                    orderBy: { display_order: 'asc' }
                }
            }
        });
    }

    async getByKey(key) {
        return await prisma.product_sections.findUnique({
            where: { section_key: key },
            include: {
                section_products: {
                    include: { product: true },
                    orderBy: { display_order: 'asc' }
                }
            }
        });
    }

    async list(filters = {}) {
        const { active, allow_group_mapping } = filters;
        return await prisma.product_sections.findMany({
            where: {
                ...(active !== undefined && { is_active: active }),
                ...(allow_group_mapping !== undefined && { allow_group_mapping: allow_group_mapping })
            },
            orderBy: { display_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.product_sections.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.product_sections.delete({
            where: { id }
        });
    }

    async getSectionCounts() {
        // Get product counts
        const productCounts = await prisma.product_section_products.groupBy({
            by: ['section_id'],
            _count: {
                id: true
            }
        });

        // Get category counts
        const categoryCounts = await prisma.$queryRaw`
            SELECT section_id, COUNT(*)::int as count
            FROM product_section_categories
            GROUP BY section_id
        `;

        return {
            products: productCounts.reduce((acc, pc) => {
                acc[pc.section_id] = pc._count.id;
                return acc;
            }, {}),
            categories: categoryCounts.reduce((acc, cc) => {
                acc[cc.section_id] = cc.count;
                return acc;
            }, {})
        };
    }
}

export default new ProductSectionDAO();
