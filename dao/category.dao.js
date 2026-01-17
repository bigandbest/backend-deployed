import prisma from '../config/prisma.js';

class CategoryDAO {
    // --- Category Operations ---
    async createCategory(data) {
        return await prisma.categories.create({
            data
        });
    }

    async getCategoryById(id) {
        return await prisma.categories.findUnique({
            where: { id },
            include: {
                subcategories: {
                    where: { active: true },
                    orderBy: { sort_order: 'asc' }
                }
            }
        });
    }

    async updateCategory(id, data) {
        return await prisma.categories.update({
            where: { id },
            data
        });
    }

    async deleteCategory(id) {
        return await prisma.categories.delete({
            where: { id }
        });
    }

    async listCategories(activeOnly = true) {
        return await prisma.categories.findMany({
            where: activeOnly ? { active: true } : {},
            include: {
                _count: {
                    select: { products: true }
                }
            },
            orderBy: { name: 'asc' }
        });
    }

    // --- Subcategory Operations ---
    async createSubcategory(data) {
        return await prisma.subcategories.create({
            data
        });
    }

    async getSubcategoryById(id) {
        return await prisma.subcategories.findUnique({
            where: { id },
            include: {
                category: true,
                groups: {
                    where: { active: true },
                    orderBy: { sort_order: 'asc' }
                }
            }
        });
    }

    async getSubcategoriesByCategoryId(categoryId) {
        return await prisma.subcategories.findMany({
            where: { category_id: categoryId },
            orderBy: { sort_order: 'asc' }
        });
    }

    async updateSubcategory(id, data) {
        return await prisma.subcategories.update({
            where: { id },
            data
        });
    }

    async deleteSubcategory(id) {
        return await prisma.subcategories.delete({
            where: { id }
        });
    }

    // --- Group Operations ---
    async createGroup(data) {
        return await prisma.groups.create({
            data
        });
    }

    async getGroupsBySubcategoryId(subcategoryId) {
        return await prisma.groups.findMany({
            where: { subcategory_id: subcategoryId },
            orderBy: { sort_order: 'asc' }
        });
    }

    async updateGroup(id, data) {
        return await prisma.groups.update({
            where: { id },
            data
        });
    }

    async deleteGroup(id) {
        return await prisma.groups.delete({
            where: { id }
        });
    }

    // --- Advanced Taxonomy Operations ---
    async getFullHierarchy() {
        return await prisma.categories.findMany({
            where: { active: true },
            include: {
                subcategories: {
                    where: { active: true },
                    orderBy: { sort_order: 'asc' },
                    include: {
                        groups: {
                            where: { active: true },
                            orderBy: { sort_order: 'asc' }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });
    }

    async getFeaturedItems() {
        const [featuredCategories, featuredSubcategories] = await Promise.all([
            prisma.categories.findMany({
                where: { active: true, featured: true },
                orderBy: { name: 'asc' }
            }),
            prisma.subcategories.findMany({
                where: { active: true, featured: true },
                include: { category: { select: { name: true } } },
                orderBy: { name: 'asc' }
            })
        ]);

        return { categories: featuredCategories, subcategories: featuredSubcategories };
    }

    async getCategoryStats() {
        const categories = await prisma.categories.findMany({
            select: {
                id: true,
                name: true,
                _count: {
                    select: { products: true }
                }
            }
        });

        return categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            productCount: cat._count.products
        }));
    }
}

export default new CategoryDAO();
