// Section type declarations — DATA ONLY (no IO, no endpoints, no React).
// Resolvers (services/homepage/resolvers) own IO; this file owns "what a type is allowed to be".
//
// @typedef {'PRODUCT'|'CATEGORY'|'GROUP'|'SUBCATEGORY'} MappingKind
// @typedef {Object} SectionDefinition
// @property {string}   type
// @property {string}   label            admin-facing name
// @property {MappingKind[]} mappings    relational mappings the type may have (on the section, or on its children for pairs)
// @property {Object}   configSchema     see registry/schema.js
// @property {'INITIAL'|'DEFERRED'} defaultLoad   used when section.load_mode = 'AUTO'
// @property {boolean}  usesProducts      participates in ProductSelectionBatch -> entities.products
// @property {boolean}  usesCategories    -> entities.categories
// @property {boolean}  supportsPagination "See All" is served by the existing /product-sections/:id/content
// @property {string[]} platforms        platforms the type can render on
// @property {number}   ttlSec           Redis TTL of a resolved section view
// @property {number}   timeoutMs        per-resolver budget
// @property {boolean}  isParent         has left/right children (pair sections)
// @property {(ctx:{config:object, mappings:Record<string,number>}) => string[]} [validate]  cross-field rules

const LAYOUT = { type: 'enum', values: ['carousel', 'grid'], default: 'carousel' };
const LIMIT = (def, max = 50) => ({ type: 'int', min: 1, max, default: def });
const CTA = { type: 'string', maxLength: 200, pattern: /^(\/|https:\/\/)[^\s<>"']*$/ };

/** @type {Record<string, object>} */
export const SECTION_DEFINITIONS = {
  HERO_CAROUSEL: {
    type: 'HERO_CAROUSEL', label: 'Hero carousel',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { autoplayMs: { type: 'int', min: 1000, max: 20000, default: 4000 } },
  },
  CATEGORY_GRID: {
    type: 'CATEGORY_GRID', label: 'Shop by category',
    mappings: [], usesProducts: false, usesCategories: true, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(24, 100) },
  },
  DUAL_CATEGORY_PAIR: {
    // Parent row carries visibility/order/theme; the left/right CHILD rows carry the category/subcategory mappings.
    type: 'DUAL_CATEGORY_PAIR', label: 'Dual category pair (Dual Deals / Discount Corner)',
    mappings: ['CATEGORY', 'SUBCATEGORY'], usesProducts: false, usesCategories: true, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: true,
    configSchema: { theme: { type: 'enum', values: ['dual', 'discount'], default: 'dual' } },
  },
  PRODUCT_CAROUSEL: {
    type: 'PRODUCT_CAROUSEL', label: 'Product carousel',
    mappings: ['PRODUCT', 'CATEGORY', 'GROUP'], usesProducts: true, usesCategories: false, supportsPagination: true,
    defaultLoad: 'DEFERRED', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 2500, isParent: false,
    configSchema: {
      source: { type: 'enum', values: ['MAPPED', 'SUPER_SAVER', 'NEW_ARRIVALS'], default: 'MAPPED' },
      limit: LIMIT(20),
      layout: LAYOUT,
      showSeeAll: { type: 'boolean', default: true },
      ctaLabel: { type: 'string', maxLength: 40 },
      ctaHref: CTA,
    },
    // Non-mapped sources are computed globally; admin mappings on them would be silently ignored.
    validate: ({ config, mappings }) => {
      const total = Object.values(mappings || {}).reduce((a, b) => a + (b || 0), 0);
      return config.source !== 'MAPPED' && total > 0
        ? [`source ${config.source} does not use mappings (found ${total}); remove them or set source to MAPPED`]
        : [];
    },
  },
  DEAL_CARDS: {
    type: 'DEAL_CARDS', label: 'Daily deals',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(10, 30) },
  },
  BRAND_GRID: {
    type: 'BRAND_GRID', label: 'Brand grid',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(50, 100) },
  },
  STORE_GRID: {
    type: 'STORE_GRID', label: 'Shop by store',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(20, 50) },
  },
  VIDEO_CARDS: {
    type: 'VIDEO_CARDS', label: 'Video cards',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(10, 30) },
  },
  BANNER_STRIP: {
    type: 'BANNER_STRIP', label: 'Banner strip',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { bannerType: { type: 'enum', values: ['promo', 'mega_sale'], default: 'promo' } },
  },
  PROMO_CARDS: {
    type: 'PROMO_CARDS', label: 'Small promo cards',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(8, 20) },
  },
  MOBILE_BANNERS: {
    type: 'MOBILE_BANNERS', label: 'Mobile banners',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(10, 30) },
  },
  TABBED_PRODUCTS: {
    // Tabs come from section_subcategory_mappings; per-tab products stay deferred (/productsroute/subcategory/:id).
    type: 'TABBED_PRODUCTS', label: 'Tabbed products (Mega Monsoon)',
    mappings: ['SUBCATEGORY'], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(12, 30) },
  },
  TESTIMONIALS: {
    type: 'TESTIMONIALS', label: 'Customer testimonials',
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['web', 'mobile'], ttlSec: 300, timeoutMs: 1500, isParent: false,
    configSchema: { limit: LIMIT(10, 30) },
  },
};

export const MAPPING_KINDS = ['PRODUCT', 'CATEGORY', 'GROUP', 'SUBCATEGORY'];
export const LOAD_MODES = ['AUTO', 'INITIAL', 'DEFERRED'];
export const PLATFORMS = ['web', 'mobile'];
