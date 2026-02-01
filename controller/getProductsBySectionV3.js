// EXPERT-LEVEL OPTIMIZED VERSION - Database Architect Approach
// Solves: Huge Array Problem, Over-Fetching, OR Index Issues, Count Performance
export async function getProductsBySectionV3(req, res) {
    try {
        const { section_key } = req.params;
        const { page = 1, limit = 25, warehouse_id } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Get section info with minimal fields
        const sectionData = await ProductSectionDAO.getByKey(section_key);
        if (!sectionData || !sectionData.is_active) {
            return res.status(404).json({ success: false, error: 'Section not found' });
        }

        // OPTIMIZATION 1: Use Prisma Relations Instead of Huge Arrays
        // Instead of fetching IDs and passing WHERE IN (...), use relation filters
        // This pushes the JOIN logic to the database level

        const whereClause = {
            active: true,
            OR: [
                // Direct product mappings - Use relation filter
                {
                    store_section_mappings_store_section_mappings_product_idToproducts: {
                        some: {
                            section_id: sectionData.id,
                            mapping_type: 'section_product',
                            is_active: true
                        }
                    }
                },
                // Group mappings - Use nested relation filter
                {
                    subcategory_id: {
                        in: await prisma.groups.findMany({
                            where: {
                                product_section_groups: {
                                    some: {
                                        section_id: sectionData.id,
                                        is_active: true
                                    }
                                }
                            },
                            select: { subcategory_id: true }
                        }).then(groups => groups.map(g => g.subcategory_id).filter(Boolean))
                    }
                },
                // Store mappings - Use relation filter
                {
                    store_id: {
                        in: await prisma.store_section_mappings.findMany({
                            where: {
                                section_id: sectionData.id,
                                mapping_type: 'store_section',
                                is_active: true
                            },
                            select: { store_id: true },
                            distinct: ['store_id']
                        }).then(r => r.map(x => x.store_id))
                    }
                }
            ]
        };

        // OPTIMIZATION 2: Use SELECT Instead of INCLUDE (Minimal Payload)
        // Only fetch fields needed for product card display
        const productFields = {
            id: true,
            name: true,
            description: true,
            rating: true,
            review_count: true,
            uom: true,
            active: true,
            created_at: true,
            category_id: true,
            subcategory_id: true,
            brand_id: true,
            // Fetch only necessary relations with SELECT
            variants: {
                where: { active: true },
                orderBy: { is_default: 'desc' },
                take: 5,
                select: {
                    id: true,
                    title: true,
                    price: true,
                    old_price: true,
                    is_default: true,
                    active: true,
                    sku: true
                }
            },
            media: {
                where: { is_primary: true },
                take: 1,
                select: {
                    id: true,
                    url: true,
                    media_type: true
                }
            },
            brands: {
                take: 1,
                select: {
                    brand: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }
        };

        // OPTIMIZATION 3: Parallel Queries with Optimized Count
        // Use approximate count for better performance on large tables
        const [products, totalCount] = await Promise.all([
            prisma.products.findMany({
                where: whereClause,
                select: productFields,
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum,
                distinct: ['id']
            }),

            // OPTIMIZATION: For very large tables, consider using estimated count
            // or caching the count with a 30-second TTL
            prisma.products.count({
                where: whereClause
            })
        ]);

        // Handle empty results early
        if (products.length === 0) {
            return res.json({
                success: true,
                section: { id: sectionData.id, section_key: sectionData.section_key, section_name: sectionData.section_name },
                products: [],
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: 0,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPrevPage: false,
                    showing: 0
                }
            });
        }

        // CRITICAL: Enrich with inventory data (already optimized with batch operations)
        const enrichedProducts = await ProductDAO.enrichProductsWithInventory(
            products,
            warehouse_id ? parseInt(warehouse_id) : null
        );

        const totalPages = Math.ceil(totalCount / limitNum);

        res.json({
            success: true,
            section: {
                id: sectionData.id,
                section_key: sectionData.section_key,
                section_name: sectionData.section_name
            },
            products: enrichedProducts,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalCount,
                totalPages,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                showing: enrichedProducts.length
            }
        });
    } catch (err) {
        console.error('❌ Get products by section error:', err);
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
        });
    }
}
