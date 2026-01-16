import prisma from '../utils/prisma.js';

class ProductRecommendedStoreDAO {
    async link(productId, storeId) {
        return await prisma.product_recommended_store.upsert({
            where: {
                product_id_recommended_store_id: {
                    product_id: productId,
                    recommended_store_id: storeId
                }
            },
            update: {},
            create: {
                product_id: productId,
                recommended_store_id: storeId
            }
        });
    }

    async unlink(productId, storeId) {
        return await prisma.product_recommended_store.delete({
            where: {
                product_id_recommended_store_id: {
                    product_id: productId,
                    recommended_store_id: storeId
                }
            }
        });
    }

    async listStoresByProduct(productId) {
        return await prisma.product_recommended_store.findMany({
            where: { product_id: productId },
            include: { recommended_store: true }
        });
    }
}

export default new ProductRecommendedStoreDAO();
