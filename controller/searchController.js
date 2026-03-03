import prisma from "../config/prisma.js";

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

        // Parallel search across all entities using Prisma
        const [productsResult, categoriesResult, subcategoriesResult, storesResult, brandsResult, groupsResult] = await Promise.all([
            // Search products by name, category, subcategory or brand name
            prisma.products.findMany({
                where: {
                    active: true,
                    OR: [
                        { name: { contains: searchQuery, mode: 'insensitive' } },
                        {
                            category: {
                                name: { contains: searchQuery, mode: 'insensitive' }
                            }
                        },
                        {
                            subcategory: {
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
                },
                select: {
                    id: true,
                    name: true,
                    media: true,
                    variants: {
                        select: { price: true },
                        take: 1
                    },
                    rating: true,
                    category: {
                        select: { name: true }
                    }
                },
                take: 5
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
                    name: { contains: searchQuery, mode: 'insensitive' },
                    active: true
                },
                select: {
                    id: true,
                    name: true,
                    image_url: true,
                    subcategory_id: true,
                    subcategory: {
                        select: {
                            name: true,
                            category_id: true
                        }
                    }
                },
                take: 5
            }),
        ]);

        // Map and format results for the frontend
        const formattedProducts = productsResult.map(p => ({
            id: p.id,
            name: p.name,
            image: p.media?.[0]?.url || null,
            price: p.variants?.[0]?.price || 0,
            category: p.category?.name || null,
            rating: p.rating
        }));

        // Prepare response
        const results = {
            products: formattedProducts,
            categories: categoriesResult || [],
            subcategories: subcategoriesResult || [],
            stores: storesResult || [],
            brands: brandsResult || [],
            groups: (groupsResult || []).map(g => ({
                id: g.id,
                name: g.name,
                image_url: g.image_url,
                subcategory_name: g.subcategory?.name || null,
                category_id: g.subcategory?.category_id || null,
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

        const [products, totalCount] = await Promise.all([
            prisma.products.findMany({
                where: whereClause,
                skip,
                take,
                include: {
                    media: true,
                    category: true,
                    variants: {
                        take: 1
                    }
                }
            }),
            prisma.products.count({
                where: whereClause
            })
        ]);

        // Map data formatting for consistency
        const formattedProducts = products.map(p => ({
            ...p,
            image: p.media?.[0]?.url || null,
            price: p.variants?.[0]?.price || 0,
            category: p.category?.name || p.category_id
        }));

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
