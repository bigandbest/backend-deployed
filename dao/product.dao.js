import prisma from '../utils/prisma.js';

class ProductDAO {
    // --- Product Operations ---
    async createProduct(data) {
        return await prisma.products.create({
            data
        });
    }

    async getProductById(id) {
        return await prisma.products.findUnique({
            where: { id },
            include: {
                variants: {
                    include: {
                        inventory: true,
                        attributes: true
                    }
                },
                category: true,
                subcategory: true,
                group: true,
                brands: {
                    include: {
                        brand: true
                    }
                },
                reviews: {
                    take: 5,
                    orderBy: { created_at: 'desc' }
                }
            }
        });
    }

    async updateProduct(id, data) {
        return await prisma.products.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date()
            }
        });
    }

    async deleteProduct(id) {
        return await prisma.products.delete({
            where: { id }
        });
    }

    async listProducts(filters = {}, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const where = {
            ...filters,
            active: filters.active !== undefined ? filters.active : true
        };

        const [items, total] = await Promise.all([
            prisma.products.findMany({
                where,
                skip,
                take: limit,
                include: {
                    variants: {
                        where: { is_default: true, active: true },
                        take: 1
                    },
                    category: { select: { name: true } }
                },
                orderBy: { created_at: 'desc' }
            }),
            prisma.products.count({ where })
        ]);

        return { items, total, page, limit };
    }

    // --- Advanced Product Operations ---
    async searchProducts(query, filters = {}, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const searchCondition = query ? {
            OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } }
            ]
        } : {};

        const where = {
            ...filters,
            ...searchCondition,
            active: true
        };

        const [items, total] = await Promise.all([
            prisma.products.findMany({
                where,
                skip,
                take: limit,
                include: {
                    variants: {
                        where: { is_default: true },
                        take: 1
                    }
                }
            }),
            prisma.products.count({ where })
        ]);

        return { items, total, page, limit };
    }

    async getRelatedProducts(productId, limit = 4) {
        const product = await prisma.products.findUnique({
            where: { id: productId },
            select: { category_id: true, subcategory_id: true }
        });

        if (!product) return [];

        return await prisma.products.findMany({
            where: {
                id: { not: productId },
                active: true,
                OR: [
                    { subcategory_id: product.subcategory_id },
                    { category_id: product.category_id }
                ]
            },
            take: limit,
            include: {
                variants: { where: { is_default: true }, take: 1 }
            },
            orderBy: [
                { rating: 'desc' },
                { created_at: 'desc' }
            ]
        });
    }

    async toggleProductStatus(id) {
        const product = await prisma.products.findUnique({
            where: { id },
            select: { active: true }
        });

        if (!product) throw new Error('Product not found');

        return await prisma.products.update({
            where: { id },
            data: { active: !product.active }
        });
    }

    async updateProductWithVariants(id, productData, variantsData) {
        return await prisma.$transaction(async (tx) => {
            // Update product
            const updatedProduct = await tx.products.update({
                where: { id },
                data: {
                    ...productData,
                    updated_at: new Date()
                }
            });

            // Update variants if provided
            if (variantsData && Array.isArray(variantsData)) {
                for (const variant of variantsData) {
                    if (variant.id) {
                        await tx.product_variants.update({
                            where: { id: variant.id },
                            data: variant
                        });
                    } else {
                        await tx.product_variants.create({
                            data: { ...variant, product_id: id }
                        });
                    }
                }
            }

            return updatedProduct;
        });
    }

    async getProductsByFilter(filters) {
        const { minPrice, maxPrice, rating, brandIds, categoryId, subcategoryId, vertical } = filters;

        const where = {
            active: true,
            vertical,
            category_id: categoryId,
            subcategory_id: subcategoryId,
            rating: rating ? { gte: rating } : undefined,
            brands: brandIds ? { some: { brand_id: { in: brandIds } } } : undefined,
            variants: (minPrice !== undefined || maxPrice !== undefined) ? {
                some: {
                    price: {
                        gte: minPrice,
                        lte: maxPrice
                    },
                    active: true
                }
            } : undefined
        };

        return await prisma.products.findMany({
            where,
            include: {
                variants: { where: { active: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // --- Variant Operations ---
    async createVariant(data) {
        return await prisma.product_variants.create({
            data
        });
    }

    async updateVariant(id, data) {
        return await prisma.product_variants.update({
            where: { id },
            data
        });
    }

    async deleteVariant(id) {
        return await prisma.product_variants.delete({
            where: { id }
        });
    }

    async getVariantsByProductId(productId) {
        return await prisma.product_variants.findMany({
            where: { product_id: productId },
            include: {
                inventory: true,
                attributes: true
            }
        });
    }

    // --- Brand Relationships ---
    async addBrandToProduct(productId, brandId) {
        return await prisma.product_brand.create({
            data: {
                product_id: productId,
                brand_id: brandId
            }
        });
    }

    async removeBrandFromProduct(productId, brandId) {
        return await prisma.product_brand.delete({
            where: {
                product_id_brand_id: {
                    product_id: productId,
                    brand_id: brandId
                }
            }
        });
    }

    // --- Recommended Store Relationships ---
    async addRecommendedStore(productId, storeId) {
        return await prisma.product_recommended_store.create({
            data: {
                product_id: productId,
                recommended_store_id: storeId
            }
        });
    }

    async removeRecommendedStore(productId, storeId) {
        return await prisma.product_recommended_store.delete({
            where: {
                product_id_recommended_store_id: {
                    product_id: productId,
                    recommended_store_id: storeId
                }
            }
        });
    }
}

export default new ProductDAO();
