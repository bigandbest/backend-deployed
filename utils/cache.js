/**
 * Simple in-memory cache with TTL support
 * For production, consider Redis or similar
 */
class MemoryCache {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
    }

    /**
     * Set cache entry with optional TTL
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in seconds (default: 300s = 5min)
     */
    set(key, value, ttl = 300) {
        // Clear existing timer if any
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        // Set cache value
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl: ttl * 1000
        });

        // Set expiration timer
        const timer = setTimeout(() => {
            this.delete(key);
        }, ttl * 1000);

        this.timers.set(key, timer);
    }

    /**
     * Get cached value
     * @param {string} key - Cache key
     * @returns {*} Cached value or undefined
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return undefined;
        }

        // Check if expired
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.delete(key);
            return undefined;
        }

        return entry.value;
    }

    /**
     * Check if key exists and is not expired
     */
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;

        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete cache entry
     */
    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        this.cache.delete(key);
    }

    /**
     * Clear entire cache
     */
    clear() {
        // Clear all timers
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    stats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Invalidate cache entries by pattern
     */
    invalidatePattern(pattern) {
        const regex = new RegExp(pattern);
        const keysToDelete = [];

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.delete(key));
        return keysToDelete.length;
    }
}

// Singleton instance
const cache = new MemoryCache();

/**
 * Cache middleware for Express routes
 * @param {number} ttl - Cache TTL in seconds
 * @param {function} keyGenerator - Function to generate cache key from req
 */
export const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
    return (req, res, next) => {
        // Generate cache key
        const cacheKey = keyGenerator 
            ? keyGenerator(req)
            : `${req.method}:${req.originalUrl}`;

        // Check cache
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log(`✅ Cache HIT: ${cacheKey}`);
            // Add cache headers for browser caching
            res.set('X-Cache', 'HIT');
            res.set('Cache-Control', `public, max-age=${ttl}`);
            return res.json(cachedData);
        }

        console.log(`❌ Cache MISS: ${cacheKey}`);

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to cache response
        res.json = (data) => {
            // Only cache successful responses
            if (data && (data.success === true || data.success === undefined)) {
                cache.set(cacheKey, data, ttl);
                // Add cache headers for browser caching
                res.set('X-Cache', 'MISS');
                res.set('Cache-Control', `public, max-age=${ttl}`);
            }
            return originalJson(data);
        };

        next();
    };
};

/**
 * Cache control headers middleware for static content
 * Sets browser cache headers based on content type
 */
export const staticCacheHeaders = (maxAge = 86400) => {
    return (req, res, next) => {
        // Set cache headers for static content
        res.set('Cache-Control', `public, max-age=${maxAge}, immutable`);
        res.set('Expires', new Date(Date.now() + maxAge * 1000).toUTCString());
        next();
    };
};

/**
 * Conditional cache middleware - caches based on custom condition
 */
export const conditionalCache = (ttl, shouldCache) => {
    return (req, res, next) => {
        if (!shouldCache(req)) {
            return next();
        }
        return cacheMiddleware(ttl)(req, res, next);
    };
};

export default cache;
