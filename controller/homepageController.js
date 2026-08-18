import redis from '../config/redis.js';
import productSectionDao from '../dao/product-section.dao.js';
import CategoryDAO from '../dao/category.dao.js';
import AddBannerDAO from '../dao/add-banner.dao.js';
import { SECTION_CACHE_KEYS } from '../lib/sectionCache.js';
import { CATEGORY_CACHE_KEYS, CATEGORY_CACHE_TTL } from '../lib/categoryCache.js';
import { BANNER_CACHE_KEYS, BANNER_CACHE_TTL } from '../lib/bannerCache.js';
import { getOrComputeSectionContent } from './productSectionController.js';

const SECTION_CACHE_TTL = parseInt(process.env.SECTION_CACHE_TTL || '300', 10);

// Each helper below is a read-through against the SAME Redis keys/TTLs the
// individual endpoints (product-sections/active, categories/hierarchy,
// banner/type/:type) already use — so this aggregation never creates a
// second, divergent cache entry, and existing write-side invalidation
// (categoryController, addBannerController, productSectionController) keeps
// bootstrap responses correct with zero additional invalidation code.

const getCachedActiveSections = async () => {
  const cached = await redis.get(SECTION_CACHE_KEYS.activeSections).catch(() => null);
  if (cached) return JSON.parse(cached).data || [];

  const data = await productSectionDao.list({ active: true });
  redis.setex(SECTION_CACHE_KEYS.activeSections, SECTION_CACHE_TTL, JSON.stringify({ success: true, data })).catch(() => {});
  return data;
};

const getCachedCategoriesHierarchy = async () => {
  const cacheKey = CATEGORY_CACHE_KEYS.hierarchy(true);
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached).categories || [];

  const categories = await CategoryDAO.getFullHierarchy(true);
  redis.setex(cacheKey, CATEGORY_CACHE_TTL, JSON.stringify({ success: true, categories, total: categories.length })).catch(() => {});
  return categories;
};

const getCachedBannersByType = async (type) => {
  const cacheKey = BANNER_CACHE_KEYS.byType(type);
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached).banners || [];

  const banners = await AddBannerDAO.getByType(type);
  redis.setex(cacheKey, BANNER_CACHE_TTL, JSON.stringify({ success: true, banners })).catch(() => {});
  return banners;
};

// GET /api/homepage/bootstrap?warehouse_id=&section_ids=1,2,3
//
// Aggregates everything the homepage needs on first load into one request:
// active sections, category hierarchy, hero banners, and full content for
// every requested section — collapsing what was previously ~11+ separate
// HTTP round-trips (product-sections/active, categories/*, banner/type/hero,
// and one product-sections/:id/content call per section) into one.
//
// Additive only: every individual endpoint this replaces keeps working
// unchanged for bbm-app and any other consumer that doesn't opt in.
export const getHomepageBootstrap = async (req, res) => {
  try {
    const warehouseIdInt = req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null;
    const requestedIds = req.query.section_ids
      ? String(req.query.section_ids)
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n))
      : null;

    const [sections, categories, heroBanners] = await Promise.all([
      getCachedActiveSections(),
      getCachedCategoriesHierarchy(),
      getCachedBannersByType('hero'),
    ]);

    // Default to every active section (matches the existing convention in
    // page.js, which already treats the full active-sections list as "the
    // homepage") unless the caller explicitly scopes it via section_ids.
    const targetIds = requestedIds && requestedIds.length > 0
      ? requestedIds
      : (sections || []).map((s) => s.id);

    const contentResults = await Promise.allSettled(
      targetIds.map(async (id) => {
        const result = await getOrComputeSectionContent(id, warehouseIdInt);
        return { id, data: result?.responseData || null };
      })
    );

    const sectionContent = {};
    contentResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value?.data) {
        sectionContent[r.value.id] = r.value.data;
      }
    });

    res.status(200).json({
      success: true,
      sections: sections || [],
      categories: categories || [],
      banners: { hero: heroBanners || [] },
      sectionContent,
    });
  } catch (error) {
    console.error('Error building homepage bootstrap:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
