import prisma from '../config/prisma.js';

class SubcategoryDAO {
    async create(data) {
        return await prisma.subcategories.create({ data });
    }

    async getById(id) {
        return await prisma.subcategories.findUnique({
            where: { id },
            include: {
                category: true,
                _count: {
                    select: { products: true, groups: true }
                }
            }
        });
    }

    async listByCategory(categoryId, activeOnly = true) {
        return await prisma.subcategories.findMany({
            where: {
                category_id: categoryId,
                ...(activeOnly && { active: true })
            },
            orderBy: { sort_order: 'asc' }
        });
    }

    async listFeatured() {
        return await prisma.subcategories.findMany({
            where: { featured: true, active: true },
            include: { category: true },
            orderBy: { sort_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.subcategories.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.subcategories.delete({
            where: { id }
        });
    }
}

export default new SubcategoryDAO();
