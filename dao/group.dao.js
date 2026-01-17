import prisma from '../config/prisma.js';

class GroupDAO {
    async create(data) {
        return await prisma.groups.create({ data });
    }

    async getById(id) {
        return await prisma.groups.findUnique({
            where: { id },
            include: {
                subcategory: true,
                _count: {
                    select: { products: true }
                }
            }
        });
    }

    async listBySubcategory(subcategoryId, activeOnly = true) {
        return await prisma.groups.findMany({
            where: {
                subcategory_id: subcategoryId,
                ...(activeOnly && { active: true })
            },
            orderBy: { sort_order: 'asc' }
        });
    }

    async update(id, data) {
        return await prisma.groups.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async delete(id) {
        return await prisma.groups.delete({
            where: { id }
        });
    }
}

export default new GroupDAO();
