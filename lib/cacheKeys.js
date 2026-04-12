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

// ── TTL constants (seconds) ───────────────────────────────────────────────────
export const PRODUCT_TTL = 300;       // 5 min
export const RELATED_TTL = 600;       // 10 min
export const COUPONS_TTL = 120;       // 2 min
export const AVAILABILITY_TTL = 60;   // 1 min
export const REVIEWS_TTL = 180;       // 3 min
