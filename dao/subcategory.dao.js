import prisma from '../config/prisma.js';

class SubcategoryDAO {
    async create(data) {
        return await prisma.subcategories.create({ data });
    }

    async getById(id) {
        const sub = await prisma.subcategories.findUnique({
            where: { id },
            include: {
                categories: true,
                _count: {
                    select: { products: true, groups: true }
                }
            }
        });
        if (sub) {
            sub.category = sub.categories;
        }
        return sub;
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
        const subs = await prisma.subcategories.findMany({
            where: { featured: true, active: true },
            include: { categories: true },
            orderBy: { sort_order: 'asc' }
        });
        return subs.map(sub => ({ ...sub, category: sub.categories }));
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
