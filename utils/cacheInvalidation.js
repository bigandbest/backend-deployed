/**
 * Cache Invalidation Helper
 * Automatically invalidate cache when data is modified
 */

import cache from './cache.js';

/**
 * Invalidate cache patterns after data modification
 */
export const invalidateCache = {
    /**
     * Invalidate all product-related caches
     */
    products: () => {
        const patterns = [
            'admin:products:.*',
            'GET:/api/productsroute.*',
            'GET:/api/admin/products.*'
        ];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} product cache entries`);
        });
    },

    /**
     * Invalidate category-related caches
     */
    categories: () => {
        const patterns = [
            'GET:/api/categories.*',
            'GET:/api/categories/subcategories.*',
            'GET:/api/categories/groups.*'
        ];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} category cache entries`);
        });
    },

    /**
     * Invalidate banner caches
     */
    banners: () => {
        const patterns = [
            'GET:/api/add-banner.*',
            'GET:/api/banner.*'
        ];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} banner cache entries`);
        });
    },

    /**
     * Invalidate brand caches
     */
    brands: () => {
        const patterns = ['GET:/api/brands.*'];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} brand cache entries`);
        });
    },

    /**
     * Invalidate certification caches
     */
    certifications: () => {
        const patterns = ['GET:/api/certifications.*'];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} certification cache entries`);
        });
    },

    /**
     * Invalidate partner caches
     */
    partners: () => {
        const patterns = ['GET:/api/partners.*'];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} partner cache entries`);
        });
    },

    /**
     * Invalidate store caches
     */
    stores: () => {
        const patterns = ['GET:/api/recommended-stores.*'];
        patterns.forEach(pattern => {
            const count = cache.invalidatePattern(pattern);
            console.log(`🔄 Invalidated ${count} store cache entries`);
        });
    },

    /**
     * Invalidate all caches
     */
    all: () => {
        cache.clear();
        console.log('🔄 Cleared all cache entries');
    }
};

/**
 * Express middleware to invalidate cache after successful mutations
 */
export const invalidateCacheMiddleware = (cacheType) => {
    return (req, res, next) => {
        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to invalidate cache on success
        res.json = (data) => {
            // Only invalidate on successful operations
            if (data && data.success === true && invalidateCache[cacheType]) {
                invalidateCache[cacheType]();
            }
            return originalJson(data);
        };

        next();
    };
};

export default invalidateCache;
