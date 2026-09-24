import productSectionDao from "../dao/product-section.dao.js";
import productSectionProductDao from "../dao/product-section-product.dao.js";
import productSectionCategoryDao from "../dao/product-section-category.dao.js";
import productGridSettingDao from "../dao/product-grid-setting.dao.js";
import productSectionGroupDao from "../dao/product-section-group.dao.js";
import storeSectionMappingDao from "../dao/store-section-mapping.dao.js";
import videoCardDao from "../dao/video-card.dao.js";
import brandDao from "../dao/brand.dao.js";
import prisma from '../config/prisma.js';
import cartAvailabilityDAO from '../dao/cart-availability.dao.js';
import productDAO from '../dao/product.dao.js';
import redis from '../config/redis.js';
import { describeTypes, getDefinition, homepageEligibility } from '../services/homepage/registry/index.js';
import { validateConfig } from '../services/homepage/registry/schema.js';
import { selectForSection, selectProducts, MAX_SECTION_SELECTION } from '../services/homepage/entities/ProductSelectionBatch.js';
import { createPinService } from '../services/homepage/PinService.js';
import { createSectionOrderService } from '../services/homepage/SectionOrderService.js';
import { loadMappableSection, assertIdsExist, assertUuid, parseSectionId } from '../services/homepage/MappingGuard.js';
import { isMappingRequestError, errorBody } from '../services/homepage/errors.js';
import { createSectionService, SectionValidationError } from '../services/homepage/SectionService.js';
import { SECTION_CACHE_KEYS as CACHE_KEYS, invalidateSectionCache } from '../lib/sectionCache.js';

const sectionService = createSectionService({ prisma });
const pinService = createPinService({ prisma });
const sectionOrderService = createSectionOrderService({ prisma });

// Typed errors -> deterministic 4xx; anything else is a genuine 500.
const fail = (res, error, label) => {
  if (isMappingRequestError(error)) return res.status(error.status).json(errorBody(error));
  console.error(`Error ${label}:`, error);
  return res.status(500).json({ error: "Internal server error" });
};
const actorOf = (req) => ({ id: req.user?.id ?? req.user?.userId, role: req.user?.role });

const SECTION_CACHE_TTL = parseInt(process.env.SECTION_CACHE_TTL || '300', 10);

// Create a product section
export const createProductSection = async (req, res) => {
  try {
    const { section_key, section_name, is_active = true, display_order = 0 } = req.body;

    if (!section_key || !section_name) {
      return res.status(400).json({ error: "section_key and section_name are required" });
    }

    const existing = await prisma.product_sections.findUnique({
      where: { section_key },
    });

    if (existing) {
      return res.status(200).json({ success: true, section: existing, message: "Section already exists" });
    }

    const section = await prisma.product_sections.create({
      data: { section_key, section_name, is_active, display_order },
    });

    res.status(201).json({ success: true, section });
  } catch (error) {
    console.error("Error creating product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all product sections. Each row carries `homepage` = { eligible, reasons, platforms }: the SAME rule the feed applies
// (registry/homepageEligibility), so the admin never shows a section as visible when the homepage would not render it.
export const getAllProductSections = async (req, res) => {
  try {
    const cacheKey = CACHE_KEYS.allSections;
    let sections;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) sections = JSON.parse(cached);
    else {
      sections = await productSectionDao.list();
      redis.setex(cacheKey, SECTION_CACHE_TTL, JSON.stringify(sections)).catch(() => {});
    }
    const byId = new Map(sections.map((s) => [s.id, s]));
    const data = sections.map((s) => ({
      ...s,
      homepage: homepageEligibility(s, { parent: s.parent_section_id != null ? byId.get(s.parent_section_id) : null }),
    }));
    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    console.error("Error fetching product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getSectionCounts = async (req, res) => {
  try {
    const data = await productSectionDao.getSectionCounts();
    // Live products = what shoppers actually see. A mapped group expands to every active product of its subcategory,
    // so pins + group-mapping rows badly understate it. Same selector as the feed / See-All (one batched pass).
    const mappedIds = [...new Set([
      ...Object.keys(data.products), ...Object.keys(data.groups), ...Object.keys(data.categories),
    ])].map(Number);
    const selected = await selectProducts(prisma, mappedIds.map((id) => ({ id, source: 'MAPPED', limit: MAX_SECTION_SELECTION })));
    data.live = Object.fromEntries([...selected].map(([id, ids]) => [id, ids.length]));
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching section counts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get single product section by ID
export const getProductSectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const sectionId = parseInt(id);
    const cacheKey = CACHE_KEYS.sectionById(sectionId);

    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const data = await productSectionDao.getById(sectionId);
    if (!data) return res.status(404).json({ error: "Product section not found" });

    const payload = { success: true, data };
    redis.setex(cacheKey, SECTION_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
    res.status(200).json(payload);
  } catch (error) {
    console.error("Error fetching product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product section (allow-list + registry validation + audit; see services/homepage/SectionService.js)
export const updateProductSection = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await sectionService.updateSection(id, req.body || {}, actorOf(req));
    if (!data) return res.status(404).json({ error: "Product section not found" });

    invalidateSectionCache(id);

    res.status(200).json({
      success: true,
      data,
      message: "Product section updated successfully",
    });
  } catch (error) {
    if (error instanceof SectionValidationError) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: error.message, details: error.errors } });
    }
    console.error("Error updating product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Toggle section active status
export const toggleSectionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await productSectionDao.getStatusById(parseInt(id));

    if (!section) {
      return res.status(404).json({ error: "Product section not found" });
    }

    const newStatus = !section.is_active;
    const data = await productSectionDao.update(parseInt(id), { is_active: newStatus });

    invalidateSectionCache(parseInt(id));
    sectionService.audit(parseInt(id), 'SECTION_TOGGLED', { is_active: { from: section.is_active, to: newStatus } }, actorOf(req));

    res.status(200).json({
      success: true,
      data,
      message: `Section ${newStatus ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Error toggling section status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Reorder sections. Body: { sections: [{ id, display_order? }] } (ids in the desired order, or with positions).
// Validated (unknown/duplicate ids -> 400), atomic (single transaction), slot-preserving so rows the client did not
// send (e.g. hidden ones) keep their place, and always leaves a dense 1..N order. Response carries the full new order.
export const updateSectionOrder = async (req, res) => {
  try {
    const order = await sectionOrderService.reorderSections(req.body?.sections, actorOf(req));
    redis.del(CACHE_KEYS.allSections).catch(() => {});
    redis.del(CACHE_KEYS.activeSections).catch(() => {});
    res.status(200).json({ success: true, message: "Section order updated successfully", data: order });
  } catch (error) {
    fail(res, error, "updating section order");
  }
};

// Registry metadata for the admin form (types, allowed mappings, config schema)
export const getSectionTypes = (req, res) => {
  res.status(200).json({ success: true, data: describeTypes() });
};

// Recent audit entries for one section
export const getSectionAuditLog = async (req, res) => {
  try {
    const rows = await prisma.section_audit_log.findMany({
      where: { section_id: parseInt(req.params.id) },
      orderBy: { created_at: 'desc' },
      take: Math.min(parseInt(req.query.limit) || 50, 200),
    });
    res.status(200).json({ success: true, data: rows.map((r) => ({ ...r, id: String(r.id) })) });
  } catch (error) {
    console.error("Error fetching section audit log:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== PRODUCT-SECTION ASSIGNMENT FUNCTIONS ==========

// Pin products to a section (idempotent; already pinned products keep their position).
export const addProductsToSection = async (req, res) => {
  try {
    const section = await loadMappableSection(prisma, req.params.id, 'PRODUCT');
    const { data, added, alreadyMapped } = await pinService.pin(section.id, req.body?.product_ids);
    invalidateSectionCache(section.id).catch(() => {});
    res.status(200).json({
      success: true,
      data,
      added: added.length,
      already_mapped: alreadyMapped.length,
      message: `${added.length} product(s) added to section successfully`,
    });
  } catch (error) {
    fail(res, error, "adding products to section");
  }
};

// Unpin a product. Idempotent and deterministic: 200 with removed = 1 (was pinned) or 0 (was not pinned).
export const removeProductFromSection = async (req, res) => {
  try {
    const sectionId = parseSectionId(req.params.id);
    const { removed } = await pinService.unpin(sectionId, req.params.productId);
    invalidateSectionCache(sectionId).catch(() => {});
    res.status(200).json({
      success: true,
      removed,
      message: removed ? "Product removed from section successfully" : "Product was not mapped to this section",
    });
  } catch (error) {
    fail(res, error, "removing product from section");
  }
};

// Compute stock from pre-loaded variant inventory — no extra DB round-trip
const computeStockFromVariants = (variants = []) => {
  return variants
    .filter(v => v.active !== false)
    .reduce((sum, v) => {
      const adminStock = (v.inventory || []).reduce(
        (s, inv) => s + Math.max((inv.stock_qty || 0) - (inv.reserved_qty || 0), 0), 0
      );
      const sellerStock = (v.seller_products || [])
        .filter(sp => sp.status === 'APPROVED' && sp.is_active !== false)
        .reduce((s, sp) => s + Math.max((sp.stock_quantity || 0) - (sp.reserved_quantity || 0), 0), 0);
      return sum + adminStock + sellerStock;
    }, 0);
};

// Products of a section — used by the admin "Manage products" panel and by storefront "See All".
// The list comes from the SAME selection service as the homepage feed (entities/ProductSelectionBatch.selectForSection):
// pins -> group products -> category products (MAPPED), or the section's global source (SUPER_SAVER / NEW_ARRIVALS).
// There is NO fallback: nothing mapped => an empty list, exactly like the feed. `meta.homepageLimit` is how many the
// homepage shows; this endpoint returns the whole selection (paginated) so admin/See-All can see the rest.
// With no `sort`, the selection order is kept; `sort`/price/brand filters are applied by the database on the selected ids.
export const getProductsInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 24, sort, minPrice, maxPrice, brand } = req.query;
    const pageInt = Math.max(1, parseInt(page) || 1);
    const limitInt = Math.min(100, Math.max(1, parseInt(limit) || 24));
    const offset = (pageInt - 1) * limitInt;
    const emptyPayload = (meta = {}) => ({
      success: true, data: [], pagination: { page: pageInt, limit: limitInt, total: 0, totalPages: 0, isLastPage: true }, meta,
    });

    // Accept numeric ID or string section_key
    const numeric = /^\d+$/.test(String(id));
    const section = await prisma.product_sections.findUnique({
      where: numeric ? { id: parseSectionId(id) } : { section_key: String(id) },
      select: { id: true, section_key: true, section_type: true, config: true },
    });
    if (!section) {
      if (numeric) return res.status(404).json({ success: false, error: { code: 'SECTION_NOT_FOUND', message: 'Product section not found' } });
      return res.status(200).json(emptyPayload());
    }

    const def = section.section_type ? getDefinition(section.section_type) : null;
    if (!def || !def.usesProducts) {
      return res.status(200).json(emptyPayload({ reason: 'SECTION_DOES_NOT_USE_PRODUCTS', sectionType: section.section_type }));
    }
    const cfg = validateConfig(def.configSchema, section.config).value ?? {};
    const meta = { source: cfg.source, homepageLimit: cfg.limit };

    const priceFilter = {};
    const minPriceF = minPrice ? parseFloat(minPrice) : NaN;
    const maxPriceF = maxPrice ? parseFloat(maxPrice) : NaN;
    if (!isNaN(minPriceF)) priceFilter.gte = minPriceF;
    if (!isNaN(maxPriceF) && maxPriceF < 50000) priceFilter.lte = maxPriceF;
    const extraWhere = {
      ...(Object.keys(priceFilter).length > 0 && { price: priceFilter }),
      ...(brand && { brand_name: brand }),
    };
    const orderByMap = {
      lowest_price:   { price: 'asc' },
      highest_price:  { price: 'desc' },
      highest_rating: { rating: 'desc' },
      newest:         { created_at: 'desc' },
    };
    const dbOrder = sort && orderByMap[sort] ? orderByMap[sort] : null;
    const useDb = Object.keys(extraWhere).length > 0 || !!dbOrder;

    const cacheKey = useDb ? null : `${CACHE_KEYS.sectionProducts(section.id)}:p${pageInt}:l${limitInt}`;
    if (cacheKey) {
      const cachedRaw = await redis.get(cacheKey).catch(() => null);
      if (cachedRaw) return res.status(200).json(JSON.parse(cachedRaw));
    }

    const selectedIds = await selectForSection(prisma, { id: section.id, source: cfg.source });

    const productInclude = {
      variants: {
        where: { active: true },
        include: {
          inventory: { select: { stock_qty: true, reserved_qty: true } },
          seller_products: {
            where: { status: 'APPROVED', is_active: true },
            select: { stock_quantity: true, reserved_quantity: true, status: true, is_active: true },
          },
        },
      },
      media: { where: { is_primary: true }, take: 1, select: { url: true } },
      brands: { select: { brand: { select: { name: true } } }, take: 1 },
      category: { select: { id: true, name: true } },
    };

    let products = [];
    let total = selectedIds.length;
    if (selectedIds.length > 0) {
      if (useDb) {
        const where = { id: { in: selectedIds }, ...extraWhere };
        const [rows, count] = await Promise.all([
          prisma.products.findMany({ where, include: productInclude, skip: offset, take: limitInt, orderBy: dbOrder || { created_at: 'desc' } }),
          prisma.products.count({ where }),
        ]);
        products = rows;
        total = count;
      } else {
        const pageIds = selectedIds.slice(offset, offset + limitInt);
        if (pageIds.length) {
          const rows = await prisma.products.findMany({ where: { id: { in: pageIds } }, include: productInclude });
          const byId = new Map(rows.map((r) => [r.id, r]));
          products = pageIds.map((pid) => byId.get(pid)).filter(Boolean); // keep the selection order
        }
      }
    }

    // Which of these are direct pins (removable in the admin panel) vs derived from a group/category/global source.
    const pinnedRows = products.length
      ? await prisma.product_section_products.findMany({ where: { section_id: section.id, product_id: { in: products.map((p) => p.id) } }, select: { product_id: true } })
      : [];
    const pinnedIds = new Set(pinnedRows.map((r) => r.product_id));

    // Compute stock inline — no extra DB call needed
    const baseProducts = products.map(p => {
      const stockQty = computeStockFromVariants(p.variants);
      const activeVariants = (p.variants || []).filter(v => v.active !== false);
      const priceVariant = activeVariants.find(v => v.is_default === true) || activeVariants[0];
      return {
        id: p.id,
        pinned: pinnedIds.has(p.id),
        name: p.name,
        price: p.price ?? priceVariant?.price ?? null,
        old_price: p.old_price ?? priceVariant?.old_price ?? null,
        discount: p.discount,
        rating: p.rating,
        review_count: p.review_count,
        brand_name: p.brands?.[0]?.brand?.name || p.brand_name || "",
        category: p.category?.name || p.category_name || "",
        category_id: p.category_id,
        uom: p.uom,
        created_at: p.created_at,
        image: p.image || p.media?.[0]?.url || "",
        media: p.media || [],
        variants: p.variants || [],
        stock: stockQty,
        inStock: stockQty > 0,
      };
    });

    const totalPages = total > 0 ? Math.ceil(total / limitInt) : 0;
    const payload = {
      success: true,
      data: baseProducts,
      pagination: { page: pageInt, limit: limitInt, total, totalPages, isLastPage: pageInt >= totalPages },
      meta,
    };

    if (cacheKey) redis.setex(cacheKey, SECTION_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
    res.status(200).json(payload);
  } catch (error) {
    fail(res, error, "fetching products in section");
  }
};

// Reorder pinned products. Body: { products: [{ product_id, display_order? }] } — atomic, validated, dense 1..N.
export const updateProductOrderInSection = async (req, res) => {
  try {
    const sectionId = parseSectionId(req.params.id);
    const order = await pinService.reorder(sectionId, req.body?.products);
    invalidateSectionCache(sectionId).catch(() => {});
    res.status(200).json({ success: true, message: "Product order updated successfully", data: order });
  } catch (error) {
    fail(res, error, "updating product order");
  }
};

// Get sections for a specific product
export const getSectionsForProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const data = await productSectionProductDao.listByProduct(productId);

    const sections = data.map(item => ({
      assignment_id: item.id,
      display_order: item.display_order,
      ...item.product_sections
    }));

    res.status(200).json({ success: true, data: sections });
  } catch (error) {
    console.error("Error fetching sections for product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== CATEGORY-SECTION MAPPING FUNCTIONS ==========

// Sync categories for a section (replace all). An empty array clears the mapping.
export const syncCategoriesInSection = async (req, res) => {
  try {
    const { category_ids } = req.body || {};
    if (!Array.isArray(category_ids)) return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'category_ids array is required' } });
    const section = await loadMappableSection(prisma, req.params.id, 'CATEGORY');
    const ids = category_ids.length ? await assertIdsExist(prisma, 'categories', category_ids, 'category_ids') : [];
    await productSectionCategoryDao.sync(section.id, ids);
    invalidateSectionCache(section.id).catch(() => {});
    res.status(200).json({ success: true, message: `Section categories synced successfully. ${ids.length} categories mapped.` });
  } catch (error) {
    fail(res, error, "syncing categories to section");
  }
};

// Add categories to a section (idempotent).
export const addCategoriesToSection = async (req, res) => {
  try {
    const section = await loadMappableSection(prisma, req.params.id, 'CATEGORY');
    const ids = await assertIdsExist(prisma, 'categories', req.body?.category_ids, 'category_ids');
    const data = await productSectionCategoryDao.addMany(ids.map((category_id) => ({ section_id: section.id, category_id })));
    invalidateSectionCache(section.id).catch(() => {});
    res.status(200).json({
      success: true,
      data,
      message: `${data.length} category/categories mapped to section successfully`,
    });
  } catch (error) {
    fail(res, error, "adding categories to section");
  }
};

// Remove a category from a section (idempotent).
export const removeCategoryFromSection = async (req, res) => {
  try {
    const sectionId = parseSectionId(req.params.id);
    const categoryId = assertUuid(req.params.categoryId, 'categoryId');
    const r = await productSectionCategoryDao.remove(sectionId, categoryId);
    invalidateSectionCache(sectionId).catch(() => {});
    res.status(200).json({ success: true, removed: r.count, message: "Category removed from section successfully" });
  } catch (error) {
    fail(res, error, "removing category from section");
  }
};

// Get all categories mapped to a section
export const getCategoriesInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await productSectionCategoryDao.listBySection(parseInt(id));

    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    console.error("Error fetching categories in section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== GROUP-SECTION MAPPING (product_section_groups — feeds MAPPED PRODUCT_CAROUSEL sections
// alongside direct product pins: every active product in the group's subcategory) ==========

// Get all groups mapped to a section
export const getGroupsInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await productSectionGroupDao.listBySection(parseInt(id));

    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    console.error("Error fetching groups in section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add groups to a section (idempotent). Group semantics: a mapped group contributes ALL active products of the group's
// SUBCATEGORY (see entities/ProductSelectionBatch.js) — groups sharing a subcategory select the same set.
export const addGroupsToSection = async (req, res) => {
  try {
    const section = await loadMappableSection(prisma, req.params.id, 'GROUP');
    const ids = await assertIdsExist(prisma, 'groups', req.body?.group_ids, 'group_ids');
    const data = await productSectionGroupDao.createMany(ids.map((group_id) => ({ section_id: section.id, group_id })));
    invalidateSectionCache(section.id).catch(() => {});
    res.status(200).json({
      success: true,
      data,
      message: `${data.length} group(s) mapped to section successfully`,
    });
  } catch (error) {
    fail(res, error, "adding groups to section");
  }
};

// Remove a group from a section (idempotent).
export const removeGroupFromSection = async (req, res) => {
  try {
    const sectionId = parseSectionId(req.params.id);
    const groupId = assertUuid(req.params.groupId, 'groupId');
    const existing = await productSectionGroupDao.findBySectionAndGroup(sectionId, groupId);
    if (existing) await productSectionGroupDao.delete(existing.id);
    invalidateSectionCache(sectionId).catch(() => {});
    res.status(200).json({ success: true, removed: existing ? 1 : 0, message: "Group removed from section successfully" });
  } catch (error) {
    fail(res, error, "removing group from section");
  }
};

// Get sections for a specific category
export const getSectionsForCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const data = await productSectionCategoryDao.listByProductCategory(categoryId);

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching sections for category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== GRID SETTINGS FUNCTIONS (Merged from productGridSettingsController.js) ==========

export const getProductGridSettings = async (req, res) => {
  try {
    const settings = await productGridSettingDao.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Error fetching grid settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProductGridSettings = async (req, res) => {
  try {
    const { is_visible } = req.body;
    const settings = await productGridSettingDao.updateSettings(is_visible);
    res.status(200).json({
      success: true,
      data: settings,
      message: "Product grid settings updated successfully",
    });
  } catch (error) {
    console.error("Error updating grid settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get full content for a single section (Lazy Loading)
// Section content is cached in full (unfiltered) — subcategory/search/pagination
// are applied in-memory on every request instead of being baked into the cache
// key, so "See All" filtering stays cheap without invalidating the section cache.
const filterAndPaginateProducts = (products, { subcategory_id, q, page = 1, limit = 24 }) => {
  let list = Array.isArray(products) ? products : [];
  if (subcategory_id) {
    list = list.filter(p => p.subcategory_id === subcategory_id);
  }
  if (q) {
    const needle = String(q).trim().toLowerCase();
    if (needle) list = list.filter(p => (p.name || '').toLowerCase().includes(needle));
  }
  const pageInt = Math.max(1, parseInt(page) || 1);
  const limitInt = Math.max(1, parseInt(limit) || 24);
  const total = list.length;
  const start = (pageInt - 1) * limitInt;
  const paged = list.slice(start, start + limitInt);
  return { paged, total, page: pageInt, limit: limitInt, hasMore: start + limitInt < total };
};

// Cache key excludes pincode — availability is enriched per-item via Redis in checkBulkAvailability
// v2: cache key bumped when bulk_pricing_tiers was added to productInclude, so stale
// pre-tiers payloads don't get served to clients expecting the new field.
export const getSectionContentCacheKey = (sectionId, warehouseIdInt) =>
  `section:${sectionId}:wh${warehouseIdInt || 0}:v2`;

// Compute a section's full content from the DB and populate its Redis cache.
// Returns { responseData, realProductIds } — realProductIds marks which items in
// responseData.products are actual products (vs. videos/banners/brand cards) so
// callers can scope per-pincode availability enrichment correctly on a fresh compute.
const computeAndCacheSectionContent = async (sectionId, warehouseIdInt) => {
  // 1. Fetch section metadata + all mapping tables in parallel
  const [section, groupMappings, storeMappings, categoryMappings] = await Promise.all([
    productSectionDao.getById(sectionId),
    productSectionGroupDao.listBySection(sectionId),
    storeSectionMappingDao.getStoreMappingsBySection
      ? storeSectionMappingDao.getStoreMappingsBySection(sectionId)
      : Promise.resolve([]),
    productSectionCategoryDao.listBySection(sectionId),
  ]);

  if (!section) return null;

  const groupIds = groupMappings?.map(m => m.group_id) ?? [];
  const storeIds = storeMappings?.map(m => m.store_id) ?? [];
  const categoryIds = categoryMappings?.map(m => m.category_id) ?? [];

  // 2. Parallel: fetch group details, store products, category products, and special components
  //    (Group products need subcategoryIds from group details, so groups are fetched here
  //    and group products are fetched in step 3 — store/category/special run fully in parallel)
  const productInclude = {
    variants: {
      where: { active: true, is_default: true },
      include: { bulk_pricing_tiers: { orderBy: { min_quantity: 'asc' } } },
    },
    media: { where: { is_primary: true }, take: 1 },
    brands: { include: { brand: true } },
  };

  const isVideos = section.component_name === 'VideoCardSection';
  const isBanners = ['PromoBanner', 'DynamicMegaSale'].includes(section.component_name) || section.section_key.includes('banner');
  const isBrands = section.component_name === 'BrandVista';

  const [groups, storeProducts, categoryProducts, videos, banners, brandsResult] = await Promise.all([
    groupIds.length
      ? prisma.groups.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true, image_url: true, subcategory_id: true } })
      : Promise.resolve([]),
    storeIds.length
      ? prisma.products.findMany({ where: { store_id: { in: storeIds }, active: true }, include: productInclude, take: 100 })
      : Promise.resolve([]),
    categoryIds.length
      ? prisma.products.findMany({ where: { category_id: { in: categoryIds }, active: true }, include: productInclude, take: 100 })
      : Promise.resolve([]),
    isVideos ? videoCardDao.getActive() : Promise.resolve([]),
    isBanners ? prisma.promo_banners.findMany({ where: { active: true } }) : Promise.resolve([]),
    isBrands ? brandDao.listBrands({ limit: 50 }) : Promise.resolve({ items: [] }),
  ]);

  // 3. Fetch group products (depends on subcategoryIds from step 2 groups query)
  const subcategoryIds = groups.map(g => g.subcategory_id).filter(Boolean);
  const groupProducts = subcategoryIds.length
    ? await prisma.products.findMany({
        where: { subcategory_id: { in: subcategoryIds }, active: true },
        include: productInclude,
        take: 100,
      })
    : [];

  // 4. Build mappedContent + deduplicate products using Map (prevents duplicate inventory calls)
  const productMap = new Map();
  const mappedContent = {};

  if (groupIds.length > 0) {
    const subcatProductsMap = {};
    // Single forEach: build productMap + subcatProductsMap simultaneously
    groupProducts.forEach(p => {
      productMap.set(p.id, p);
      (subcatProductsMap[p.subcategory_id] ??= []).push(p);
    });
    const groupInfoMap = new Map(groups.map(g => [g.id, g]));
    mappedContent.groups = groupMappings.map(m => {
      const g = groupInfoMap.get(m.group_id) || {};
      return {
        id: g.id,
        name: g.name || m.group_name,
        image_url: g.image_url || m.image_url,
        // preview_products populated after enrichment below
        _subcatId: g.subcategory_id,
      };
    });
  }

  if (storeIds.length > 0) {
    storeProducts.forEach(p => productMap.set(p.id, p));
    mappedContent.stores = storeMappings.map(m => m.recommended_store);
  }

  categoryProducts.forEach(p => productMap.set(p.id, p));

  // Track real product IDs BEFORE pushing special items (for availability filter)
  const realProductIds = new Set(productMap.keys());

  // 5. Inventory enrichment + single map pass — stock fields transformation
  let products = Array.from(productMap.values());
  if (products.length > 0) {
    products = await productDAO.enrichProductsWithInventory(products, warehouseIdInt);
    products = products.map(p => {
      const hasInventory = p.stock_info != null || p.stock_quantity != null || p.stock != null;
      const stockQty = p.stock_info?.available_stock ?? p.stock_quantity ?? p.stock ?? (hasInventory ? 0 : 99);
      return {
        ...p,
        stock: stockQty,
        stock_quantity: stockQty,
        inStock: stockQty > 0,
        is_in_stock: stockQty > 0,
        // media is already filtered to is_primary:true — no need for .find()
        image: p.image || p.media?.[0]?.url || "",
        images: p.images || p.media?.map(m => m.url) || [],
        brand: p.brands?.[0]?.brand?.name || p.brand || "BigandBest",
        // Coerce Prisma Decimal -> number so clients don't have to parse strings
        variants: p.variants?.map(v => ({
          ...v,
          bulk_pricing_tiers: v.bulk_pricing_tiers?.map(t => ({
            ...t,
            unit_price: Number(t.unit_price),
          })) ?? [],
        })),
      };
    });
  }

  // Rebuild groups.preview_products using the enriched product objects (fixes stale cache bug)
  if (mappedContent.groups) {
    const enrichedMap = new Map(products.map(p => [p.id, p]));
    mappedContent.groups = mappedContent.groups.map(({ _subcatId, ...g }) => ({
      ...g,
      preview_products: groupProducts
        .filter(p => p.subcategory_id === _subcatId)
        .map(p => enrichedMap.get(p.id) || p),
    }));
  }

  // Append special-component items AFTER real products (skip dedup/inventory/availability)
  products.push(...videos, ...banners, ...(brandsResult.items ?? []));

  // Cache base response (no per-user availability)
  const responseData = { ...section, products, ...mappedContent };
  redis.setex(getSectionContentCacheKey(sectionId, warehouseIdInt), SECTION_CACHE_TTL, JSON.stringify(responseData)).catch(() => {});

  return { responseData, realProductIds };
};

// Read-through: serve from Redis if present, else compute + populate cache.
// Returns the plain responseData object (no per-user availability, no pagination) —
// exactly what's stored in Redis. Used by both the section-content route and the
// homepage bootstrap endpoint so the two never diverge in DB/cache logic.
export const getOrComputeSectionContent = async (sectionId, warehouseIdInt) => {
  const cacheKey = getSectionContentCacheKey(sectionId, warehouseIdInt);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return { responseData: JSON.parse(cached), realProductIds: null };
  } catch {
    // Redis unavailable — proceed to DB
  }
  return computeAndCacheSectionContent(sectionId, warehouseIdInt);
};

export const getSectionWithContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouse_id, subcategory_id, q, page, limit } = req.query;
    const warehouseIdInt = warehouse_id ? parseInt(warehouse_id) : null;
    const sectionId = parseInt(id);
    const userPincode = req.headers['x-user-pincode'];
    const validPincode = userPincode && /^\d{6}$/.test(userPincode);

    const result = await getOrComputeSectionContent(sectionId, warehouseIdInt);
    if (!result) {
      return res.status(404).json({ error: "Section not found" });
    }
    const { responseData, realProductIds } = result;
    let products = responseData.products;

    // 6. Availability enrichment.
    // Cache-HIT path (realProductIds === null): enrich every item with an `id`,
    // matching this endpoint's pre-existing cache-HIT behavior.
    // Fresh-compute path: scope enrichment to realProductIds only (skip videos/banners/brand cards).
    let enrichedProducts = products;
    if (validPincode && products?.length > 0) {
      const eligible = realProductIds
        ? products.filter(p => realProductIds.has(p.id))
        : products.filter(p => p.id);
      if (eligible.length > 0) {
        try {
          const items = eligible.map(p => ({
            product_id: p.id,
            variant_id: p.variants?.[0]?.id || p.default_variant_id || null,
            quantity: 1,
          }));
          const availability = await cartAvailabilityDAO.checkBulkAvailability(items, userPincode);
          const eligibleIds = new Set(eligible.map(p => p.id));
          enrichedProducts = products.map(p => ({
            ...p,
            ...(eligibleIds.has(p.id) ? { availability: availability[p.id] ?? { available: true } } : {}),
          }));
        } catch (err) {
          console.warn('[Availability] Enrichment failed, returning products without availability:', err.message);
        }
      }
    }

    const { paged, total, page: pageOut, limit: limitOut, hasMore } =
      filterAndPaginateProducts(enrichedProducts, { subcategory_id, q, page, limit });
    res.status(200).json({
      success: true,
      data: { ...responseData, products: paged, total, page: pageOut, limit: limitOut, hasMore },
    });

  } catch (error) {
    console.error("Error fetching section content:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
