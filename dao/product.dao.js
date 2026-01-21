import prisma from '../config/prisma.js';

class ProductDAO {
    // --- Product Operations ---
    async createProduct(data) {
        return await prisma.products.create({
            data,
            include: {
                variants: {
                    include: {
                        inventory: true,
                        attributes: true
                    }
                },
                media: true,
                brands: { include: { brand: true } }
            }
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
                media: true,
                reviews: {
                    take: 5,
                    orderBy: { created_at: 'desc' }
                },
                product_recommended_store: true // Include for Store ID mapping
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

    async updateProductMedia(productId, mediaItems) {
        return await prisma.$transaction(async (tx) => {
            // 1. Delete existing media for this product
            await tx.product_media.deleteMany({
                where: { product_id: productId }
            });

            // 2. Create new media entries
            if (mediaItems && mediaItems.length > 0) {
                await tx.product_media.createMany({
                    data: mediaItems.map((item, index) => ({
                        product_id: productId,
                        media_type: item.media_type || 'image',
                        url: item.url,
                        is_primary: item.is_primary || (index === 0),
                        sort_order: item.sort_order !== undefined ? item.sort_order : index
                    }))
                });
            }
            return true;
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

    async getRelatedProducts(productIds, limit = 10) {
        if (!Array.isArray(productIds)) productIds = [productIds];

        const products = await prisma.products.findMany({
            where: { id: { in: productIds } },
            select: { category_id: true, subcategory_id: true }
        });

        if (products.length === 0) return [];

        const categoryIds = [...new Set(products.map(p => p.category_id).filter(Boolean))];
        const subcategoryIds = [...new Set(products.map(p => p.subcategory_id).filter(Boolean))];

        return await prisma.products.findMany({
            where: {
                id: { notIn: productIds },
                active: true,
                OR: [
                    { category_id: { in: categoryIds } },
                    { subcategory_id: { in: subcategoryIds } }
                ]
            },
            take: limit,
            include: {
                variants: { where: { active: true, is_default: true }, take: 1 }
            },
            orderBy: { rating: 'desc' }
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
                // 1. Identification: Determine which variants to keep/update and which to delete
                const incomingIds = variantsData
                    .filter(v => v.id)
                    .map(v => v.id);

                // Delete variants NOT in the incoming list (if list is provided)
                // Note: Only if we are doing a full update (implied by non-empty list or explicit empty list)
                // If variantsData is empty array, it means delete all? Or just no updates? 
                // Usually empty array = delete all for strict Put.
                await tx.product_variants.deleteMany({
                    where: {
                        product_id: id,
                        id: { notIn: incomingIds }
                    }
                });

                for (const variant of variantsData) {
                    if (variant.id) {
                        // Update existing variant
                        const { product_id, inventory, attributes, ...variantUpdateData } = variant;

                        await tx.product_variants.update({
                            where: { id: variant.id },
                            data: variantUpdateData
                        });

                        // Handle attributes separately if provided
                        if (attributes && Array.isArray(attributes)) {
                            // Delete existing attributes
                            await tx.variant_attributes.deleteMany({
                                where: { variant_id: variant.id }
                            });

                            // Create new attributes
                            if (attributes.length > 0) {
                                await tx.variant_attributes.createMany({
                                    data: attributes.map(attr => ({
                                        variant_id: variant.id,
                                        attribute_name: attr.attribute_name,
                                        attribute_value: attr.attribute_value
                                    }))
                                });
                            }
                        }

                        // Handle inventory separately if provided
                        if (inventory) {
                            const existingInventory = await tx.inventory.findUnique({
                                where: { variant_id: variant.id }
                            });

                            if (existingInventory) {
                                await tx.inventory.update({
                                    where: { variant_id: variant.id },
                                    data: inventory
                                });
                            } else {
                                await tx.inventory.create({
                                    data: {
                                        variant_id: variant.id,
                                        ...inventory
                                    }
                                });
                            }
                        }
                    } else {
                        // Create new variant
                        const { attributes, inventory, ...variantCreateData } = variant;

                        const newVariant = await tx.product_variants.create({
                            data: {
                                ...variantCreateData,
                                product_id: id
                            }
                        });

                        // Create attributes for new variant
                        if (attributes && Array.isArray(attributes) && attributes.length > 0) {
                            await tx.variant_attributes.createMany({
                                data: attributes.map(attr => ({
                                    variant_id: newVariant.id,
                                    attribute_name: attr.attribute_name,
                                    attribute_value: attr.attribute_value
                                }))
                            });
                        }

                        // Create inventory for new variant
                        if (inventory) {
                            await tx.inventory.create({
                                data: {
                                    variant_id: newVariant.id,
                                    ...inventory
                                }
                            });
                        }
                    }
                }
            }

            return updatedProduct;
        });
    }

    async getFeaturedProducts(limit = 20) {
        return await prisma.products.findMany({
            where: {
                active: true,
                featured: true
            },
            take: limit,
            include: {
                category: true,
                variants: { where: { active: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async getEverydayEssentials(limit = 20) {
        return await prisma.products.findMany({
            where: {
                active: true
            },
            take: limit,
            include: {
                category: true,
                variants: { where: { active: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async getTopProducts(limit = 20) {
        return await prisma.products.findMany({
            where: {
                active: true,
                top_sale: true
            },
            take: limit,
            include: {
                category: true,
                variants: { where: { active: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    async getProductsByCategoryName(categoryName) {
        return await prisma.products.findMany({
            where: {
                active: true,
                OR: [
                    { category: { name: categoryName } },
                    { category_name: categoryName }
                ]
            },
            include: {
                variants: { where: { active: true } }
            }
        });
    }

    async getProductsByIds(ids) {
        return await prisma.products.findMany({
            where: {
                id: { in: ids },
                active: true
            },
            include: {
                variants: { where: { active: true } }
            }
        });
    }

    async getProductsByNames(names) {
        return await prisma.products.findMany({
            where: {
                name: { in: names }
            },
            select: { id: true, name: true }
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

    // --- Variant Attributes Operations ---
    async createVariantAttribute(variantId, attributeData) {
        return await prisma.variant_attributes.create({
            data: {
                variant_id: variantId,
                ...attributeData
            }
        });
    }

    async updateVariantAttribute(id, attributeData) {
        return await prisma.variant_attributes.update({
            where: { id },
            data: attributeData
        });
    }

    async deleteVariantAttribute(id) {
        return await prisma.variant_attributes.delete({
            where: { id }
        });
    }

    async getAttributesByVariantId(variantId) {
        return await prisma.variant_attributes.findMany({
            where: { variant_id: variantId }
        });
    }

    async bulkUpdateVariantAttributes(variantId, attributes) {
        return await prisma.$transaction(async (tx) => {
            // Delete existing attributes
            await tx.variant_attributes.deleteMany({
                where: { variant_id: variantId }
            });

            // Create new attributes
            if (attributes && attributes.length > 0) {
                await tx.variant_attributes.createMany({
                    data: attributes.map(attr => ({
                        variant_id: variantId,
                        attribute_name: attr.attribute_name,
                        attribute_value: attr.attribute_value
                    }))
                });
            }

            return await tx.variant_attributes.findMany({
                where: { variant_id: variantId }
            });
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