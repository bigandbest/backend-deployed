import prisma from '../config/prisma.js';

class YouMayLikeDAO {
    async create(productId) {
        return await prisma.you_may_like.create({
            data: { product_id: productId }
        });
    }

    async list() {
        return await prisma.you_may_like.findMany({
            include: { product: true }
        });
    }

    async delete(id) {
        return await prisma.you_may_like.delete({
            where: { id }
        });
    }

    async deleteAll() {
        return await prisma.you_may_like.deleteMany({});
    }
}

export default new YouMayLikeDAO();
