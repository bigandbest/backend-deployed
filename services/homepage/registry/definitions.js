// Section type declarations — DATA ONLY (no IO, no endpoints, no React).
//
// THIS FILE IS THE SINGLE CAPABILITY DEFINITION for a section type. Everything else derives from it:
//   • admin UI            → GET /product-sections/meta/types (describeTypes): mapping buttons, config form, contract text
//   • admin write API     → assertMappingAllowed / validateSection: mapping endpoints reject kinds a type does not allow
//   • feed assembly       → platform eligibility, load mode, batching of product selection, `renderer` in every view
//   • resolvers           → RESOLVERS must implement exactly the types declared here (enforced by a unit test)
// Adding a section type = add one entry here + one resolver; no other capability table exists.
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
// @property {boolean}  supportsPagination "See All" is served by GET /product-sections/:id/products (shared selection)
// @property {string[]} platforms        platforms the type can render on
// @property {number}   ttlSec           Redis TTL of a resolved section view
// @property {number}   timeoutMs        per-resolver budget (4000ms across the board: measured round-trip to a
//                        remote/pooled Postgres can be 1-2.5s alone, and this server runs several background
//                        cron workers sharing the same small connection pool, so a tight budget raced every
//                        genuine query away before it could ever finish and warm any cache)
// @property {boolean}  isParent         has left/right children (pair sections)
// @property {string}   renderer         stable renderer key clients map to a visual component (visual choice only)
// @property {'OMIT'}   emptyBehavior    no data => status EMPTY => the section is omitted from the feed. No fallback data.
// @property {'ISOLATE'} errorBehavior   a resolver failure marks only that type's sections ERROR; the feed still succeeds
// @property {'ANNOTATE'|'NONE'} availability  ANNOTATE: pincode adds availability flags to products, never filters them
// @property {string}   source           where the data comes from (documentation surfaced in the admin UI)
// @property {string}   selection        the selection rule (documentation surfaced in the admin UI)
// @property {string}   ordering         the ordering rule (documentation surfaced in the admin UI)
// @property {(ctx:{config:object, mappings:Record<string,number>}) => string[]} [validate]  cross-field rules

const LAYOUT = { type: 'enum', values: ['carousel', 'grid', 'two-rows'], default: 'carousel' };
const LIMIT = (def, max = 50) => ({ type: 'int', min: 1, max, default: def });
const CTA = { type: 'string', maxLength: 200, pattern: /^(\/|https:\/\/)[^\s<>"']*$/ };

// Shared defaults for the contract fields every type must state.
const CONTRACT = { emptyBehavior: 'OMIT', errorBehavior: 'ISOLATE', availability: 'NONE', timeoutMs: 4000, ttlSec: 300 };
const BOTH = ['web', 'mobile'];

/** @type {Record<string, object>} */
export const SECTION_DEFINITIONS = {
  HERO_CAROUSEL: {
    type: 'HERO_CAROUSEL', label: 'Hero carousel', renderer: 'hero-carousel', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: BOTH, isParent: false,
    source: 'add_banner rows with banner_type = hero (not marked inactive)',
    selection: 'All hero banners. There is no fallback to other banner types.',
    ordering: 'updated_at DESC, id ASC',
    configSchema: { autoplayMs: { type: 'int', min: 1000, max: 20000, default: 4000 } },
  },
  CATEGORY_GRID: {
    // DECISION (product owner, 2026-09-23): Shop By Category is controlled by the Category Mapping page.
    // Only mapped, active subcategories (and their active parent categories) are shown.
    type: 'CATEGORY_GRID', label: 'Shop by category', renderer: 'category-grid', ...CONTRACT,
    mappings: ['SUBCATEGORY'], usesProducts: false, usesCategories: true, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: BOTH, isParent: false,
    source: 'section_subcategory_mappings (is_active) → active subcategories → their active categories',
    selection: 'Only mapped subcategories; a category appears only if at least one of its subcategories is mapped. No mapping = section omitted.',
    ordering: 'categories by name; subcategories by sort_order, name',
    configSchema: { limit: LIMIT(24, 100) },
  },
  DUAL_CATEGORY_PAIR: {
    // Parent row carries visibility/order/theme; the left/right CHILD rows carry the category/subcategory mappings.
    type: 'DUAL_CATEGORY_PAIR', label: 'Dual category pair (Dual Deals / Discount Corner)', renderer: 'dual-category-pair', ...CONTRACT,
    mappings: ['CATEGORY', 'SUBCATEGORY'], usesProducts: false, usesCategories: true, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: BOTH, isParent: true,
    source: 'product_section_categories of the left and right child rows (active categories only)',
    selection: 'Explicit category mappings of each side. Both sides empty = section omitted.',
    ordering: 'categories by name',
    configSchema: { theme: { type: 'enum', values: ['dual', 'discount'], default: 'dual' } },
  },
  PRODUCT_CAROUSEL: {
    type: 'PRODUCT_CAROUSEL', label: 'Product carousel', renderer: 'product-carousel', ...CONTRACT,
    mappings: ['PRODUCT', 'CATEGORY', 'GROUP'], usesProducts: true, usesCategories: false, supportsPagination: true,
    defaultLoad: 'DEFERRED', platforms: BOTH, isParent: false, availability: 'ANNOTATE',
    source: 'config.source: MAPPED (admin mappings) | SUPER_SAVER (global, cheapest first) | NEW_ARRIVALS (global, newest first)',
    selection: 'MAPPED = pinned products, then products of mapped groups (a group = ALL active products of the group\'s subcategory), then products of mapped categories; de-duplicated; only active products with an active variant. Nothing mapped = section omitted.',
    ordering: 'pins by display_order, id; then group- and category-derived by created_at DESC, id',
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
    type: 'DEAL_CARDS', label: 'Daily deals', renderer: 'deal-cards', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: BOTH, isParent: false,
    source: 'daily_deals (active)', selection: 'All active deals up to limit.', ordering: 'sort_order, id',
    configSchema: { limit: LIMIT(10, 30) },
  },
  BRAND_GRID: {
    type: 'BRAND_GRID', label: 'Brand grid', renderer: 'brand-grid', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: BOTH, isParent: false,
    source: 'brand (active)', selection: 'All active brands up to limit.', ordering: 'name',
    configSchema: { limit: LIMIT(50, 100) },
  },
  BRAND_PARTNERS: {
    type: 'BRAND_PARTNERS', label: 'Brand partners', renderer: 'brand-partners', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: ['web'], isParent: false,
    source: 'partners (active) — managed on the Partners admin page', selection: 'All active partners up to limit.', ordering: 'sort_order ASC, name ASC, id ASC',
    configSchema: { limit: LIMIT(20, 50) },
  },
  STORE_GRID: {
    type: 'STORE_GRID', label: 'Shop by store', renderer: 'store-grid', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'INITIAL', platforms: BOTH, isParent: false,
    source: 'recommended_store (active)', selection: 'All active stores up to limit.', ordering: 'name',
    configSchema: { limit: LIMIT(20, 50) },
  },
  VIDEO_CARDS: {
    type: 'VIDEO_CARDS', label: 'Video cards', renderer: 'video-cards', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: BOTH, isParent: false,
    source: 'video_cards (active) + the active "mega" banner', selection: 'All active videos up to limit.', ordering: 'position',
    configSchema: { limit: LIMIT(10, 30) },
  },
  BANNER_STRIP: {
    type: 'BANNER_STRIP', label: 'Banner strip', renderer: 'banner-strip', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: BOTH, isParent: false,
    source: 'config.bannerType: promo (add_banner) | mega_sale (promo_banners)', selection: 'All active banners of the configured type.', ordering: 'source table order',
    configSchema: { bannerType: { type: 'enum', values: ['promo', 'mega_sale'], default: 'promo' } },
  },
  PROMO_CARDS: {
    type: 'PROMO_CARDS', label: 'Small promo cards', renderer: 'promo-cards', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: BOTH, isParent: false,
    source: 'small_promo_cards (active)', selection: 'All active cards up to limit.', ordering: 'display_order',
    configSchema: { limit: LIMIT(8, 20) },
  },
  MOBILE_BANNERS: {
    type: 'MOBILE_BANNERS', label: 'Mobile banners', renderer: 'mobile-banners', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: ['mobile'], isParent: false,
    source: 'add_banner rows flagged is_mobile', selection: 'All active mobile banners up to limit.', ordering: 'updated_at DESC, id',
    configSchema: { limit: LIMIT(10, 30) },
  },
  TABBED_PRODUCTS: {
    // Tabs come from section_subcategory_mappings; per-tab products stay deferred (/productsroute/subcategory/:id).
    type: 'TABBED_PRODUCTS', label: 'Tabbed products (Mega Monsoon)', renderer: 'tabbed-products', ...CONTRACT,
    mappings: ['SUBCATEGORY'], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: BOTH, isParent: false,
    source: 'section_subcategory_mappings (is_active) → active subcategories (one tab each)',
    selection: 'Mapped active subcategories become tabs; each tab\'s products load on demand.',
    ordering: 'mapping display_order, id',
    configSchema: { limit: LIMIT(12, 30) },
  },
  TESTIMONIALS: {
    type: 'TESTIMONIALS', label: 'Customer testimonials', renderer: 'testimonials', ...CONTRACT,
    mappings: [], usesProducts: false, usesCategories: false, supportsPagination: false,
    defaultLoad: 'DEFERRED', platforms: BOTH, isParent: false,
    source: 'customer_testimonials (active)', selection: 'All active testimonials up to limit.', ordering: 'sort_order, created_at DESC',
    configSchema: { limit: LIMIT(10, 30) },
  },
};

export const MAPPING_KINDS = ['PRODUCT', 'CATEGORY', 'GROUP', 'SUBCATEGORY'];
export const LOAD_MODES = ['AUTO', 'INITIAL', 'DEFERRED'];
export const PLATFORMS = ['web', 'mobile'];
