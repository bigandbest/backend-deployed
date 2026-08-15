// Cache key factory functions — pure, no side effects.
// Increment the version prefix (v1 → v2) to invalidate all keys of a type on deploy.

export const productKey = (productId) => `product:v1:${productId}`;

export const productWithPincodeKey = (productId, pincode) =>
  `product:v1:${productId}:pincode:${pincode}`;

export const relatedProductsKey = (productId) => `related:v1:${productId}`;

/**
 * Coupon cache is bucketed by cart value in ₹100 increments so a single cache
 * entry covers all requests in the same price band (e.g. ₹0-99, ₹100-199…).
 */
export const couponsKey = (cartValueBucket) =>
  `coupons:v1:bucket:${cartValueBucket}`;

export const availabilityKey = (productId, variantId, pincode) =>
  `avail:v1:${productId}:${variantId ?? 'base'}:${pincode}`;

export const reviewsKey = (productId) => `reviews:v1:${productId}`;

// Base product-list caches — deliberately keyed WITHOUT pincode: these cache
// the pre-availability-enrichment list (products + total only), and each
// request enriches its own copy from the cache using its own pincode. Never
// cache the post-enrichment result under these keys.
export const newArrivalsKey = (limit, page) => `products:v1:new-arrivals:l${limit}:p${page}`;
export const superSaverKey = (limit, page) => `products:v1:super-saver:l${limit}:p${page}`;
export const subcategoryProductsKey = (subcategoryId, page, limit, sort) =>
  `products:v1:subcategory:${subcategoryId}:p${page}:l${limit}:${sort}`;

// ── TTL constants (seconds) ───────────────────────────────────────────────────
export const PRODUCT_TTL = 300;       // 5 min
export const RELATED_TTL = 600;       // 10 min
export const COUPONS_TTL = 120;       // 2 min
export const PRODUCT_LIST_TTL = 120;  // 2 min — catalog-wide lists (new-arrivals, super-saver, subcategory)
export const AVAILABILITY_TTL = 60;   // 1 min
// Matches AVAILABILITY_TTL — a pincode/product combo doesn't flip from
// unserviceable to serviceable within seconds in practice, and a shorter TTL
// here just meant repeat requests re-paid the full multi-second warehouse
// lookup instead of getting a cache hit.
export const AVAILABILITY_NEGATIVE_TTL = 60;
export const REVIEWS_TTL = 180;       // 3 min
