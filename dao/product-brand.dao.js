import prisma from '../config/prisma.js';

class ProductBrandDAO {
    async link(productId, brandId) {
        return await prisma.product_brand.upsert({
            where: {
                product_id_brand_id: {
                    product_id: productId,
                    brand_id: brandId
                }
            },
            update: {},
            create: {
                product_id: productId,
                brand_id: brandId
            }
        });
    }

    async unlink(productId, brandId) {
        return await prisma.product_brand.delete({
            where: {
                product_id_brand_id: {
                    product_id: productId,
                    brand_id: brandId
                }
            }
        });
    }

    async listBrandsByProduct(productId) {
        return await prisma.product_brand.findMany({
            where: { product_id: productId },
            include: { brand: true }
        });
    }

    async listProductsByBrand(brandId) {
        return await prisma.product_brand.findMany({
            where: { brand_id: brandId },
            include: { product: true }
        });
    }
}

export default new ProductBrandDAO();
