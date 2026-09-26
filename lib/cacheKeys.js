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

// Per-pincode delivery lookups used by cart-availability (zone id + serving warehouses). Depend ONLY on the pincode
// (no user / product / platform), so they are safe to share across users. TTL-only freshness: the existing avail:*
// cache is not invalidated on warehouse/zone edits either. Worst-case staleness = this TTL + AVAILABILITY_TTL.
export const availZoneLookupKey = (pincode) => `availlk:v1:zone:${pincode}`;
export const availWarehousesLookupKey = (pincode) => `availlk:v1:wh:${pincode}`;

// Base product-list caches — deliberately keyed WITHOUT pincode: these cache
// the pre-availability-enrichment list (products + total only), and each
// request enriches its own copy from the cache using its own pincode. Never
// cache the post-enrichment result under these keys.
export const newArrivalsKey = (limit, page) => `products:v1:new-arrivals:l${limit}:p${page}`;
export const allProductsKey = (limit, page) => `products:v1:all:l${limit}:p${page}`;
export const superSaverKey = (limit, page) => `products:v1:super-saver:l${limit}:p${page}`;
export const subcategoryProductsKey = (subcategoryId, page, limit, sort) =>
  `products:v1:subcategory:${subcategoryId}:p${page}:l${limit}:${sort}`;

// ── TTL constants (seconds) ───────────────────────────────────────────────────
export const PRODUCT_TTL = 300;       // 5 min
export const RELATED_TTL = 600;       // 10 min
export const COUPONS_TTL = 120;       // 2 min
// GET /productsroute/allproducts base payload. Contains stock (product/variant stock, raw inventory rows): staleness = this TTL.
export const ALL_PRODUCTS_TTL = parseInt(process.env.ALL_PRODUCTS_CACHE_TTL || '60', 10);
export const PRODUCT_LIST_TTL = 120;  // 2 min — catalog-wide lists (new-arrivals, super-saver, subcategory)
export const AVAILABILITY_TTL = 60;   // 1 min
export const AVAILABILITY_LOOKUP_TTL = parseInt(process.env.AVAILABILITY_LOOKUP_TTL || '30', 10); // per-pincode zone/warehouse lookups
// Matches AVAILABILITY_TTL — a pincode/product combo doesn't flip from
// unserviceable to serviceable within seconds in practice, and a shorter TTL
// here just meant repeat requests re-paid the full multi-second warehouse
// lookup instead of getting a cache hit.
export const AVAILABILITY_NEGATIVE_TTL = 60;
export const REVIEWS_TTL = 180;       // 3 min

// ── Homepage feed v2 (services/homepage). Layered caches — see plan §23. ─────────────────────────────
// Deliberately NO pincode / user / platform in any key: pincode availability is a per-request overlay,
// and the platform only changes which sections are listed, not any cached value.
export const HOMEPAGE_PLAN_TTL = 300;      // section config + mapping ids
export const HOMEPAGE_SELECTION_TTL = 300; // per-section product-id selection (changes with mappings/product membership)
export const HOMEPAGE_PRODUCT_TTL = 60;    // hydrated card projection incl. stock (volatile; stock is TTL-bound by design)
export const homepagePlanKey = () => 'hp:plan:v1';
export const homepageSelectionKey = (sectionId) => `hp:sel:v1:${sectionId}`;
export const homepageProductKey = (warehouseId, productId) => `hp:prod:v1:wh${warehouseId || 0}:${productId}`;
export const homepageSectionViewKey = (sectionId) => `hp:sec:v2:${sectionId}`; // v2: views gained description/bannerType/megaBanner/legacy fields
export const HOMEPAGE_CATEGORIES_TTL = 300; // active category hierarchy for CATEGORY_GRID/DUAL_CATEGORY_PAIR
export const homepageCategoriesKey = () => 'hp:cats:v1';
