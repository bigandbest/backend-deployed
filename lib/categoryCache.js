export const CATEGORY_CACHE_TTL = parseInt(process.env.CATEGORY_CACHE_TTL || '300', 10);

export const CATEGORY_CACHE_KEYS = {
  hierarchy:                (activeOnly) => `categories:hierarchy:${activeOnly}`,
  allWithSubcats:           'categories:all-with-subcategories',
  bySectionSubcategories:   (sectionKey) => `categories:section:${sectionKey}:subcategories`,
  bySectionCategories:      (sectionKey) => `categories:section:${sectionKey}:categories`,
};

// These two additionally depend on section-mapping writes, which live in a
// different controller (sectionMappingController.js) and don't invalidate
// this key namespace — TTL bounds staleness instead of wiring cross-controller
// invalidation for a rarely-changed relationship. Matches CATEGORY_CACHE_TTL:
// admin-curated mapping data doesn't need a shorter window than categories
// themselves get, and a too-short TTL just means real page loads keep paying
// the full DB cost instead of getting cache hits (measured: 60s expired
// between almost every homepage load in practice, worse than useless).
export const CATEGORY_SECTION_CACHE_TTL = parseInt(process.env.CATEGORY_SECTION_CACHE_TTL || '300', 10);
