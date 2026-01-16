import prisma from '../utils/prisma.js';

class QuickPickGroupDAO {
    async create(data) {
        return await prisma.quick_pick_group.create({ data });
    }

    async getById(id) {
        return await prisma.quick_pick_group.findUnique({
            where: { id },
            include: {
                quick_pick: true,
                products: {
                    include: { product: true }
                }
            }
        });
    }

    async listByQuickPick(quickPickId) {
        return await prisma.quick_pick_group.findMany({
            where: { quick_pick_id: quickPickId },
            include: {
                _count: {
                    select: { products: true }
                }
            }
        });
    }

    async update(id, data) {
        return await prisma.quick_pick_group.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return await prisma.quick_pick_group.delete({
            where: { id }
        });
    }
}

export default new QuickPickGroupDAO();
