import { supabase } from "../config/supabaseClient.js";

/**
 * Unified search across products, categories, stores, and brands
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
        const searchPattern = `%${searchQuery}%`;

        // Parallel search across all entities
        const [productsResult, categoriesResult, storesResult] = await Promise.all([
            // Search products by name and category
            supabase
                .from("products")
                .select("id, name, image, price, category, rating")
                .or(`name.ilike.${searchPattern},category.ilike.${searchPattern}`)
                .limit(5),

            // Search categories (get unique categories from products)
            supabase
                .from("products")
                .select("category")
                .ilike("category", searchPattern)
                .limit(10), // Get more to filter unique

            // Search recommended stores
            supabase
                .from("recommended_store")
                .select("id, name, image_url, description, is_active")
                .ilike("name", searchPattern)
                .eq("is_active", true)
                .limit(5),
        ]);

        // Handle errors
        if (productsResult.error) {
            console.error("Error searching products:", productsResult.error);
        }
        if (categoriesResult.error) {
            console.error("Error searching categories:", categoriesResult.error);
        }
        if (storesResult.error) {
            console.error("Error searching stores:", storesResult.error);
        }

        // Process categories to get unique values
        const uniqueCategories = categoriesResult.data
            ? [...new Set(categoriesResult.data.map((item) => item.category))]
                .filter(Boolean)
                .slice(0, 5)
                .map((category) => ({ name: category }))
            : [];

        // Prepare response
        const results = {
            products: productsResult.data || [],
            categories: uniqueCategories,
            stores: storesResult.data || [],
            total:
                (productsResult.data?.length || 0) +
                uniqueCategories.length +
                (storesResult.data?.length || 0),
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
        const searchPattern = `%${searchQuery}%`;

        const { data, error, count } = await supabase
            .from("products")
            .select("*", { count: "exact" })
            .or(`name.ilike.${searchPattern},category.ilike.${searchPattern}`)
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (error) {
            console.error("Error searching products:", error);
            return res.status(500).json({
                success: false,
                error: "Error searching products",
            });
        }

        return res.status(200).json({
            success: true,
            query: searchQuery,
            products: data,
            total: count,
            limit: parseInt(limit),
            offset: parseInt(offset),
        });
    } catch (error) {
        console.error("Product search error:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error during product search",
        });
    }
}
