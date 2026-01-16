import prisma from '../utils/prisma.js';

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

    async listProductsByGroup(groupId) {
        return await prisma.quickpick_group_product.findMany({
            where: { quick_pick_group_id: groupId },
            include: { product: true }
        });
    }
}

export default new QuickPickGroupProductDAO();
