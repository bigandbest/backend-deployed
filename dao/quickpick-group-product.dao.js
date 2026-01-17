import prisma from '../config/prisma.js';

class QuickPickGroupProductDAO {
    async link(groupId, productId) {
        return await prisma.quickpick_group_product.create({
            data: {
                quick_pick_group_id: groupId,
                product_id: productId
            }
        });
    }

    async unlink(id) {
        return await prisma.quickpick_group_product.delete({
            where: { id }
        });
    }

    async deleteByMapping(productId, groupId) {
        return await prisma.quickpick_group_product.deleteMany({
            where: {
                product_id: productId,
                quick_pick_group_id: groupId
            }
        });
    }

    async listGroupsByProduct(productId) {
        return await prisma.quickpick_group_product.findMany({
            where: { product_id: productId },
            include: { quick_pick_group: true }
        });
    }

    async createMany(records) {
        return await prisma.quickpick_group_product.createMany({
            data: records
        });
    }

    async listProductsByGroup(groupId) {
        return await prisma.quickpick_group_product.findMany({
            where: { quick_pick_group_id: groupId },
            include: { product: true }
        });
    }
}

export default new QuickPickGroupProductDAO();
