import prisma from '../utils/prisma.js';

class ProductSectionDAO {
    async create(data) {
        return await prisma.product_sections.create({ data });
    }

    async getById(id) {
        return await prisma.product_sections.findUnique({
            where: { id },
            include: {
                section_products: {
                    include: { product: true },
                    orderBy: { display_order: 'asc' }
                },
                subcategory_mappings: {
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
        const { active = true } = filters;
        return await prisma.product_sections.findMany({
            where: {
                ...(active !== undefined && { is_active: active })
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
}

export default new ProductSectionDAO();
