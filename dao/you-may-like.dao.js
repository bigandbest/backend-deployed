import prisma from '../config/prisma.js';

class YouMayLikeDAO {
    async create(productId) {
        return await prisma.you_may_like.create({
            data: { product_id: productId }
        });
    }

    async list() {
        return await prisma.you_may_like.findMany({
            include: { products: true }
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

    async getAll() {
        return await prisma.you_may_like.findMany({
            include: { products: true }
        });
    }

    async getById(id) {
        return await prisma.you_may_like.findUnique({
            where: { id },
            include: { products: true }
        });
    }

    async check(productId) {
        const entry = await prisma.you_may_like.findFirst({
            where: { product_id: productId }
        });
        return !!entry;
    }

    async add(productId) {
        return await prisma.you_may_like.create({
            data: { product_id: productId }
        });
    }

    async remove(productId) {
        return await prisma.you_may_like.deleteMany({
            where: { product_id: productId }
        });
    }

    async bulkAdd(productIds) {
        return await prisma.you_may_like.createMany({
            data: productIds.map((product_id) => ({ product_id })),
            skipDuplicates: true,
        });
    }
}

export default new YouMayLikeDAO();
