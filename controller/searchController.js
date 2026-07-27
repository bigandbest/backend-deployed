import prisma from "../config/prisma.js";
import cartAvailabilityDAO from "../dao/cart-availability.dao.js";

/**
 * Unified search across products, categories, subcategories, stores, and brands
 * GET /api/search?q={query}
 */
export async function unifiedSearch(req, res) {
    try {
        const { q } = req.query;

        // Validate query
        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: "Search query must be at least 2 characters long",
            });
        }

        const searchQuery = q.trim();
        const searchWords = searchQuery.split(/\s+/).filter(w => w.length > 0);

        // Parallel search across all entities using Prisma
        const [productsResult, categoriesResult, subcategoriesResult, storesResult, brandsResult, groupsResult] = await Promise.all([
            // Search products by name, category, subcategory or brand name
            prisma.products.findMany({
                where: {
                    active: true,
                    OR: [
                        { name: { contains: searchQuery, mode: "insensitive" } },
                        {
                            category: {
                                name: { contains: searchQuery, mode: "insensitive" },
                            },
                        },
                        {
                            subcategory: {
                                name: { contains: searchQuery, mode: "insensitive" },
                            },
                        },
                        {
                            brands: {
                                some: {
                                    brand: {
                                        name: { contains: searchQuery, mode: "insensitive" },
                                    },
                                },
                            },
                        },
                    ],
                },
                include: {
                    media: {
                        where: { is_primary: true },
                        orderBy: { sort_order: "asc" },
                        take: 1,
                    },
                    variants: {
                        select: { price: true },
                        take: 1,
                    },
                    category: {
                        select: { name: true },
                    },
                },
                take: 5,
            }),

            // Search categories directly
            prisma.categories.findMany({
                where: {
                    name: { contains: searchQuery, mode: 'insensitive' },
                    active: true
                },
                select: {
                    id: true,
                    name: true,
                    image_url: true
                },
                take: 5
            }),

            // Search subcategories directly
            prisma.subcategories.findMany({
                where: {
                    name: { contains: searchQuery, mode: 'insensitive' },
                    active: true
                },
                select: {
                    id: true,
                    name: true,
                    image_url: true,
                    category_id: true
                },
                take: 5
            }),

            // Search recommended stores
            prisma.recommended_store.findMany({
                where: {
                    name: { contains: searchQuery, mode: 'insensitive' },
                    is_active: true
                },
                select: {
                    id: true,
                    name: true,
                    image_url: true,
                    description: true,
                    is_active: true
                },
                take: 5
            }),

            // Search brands directly
            prisma.brand.findMany({
                where: {
                    name: { contains: searchQuery, mode: 'insensitive' }
                },
                select: {
                    id: true,
                    name: true,
                    image_url: true
                },
                take: 5
            }),

            // Search groups (sub-subcategories)
            prisma.groups.findMany({
                where: {
                    name: { contains: searchQuery, mode: "insensitive" },
                    active: true,
                },
                select: {
                    id: true,
                    name: true,
                    image_url: true,
                    subcategory_id: true,
                    subcategories: {
                        select: {
                            name: true,
                            category_id: true,
                        },
                    },
                },
                take: 5,
            }),
        ]);

        // Fallback 1: if no exact products found, search by individual words
        let finalProductsResult = productsResult;
        if (productsResult.length === 0 && searchWords.length > 0) {
            finalProductsResult = await prisma.products.findMany({
                where: {
                    active: true,
                    OR: searchWords.map(word => ({
                        OR: [
                            { name: { contains: word, mode: "insensitive" } },
                            { category: { name: { contains: word, mode: "insensitive" } } },
                            { brands: { some: { brand: { name: { contains: word, mode: "insensitive" } } } } },
                        ]
                    }))
                },
                include: {
                    media: {
                        where: { is_primary: true },
                        orderBy: { sort_order: "asc" },
                        take: 1,
                    },
                    variants: {
                        select: { price: true },
                        take: 1,
                    },
                    category: {
                        select: { name: true },
                    },
                },
                take: 5,
                distinct: ['id']
            });
        }

        // Fallback 2: if still no products, show featured/popular products from first active category
        if (finalProductsResult.length === 0) {
            const firstCategory = await prisma.categories.findFirst({
                where: { active: true },
                orderBy: { created_at: 'asc' }
            });

            if (firstCategory) {
                finalProductsResult = await prisma.products.findMany({
                    where: {
                        active: true,
                        category_id: firstCategory.id
                    },
                    include: {
                        media: {
                            where: { is_primary: true },
                            orderBy: { sort_order: "asc" },
                            take: 1,
                        },
                        variants: {
                            select: { price: true },
                            take: 1,
                        },
                        category: {
                            select: { name: true },
                        },
                    },
                    orderBy: { rating: 'desc' },
                    take: 5,
                });
            }
        }

        // Map and format results for the frontend
        let formattedProducts = finalProductsResult.map((p) => ({
            id: p.id,
            name: p.name,
            image: p.media?.[0]?.url || null,
            price: p.variants?.[0]?.price || 0,
            category: p.category?.name || null,
            rating: p.rating,
            variants: p.variants || [],
        }));

        // Enrich with availability
        const pincode = req.headers['x-user-pincode'];
        if (pincode && /^\d{6}$/.test(pincode) && formattedProducts.length > 0) {
            try {
                const items = formattedProducts.filter(p => p.id).map(p => ({
                    product_id: p.id,
                    variant_id: p.variants?.[0]?.id || null,
                    quantity: 1,
                }));
                if (items.length > 0) {
                    const availability = await cartAvailabilityDAO.checkBulkAvailability(items, pincode);
                    formattedProducts = formattedProducts.map(p => ({
                        ...p,
                        availability: availability[p.id] ?? { available: true },
                    }));
                }
            } catch (err) {
                console.warn('[Availability] Search enrichment failed:', err.message);
            }
        }

        // Prepare response
        const results = {
            products: formattedProducts,
            categories: categoriesResult || [],
            subcategories: subcategoriesResult || [],
            stores: storesResult || [],
            brands: brandsResult || [],
            groups: (groupsResult || []).map((g) => ({
                id: g.id,
                name: g.name,
                image_url: g.image_url,
                subcategory_name: g.subcategories?.name || null,
                category_id: g.subcategories?.category_id || null,
            })),
            total: formattedProducts.length + categoriesResult.length + subcategoriesResult.length + storesResult.length + brandsResult.length + (groupsResult || []).length,
        };

        return res.status(200).json({
            success: true,
            query: searchQuery,
            results,
        });
    } catch (error) {
        console.error("Unified search error:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error during search",
        });
    }
}

/**
 * Search products only (for dedicated product search page)
 * GET /api/search/products?q={query}&limit={limit}&offset={offset}
 */
export async function searchProducts(req, res) {
    try {
        const { q, limit = 20, offset = 0 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: "Search query must be at least 2 characters long",
            });
        }

        const searchQuery = q.trim();
        const searchWords = searchQuery.split(/\s+/).filter(w => w.length > 0);
        const take = parseInt(limit);
        const skip = parseInt(offset);

        const whereClause = {
            active: true,
            OR: [
                { name: { contains: searchQuery, mode: 'insensitive' } },
                {
                    category: {
                        name: { contains: searchQuery, mode: 'insensitive' }
                    }
                },
                {
                    brands: {
                        some: {
                            brand: {
                                name: { contains: searchQuery, mode: 'insensitive' }
                            }
                        }
                    }
                }
            ]
        };

        let [products, totalCount] = await Promise.all([
            prisma.products.findMany({
                where: whereClause,
                skip,
                take,
                include: {
                    media: {
                        where: { is_primary: true },
                        orderBy: { sort_order: "asc" },
                        take: 1,
                    },
                    category: true,
                    variants: {
                        take: 1,
                    },
                },
            }),
            prisma.products.count({
                where: whereClause
            })
        ]);

        // Fallback 1: if no products found, search by individual words (only for first page)
        if (totalCount === 0 && skip === 0 && searchWords.length > 0) {
            const wordWhereClause = {
                active: true,
                OR: searchWords.map(word => ({
                    OR: [
                        { name: { contains: word, mode: "insensitive" } },
                        { category: { name: { contains: word, mode: "insensitive" } } },
                        { brands: { some: { brand: { name: { contains: word, mode: "insensitive" } } } } },
                    ]
                }))
            };

            [products, totalCount] = await Promise.all([
                prisma.products.findMany({
                    where: wordWhereClause,
                    take,
                    include: {
                        media: {
                            where: { is_primary: true },
                            orderBy: { sort_order: "asc" },
                            take: 1,
                        },
                        category: true,
                        variants: {
                            take: 1,
                        },
                    },
                    distinct: ['id']
                }),
                prisma.products.count({
                    where: wordWhereClause
                })
            ]);
        }

        // Fallback 2: if still no products, show featured/popular products from first category
        if (totalCount === 0 && skip === 0) {
            const firstCategory = await prisma.categories.findFirst({
                where: { active: true },
                orderBy: { created_at: 'asc' }
            });

            if (firstCategory) {
                [products, totalCount] = await Promise.all([
                    prisma.products.findMany({
                        where: {
                            active: true,
                            category_id: firstCategory.id
                        },
                        take,
                        include: {
                            media: {
                                where: { is_primary: true },
                                orderBy: { sort_order: "asc" },
                                take: 1,
                            },
                            category: true,
                            variants: {
                                take: 1,
                            },
                        },
                        orderBy: { rating: 'desc' }
                    }),
                    prisma.products.count({
                        where: {
                            active: true,
                            category_id: firstCategory.id
                        }
                    })
                ]);
            }
        }

        // Map data formatting for consistency
        let formattedProducts = products.map((p) => ({
            ...p,
            image: p.media?.[0]?.url || null,
            price: p.variants?.[0]?.price || 0,
            category: p.category?.name || p.category_id,
        }));

        // Enrich with availability
        const pincode = req.headers['x-user-pincode'];
        if (pincode && /^\d{6}$/.test(pincode) && formattedProducts.length > 0) {
            try {
                const items = formattedProducts.filter(p => p.id).map(p => ({
                    product_id: p.id,
                    variant_id: p.variants?.[0]?.id || null,
                    quantity: 1,
                }));
                if (items.length > 0) {
                    const availability = await cartAvailabilityDAO.checkBulkAvailability(items, pincode);
                    formattedProducts = formattedProducts.map(p => ({
                        ...p,
                        availability: availability[p.id] ?? { available: true },
                    }));
                }
            } catch (err) {
                console.warn('[Availability] Search enrichment failed:', err.message);
            }
        }

        return res.status(200).json({
            success: true,
            query: searchQuery,
            products: formattedProducts,
            total: totalCount,
            limit: take,
            offset: skip,
        });
    } catch (error) {
        console.error("Product search error:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error during product search",
        });
    }
}
