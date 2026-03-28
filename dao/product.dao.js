import prisma from "../config/prisma.js";

class ProductDAO {
    // --- Product Operations ---
    async createProduct(data) {
        return await prisma.products.create({
            data,
            include: {
                variants: {
                    include: {
                        inventory: true,
                        variant_attributes: true,
                    },
                },
                media: true,
                brands: { include: { brand: true } },
            },
        });
    }

    async getProductById(id) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof id !== 'string' || !uuidRegex.test(id)) {
            return null;
        }
        return await prisma.products.findUnique({
            where: { id },
            include: {
                variants: {
                    include: {
                        inventory: true,
                        variant_attributes: true,
                        seller_products: {
                            where: { status: 'APPROVED', is_active: true },
                            select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true }
                        }
                    },
                },
                category: true,
                subcategory: true,
                group: true,
                store: true,
                brands: {
                    include: {
                        brand: true,
                    },
                },
                media: true,
                product_reviews: {
                    take: 5,
                    orderBy: { created_at: "desc" },
                },
                product_recommended_store: {
                    include: {
                        recommended_store: true,
                    },
                },
            },
        });
    }

    async updateProduct(id, data) {
        return await prisma.products.update({
            where: { id },
            data: {
                ...data,
                updated_at: new Date(),
            },
        });
    }

    async deleteProduct(id) {
        return await prisma.products.delete({
            where: { id },
        });
    }

    async updateProductMedia(productId, mediaItems) {
        return await prisma.$transaction(async (tx) => {
            // 1. Delete existing media for this product
            await tx.product_media.deleteMany({
                where: { product_id: productId },
            });

            // 2. Create new media entries
            if (mediaItems && mediaItems.length > 0) {
                await tx.product_media.createMany({
                    data: mediaItems.map((item, index) => ({
                        product_id: productId,
                        media_type: item.media_type || "image",
                        url: item.url,
                        is_primary: item.is_primary || index === 0,
                        sort_order: item.sort_order !== undefined ? item.sort_order : index,
                    })),
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
            active: filters.active !== undefined ? filters.active : true,
        };
        // Remove known non-DB filters from 'where' to avoid Prisma errors if strict
        if (where.includeAllVariants !== undefined) delete where.includeAllVariants;

        const variantsSelect = filters.includeAllVariants
            ? {
                include: {
                    inventory: true,
                    variant_attributes: true,
                }
            }
            : {
                where: { active: true },
                include: {
                    inventory: {
                        select: { stock_qty: true, reserved_qty: true, warehouse_id: true },
                    },
                    seller_products: {
                        where: { status: 'APPROVED', is_active: true },
                        select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true },
                    },
                },
            };

        // Optimized query with minimal includes - only fetch what's needed
        const [items, total] = await Promise.all([
            prisma.products.findMany({
                where,
                skip,
                take: limit,
                include: {
                    variants: variantsSelect,
                    category: { select: { id: true, name: true } },
                    subcategory: { select: { id: true, name: true } },
                    group: { select: { id: true, name: true } },
                    store: { select: { id: true, name: true } },
                    brands: {
                        select: { brand: { select: { id: true, name: true } } },
                        take: 1,
                    },
                    product_recommended_store: {
                        select: { recommended_store: { select: { id: true, name: true } } },
                        take: 1,
                    },
                    media: {
                        where: { is_primary: true },
                        take: 1,
                        select: { url: true, media_type: true },
                        orderBy: { sort_order: "asc" },
                    },
                },
                orderBy: { created_at: "desc" },
            }),
            prisma.products.count({ where }),
        ]);

        return { items, total, page, limit };
    }

    // --- Advanced Product Operations ---
    async searchProducts(query, filters = {}, pagination = {}) {
        const { page = 1, limit = 10 } = pagination;
        const skip = (page - 1) * limit;

        const searchCondition = query
            ? {
                OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { description: { contains: query, mode: "insensitive" } },
                ],
            }
            : {};

        const where = {
            ...filters,
            ...searchCondition,
            active: true,
        };

        const [items, total] = await Promise.all([
            prisma.products.findMany({
                where,
                skip,
                take: limit,
                include: {
                    variants: {
                        where: { is_default: true },
                        take: 1,
                    },
                },
            }),
            prisma.products.count({ where }),
        ]);

        return { items, total, page, limit };
    }

    async getRelatedProducts(productIds, limit = 10) {
        if (!Array.isArray(productIds)) productIds = [productIds];

        // Filter out invalid UUIDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        productIds = productIds.filter(id => uuidRegex.test(id));

        if (productIds.length === 0) return [];

        const products = await prisma.products.findMany({
            where: { id: { in: productIds } },
            select: { category_id: true, subcategory_id: true },
        });

        if (products.length === 0) return [];

        const categoryIds = [
            ...new Set(products.map((p) => p.category_id).filter(Boolean)),
        ];
        const subcategoryIds = [
            ...new Set(products.map((p) => p.subcategory_id).filter(Boolean)),
        ];

        return await prisma.products.findMany({
            where: {
                id: { notIn: productIds },
                active: true,
                OR: [
                    { category_id: { in: categoryIds } },
                    { subcategory_id: { in: subcategoryIds } },
                ],
            },
            take: limit,
            include: {
                variants: { where: { active: true }, orderBy: { price: "asc" }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, take: 1 },
            },
            orderBy: { rating: "desc" },
        });
    }

    async toggleProductStatus(id) {
        const product = await prisma.products.findUnique({
            where: { id },
            select: { active: true },
        });

        if (!product) throw new Error("Product not found");

        return await prisma.products.update({
            where: { id },
            data: { active: !product.active },
        });
    }

    async updateProductWithVariants(id, productData, variantsData) {
        return await prisma.$transaction(async (tx) => {
            // Update product
            const updatedProduct = await tx.products.update({
                where: { id },
                data: {
                    ...productData,
                    updated_at: new Date(),
                },
            });

            // Update variants if provided
            if (variantsData && Array.isArray(variantsData)) {
                // 1. Identification: Determine which variants to keep/update and which to delete
                const incomingIds = variantsData.filter((v) => v.id).map((v) => v.id);

                // Delete variants NOT in the incoming list (if list is provided)
                // Note: Only if we are doing a full update (implied by non-empty list or explicit empty list)
                // If variantsData is empty array, it means delete all? Or just no updates?
                // Usually empty array = delete all for strict Put.
                await tx.product_variants.deleteMany({
                    where: {
                        product_id: id,
                        id: { notIn: incomingIds },
                    },
                });

                for (const variant of variantsData) {
                    if (variant.id) {
                        // Update existing variant
                        const { product_id, inventory, attributes, ...variantUpdateData } =
                            variant;

                        await tx.product_variants.update({
                            where: { id: variant.id },
                            data: variantUpdateData,
                        });

                        // Handle attributes separately if provided
                        if (attributes && Array.isArray(attributes)) {
                            // Delete existing attributes
                            await tx.variant_attributes.deleteMany({
                                where: { variant_id: variant.id },
                            });

                            // Create new attributes
                            if (attributes.length > 0) {
                                await tx.variant_attributes.createMany({
                                    data: attributes.map((attr) => ({
                                        variant_id: variant.id,
                                        attribute_name: attr.attribute_name,
                                        attribute_value: attr.attribute_value,
                                        price: attr.price ? parseFloat(attr.price) : null,
                                        old_price: attr.old_price ? parseFloat(attr.old_price) : null,
                                    })),
                                });
                            }
                        }

                        // Handle inventory separately if provided
                        if (inventory) {
                            const { warehouse_id, ...invData } = inventory;
                            const stockQty = invData.stock_qty ?? invData.stock_quantity ?? 0;
                            const reservedQty = invData.reserved_qty ?? invData.reserved_quantity ?? 0;

                            if (warehouse_id) {
                                // Upsert for specific warehouse
                                const existingInv = await tx.inventory.findFirst({
                                    where: { variant_id: variant.id, warehouse_id: parseInt(warehouse_id) },
                                });
                                if (existingInv) {
                                    await tx.inventory.update({
                                        where: { id: existingInv.id },
                                        data: { stock_qty: stockQty, reserved_qty: reservedQty, updated_at: new Date() },
                                    });
                                } else {
                                    await tx.inventory.create({
                                        data: { variant_id: variant.id, warehouse_id: parseInt(warehouse_id), stock_qty: stockQty, reserved_qty: reservedQty, updated_at: new Date() },
                                    });
                                }
                            } else {
                                // No warehouse specified — update all existing rows for this variant
                                const existingRows = await tx.inventory.findMany({
                                    where: { variant_id: variant.id },
                                });
                                if (existingRows.length > 0) {
                                    await tx.inventory.updateMany({
                                        where: { variant_id: variant.id },
                                        data: { stock_qty: stockQty, reserved_qty: reservedQty, updated_at: new Date() },
                                    });
                                } else {
                                    // No warehouse context — skip creation, can't create without warehouse_id
                                    console.warn(`inventory update skipped for variant ${variant.id}: no warehouse_id and no existing rows`);
                                }
                            }
                        }
                    } else {
                        // Create new variant
                        const { attributes, inventory, ...variantCreateData } = variant;

                        const newVariant = await tx.product_variants.create({
                            data: {
                                ...variantCreateData,
                                product_id: id,
                            },
                        });

                        // Create attributes for new variant
                        if (
                            attributes &&
                            Array.isArray(attributes) &&
                            attributes.length > 0
                        ) {
                            await tx.variant_attributes.createMany({
                                data: attributes.map((attr) => ({
                                    variant_id: newVariant.id,
                                    attribute_name: attr.attribute_name,
                                    attribute_value: attr.attribute_value,
                                    price: attr.price ? parseFloat(attr.price) : null,
                                    old_price: attr.old_price ? parseFloat(attr.old_price) : null,
                                })),
                            });
                        }

                        // Create inventory for new variant
                        if (inventory) {
                            await tx.inventory.create({
                                data: {
                                    variant_id: newVariant.id,
                                    ...inventory,
                                    updated_at: inventory.updated_at ?? new Date(),
                                },
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
            },
            take: limit,
            include: {
                category: true,
                variants: { where: { active: true }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, orderBy: { sort_order: "asc" }, take: 1, select: { url: true, media_type: true } },
            },
            orderBy: { created_at: "desc" },
        });
    }

    async getEverydayEssentials(limit = 20) {
        return await prisma.products.findMany({
            where: {
                active: true,
            },
            take: limit,
            include: {
                category: true,
                variants: { where: { active: true }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, orderBy: { sort_order: "asc" }, take: 1, select: { url: true, media_type: true } },
            },
            orderBy: { created_at: "desc" },
        });
    }

    async getTopProducts(limit = 20) {
        return await prisma.products.findMany({
            where: {
                active: true,
                // top_sale field does not exist, using high rating as proxy
            },
            take: limit,
            include: {
                category: true,
                variants: { where: { active: true }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, orderBy: { sort_order: "asc" }, take: 1, select: { url: true, media_type: true } },
            },
            orderBy: [{ rating: "desc" }, { review_count: "desc" }],
        });
    }

    async getNewArrivals(limit = 100) {
        return await prisma.products.findMany({
            where: {
                active: true,
            },
            take: limit,
            include: {
                category: { select: { id: true, name: true } },
                subcategory: { select: { id: true, name: true } },
                group: { select: { id: true, name: true } },
                store: { select: { id: true, name: true } },
                brands: {
                    select: { brand: { select: { id: true, name: true } } },
                    take: 1,
                },
                variants: {
                    where: { active: true },
                    include: {
                        inventory: { select: { stock_qty: true, reserved_qty: true, warehouse_id: true } },
                        seller_products: {
                            where: { status: 'APPROVED', is_active: true },
                            select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true }
                        }
                    },
                },
                media: {
                    where: { is_primary: true },
                    orderBy: { sort_order: 'asc' },
                    take: 1,
                    select: { url: true, media_type: true },
                },
            },
            orderBy: { created_at: "desc" },
        });
    }

    async getSuperSaver(limit = 50) {
        try {
            // 1. Get IDs of products sorted by their lowest variant price
            // We join products and variants, group by product ID, and order by min price
            const productsWithPrice = await prisma.$queryRaw`
                SELECT p.id, MIN(pv.price) as min_price
                FROM products p
                JOIN product_variants pv ON p.id = pv.product_id
                WHERE p.active = true AND pv.active = true
                GROUP BY p.id
                ORDER BY MIN(pv.price) ASC
                LIMIT ${limit}
            `;

            const productIds = productsWithPrice.map(p => p.id);

            if (productIds.length === 0) {
                return [];
            }

            // 2. Fetch full product details
            const products = await prisma.products.findMany({
                where: {
                    id: { in: productIds },
                },
                include: {
                    category: { select: { id: true, name: true } },
                    subcategory: { select: { id: true, name: true } },
                    group: { select: { id: true, name: true } },
                    store: { select: { id: true, name: true } },
                    brands: {
                        select: { brand: { select: { id: true, name: true } } },
                        take: 1,
                    },
                    variants: {
                        where: { active: true },
                        orderBy: { price: "asc" },
                        include: {
                            inventory: { select: { stock_qty: true, reserved_qty: true, warehouse_id: true } },
                            seller_products: {
                                where: { status: 'APPROVED', is_active: true },
                                select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true }
                            }
                        },
                    },
                    media: {
                        where: { is_primary: true },
                        orderBy: { sort_order: 'asc' },
                        take: 1,
                        select: { url: true, media_type: true },
                    },
                },
            });

            // 3. Sort products to match the order from the raw query (lowest price first)
            // Create a map for O(1) lookup of order index
            const idToIndex = new Map(productIds.map((id, index) => [id, index]));

            return products.sort((a, b) => {
                return (idToIndex.get(a.id) || 0) - (idToIndex.get(b.id) || 0);
            });

        } catch (error) {
            console.error("Error in getSuperSaver DAO:", error);
            throw error;
        }
    }

    // Check delivery feasibility (Stub implementation to fix crash)
    async canDeliverToPincode(productId, pincode) {
        // TODO: Implement actual logic based on Warehouse/Pincode mapping
        return true;
    }

    async getProductsByCategoryName(categoryName) {
        return await prisma.products.findMany({
            where: {
                active: true,
                OR: [
                    { category: { name: categoryName } },
                    { category_name: categoryName },
                ],
            },
            include: {
                variants: { where: { active: true }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, orderBy: { sort_order: "asc" }, take: 1, select: { url: true, media_type: true } },
            },
        });
    }

    async getRelatedProductsBySubcategory(productId, limit = 10) {
        const product = await this.getProductById(productId);
        if (!product || !product.subcategory_id) return [];

        return await prisma.products.findMany({
            where: {
                subcategory_id: product.subcategory_id,
                id: { not: productId },
                active: true,
            },
            take: limit,
            include: {
                variants: { where: { active: true }, orderBy: { price: "asc" }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, take: 1, select: { url: true, media_type: true } },
            },
            orderBy: { rating: "desc" },
        });
    }

    async getProductsByIds(ids) {
        return await prisma.products.findMany({
            where: {
                id: { in: ids },
                active: true,
            },
            include: {
                variants: { where: { active: true }, include: { inventory: true, seller_products: { where: { status: "APPROVED", is_active: true }, select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true } } } },
                media: { where: { is_primary: true }, orderBy: { sort_order: "asc" }, take: 1, select: { url: true, media_type: true } },
            },
        });
    }

    async getProductsByNames(names) {
        return await prisma.products.findMany({
            where: {
                name: { in: names },
            },
            select: { id: true, name: true },
        });
    }

    async getProductsByFilter(filters) {
        const {
            minPrice,
            maxPrice,
            rating,
            brandIds,
            brandName,
            categoryId,
            subcategoryId,
            vertical,
        } = filters;

        const where = {
            active: true,
            vertical,
            category_id: categoryId,
            subcategory_id: subcategoryId,
            rating: rating ? { gte: rating } : undefined,
            brands: brandName ? { some: { brand: { name: brandName } } } : (brandIds ? { some: { brand_id: { in: brandIds } } } : undefined),
            variants:
                minPrice !== undefined || maxPrice !== undefined
                    ? {
                        some: {
                            price: {
                                gte: minPrice,
                                lte: maxPrice,
                            },
                            active: true,
                        },
                    }
                    : undefined,
        };

        return await prisma.products.findMany({
            where,
            include: {
                category: { select: { id: true, name: true } },
                subcategory: { select: { id: true, name: true } },
                group: { select: { id: true, name: true } },
                store: { select: { id: true, name: true } },
                brands: {
                    select: { brand: { select: { id: true, name: true } } },
                    take: 1,
                },
                variants: {
                    where: { active: true },
                    include: {
                        inventory: { select: { stock_qty: true, reserved_qty: true, warehouse_id: true } },
                        seller_products: {
                            where: { status: 'APPROVED', is_active: true },
                            select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true }
                        }
                    },
                },
                media: {
                    where: { is_primary: true },
                    orderBy: { sort_order: 'asc' },
                    take: 1,
                    select: { url: true, media_type: true },
                },
            },
            orderBy: { created_at: "desc" },
        });
    }

    // --- Variant Operations ---
    async createVariant(data) {
        return await prisma.product_variants.create({
            data,
        });
    }

    async updateVariant(id, data) {
        return await prisma.product_variants.update({
            where: { id },
            data,
        });
    }

    async deleteVariant(id) {
        return await prisma.product_variants.delete({
            where: { id },
        });
    }

    async getVariantsByProductId(productId) {
        return await prisma.product_variants.findMany({
            where: { product_id: productId },
            include: {
                inventory: true,
                variant_attributes: true,
                seller_products: {
                    where: { status: 'APPROVED', is_active: true },
                    select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true }
                }
            },
        });
    }

    // --- Variant Attributes Operations ---
    async createVariantAttribute(variantId, attributeData) {
        return await prisma.variant_attributes.create({
            data: {
                variant_id: variantId,
                ...attributeData,
            },
        });
    }

    async updateVariantAttribute(id, attributeData) {
        return await prisma.variant_attributes.update({
            where: { id },
            data: attributeData,
        });
    }

    async deleteVariantAttribute(id) {
        return await prisma.variant_attributes.delete({
            where: { id },
        });
    }

    async getAttributesByVariantId(variantId) {
        return await prisma.variant_attributes.findMany({
            where: { variant_id: variantId },
        });
    }

    async bulkUpdateVariantAttributes(variantId, attributes) {
        return await prisma.$transaction(async (tx) => {
            // Delete existing attributes
            await tx.variant_attributes.deleteMany({
                where: { variant_id: variantId },
            });

            // Create new attributes
            if (attributes && attributes.length > 0) {
                await tx.variant_attributes.createMany({
                    data: attributes.map((attr) => ({
                        variant_id: variantId,
                        attribute_name: attr.attribute_name,
                        attribute_value: attr.attribute_value,
                        price: attr.price ? parseFloat(attr.price) : null,
                        old_price: attr.old_price ? parseFloat(attr.old_price) : null,
                    })),
                });
            }

            return await tx.variant_attributes.findMany({
                where: { variant_id: variantId },
            });
        });
    }

    // --- Brand Relationships ---
    async addBrandToProduct(productId, brandId) {
        return await prisma.product_brand.create({
            data: {
                product_id: productId,
                brand_id: brandId,
            },
        });
    }

    async removeBrandFromProduct(productId, brandId) {
        return await prisma.product_brand.delete({
            where: {
                product_id_brand_id: {
                    product_id: productId,
                    brand_id: brandId,
                },
            },
        });
    }

    // --- Recommended Store Relationships ---
    async addRecommendedStore(productId, storeId) {
        // Use upsert to avoid unique constraint errors if already linked
        return await prisma.product_recommended_store.upsert({
            where: {
                product_id_recommended_store_id: {
                    product_id: productId,
                    recommended_store_id: storeId,
                },
            },
            update: {}, // No changes if already exists
            create: {
                product_id: productId,
                recommended_store_id: storeId,
            },
        });
    }

    async removeRecommendedStore(productId, storeId) {
        return await prisma.product_recommended_store.delete({
            where: {
                product_id_recommended_store_id: {
                    product_id: productId,
                    recommended_store_id: storeId,
                },
            },
        });
    }

    /**
     * Enrich products with inventory stock information
     * @param {Array} products - Array of products with variants
     * @param {number|Array<number>} warehouseIds - Optional warehouse filter (single ID or array of IDs)
     * @returns {Array} Products enriched with stock_info
     */
    async enrichProductsWithInventory(products, warehouseIds = null) {
        if (!products || products.length === 0) {
            return products;
        }

        // Import inventory DAO
        const inventoryDAO = (await import("./inventory.dao.js")).default;

        // Collect all variant IDs from all products
        const variantIds = [];
        products.forEach((product) => {
            if (product.variants && product.variants.length > 0) {
                product.variants.forEach((variant) => {
                    if (variant.id) {
                        variantIds.push(variant.id);
                    }
                });
            }
        });

        // Batch fetch inventory for all variants
        const stockMap = await inventoryDAO.getStockByVariantIds(
            variantIds,
            warehouseIds,
        );

        // Enrich each product
        return products.map((product) => {
            const enrichedProduct = { ...product };

            if (product.variants && product.variants.length > 0) {
                enrichedProduct.variants = product.variants.map((variant) => {
                    const stockInfo = stockMap.get(variant.id) || {
                        available_stock: 0,
                        in_stock: false,
                        low_stock: false,
                        warehouses: [],
                    };

                    return {
                        ...variant,
                        stock_info: {
                            available_stock: stockInfo.available_stock,
                            in_stock: stockInfo.in_stock,
                            low_stock: stockInfo.low_stock,
                            warehouse_count: stockInfo.warehouses?.length || 0,
                        },
                    };
                });

                // Set product-level stock info based on default variant or first variant
                const defaultVariant =
                    enrichedProduct.variants.find((v) => v.is_default) ||
                    enrichedProduct.variants[0];
                if (defaultVariant && defaultVariant.stock_info) {
                    enrichedProduct.stock_info = defaultVariant.stock_info;
                }
            } else {
                // Product without variants - set as out of stock
                enrichedProduct.stock_info = {
                    available_stock: 0,
                    in_stock: false,
                    low_stock: false,
                    warehouse_count: 0,
                };
            }

            return enrichedProduct;
        });
    }
}

export default new ProductDAO();
