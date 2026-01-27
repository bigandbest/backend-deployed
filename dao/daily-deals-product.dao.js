import prisma from '../config/prisma.js';

class DailyDealsProductDAO {
    async mapProduct(daily_deal_id, product_id) {
        return await prisma.daily_deals_product.upsert({
            where: {
                daily_deal_id_product_id: {
                    daily_deal_id,
                    product_id
                }
            },
            update: {},
            create: {
                daily_deal_id,
                product_id
            }
        });
    }

    async removeProduct(daily_deal_id, product_id) {
        return await prisma.daily_deals_product.delete({
            where: {
                daily_deal_id_product_id: {
                    daily_deal_id,
                    product_id
                }
            }
        });
    }

    async getProductsByDealId(daily_deal_id) {
        return await prisma.daily_deals_product.findMany({
            where: { daily_deal_id },
            include: {
                product: {
                    include: {
                        variants: {
                            where: { active: true }
                        }
                    }
                }
            }
        });
    }

    async getDealsByProductId(product_id) {
        return await prisma.daily_deals_product.findMany({
            where: { product_id },
            include: {
                daily_deal: true
            }
        });
    }

    async bulkMap(daily_deal_id, product_ids) {
        const data = product_ids.map(product_id => ({
            daily_deal_id,
            product_id
        }));

        return await prisma.daily_deals_product.createMany({
            data,
            skipDuplicates: true
        });
    }
}

export default new DailyDealsProductDAO();
