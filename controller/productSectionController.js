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

const SECTION_CACHE_TTL = parseInt(process.env.SECTION_CACHE_TTL || '300', 10);

// ── Cache key constants ───────────────────────────────────────────────────────
const CACHE_KEYS = {
  allSections:    'sections:all',
  activeSections: 'sections:active',
  sectionById:    (id) => `sections:meta:${id}`,
  sectionContent: (id, wh) => `section:${id}:wh${wh || 0}`,
  sectionProducts:(id) => `section:${id}:products`,
};

// Invalidate every cache entry tied to a specific section id
const invalidateSectionCache = async (id) => {
  // Delete scalar meta/list keys
  await Promise.allSettled([
    redis.del(CACHE_KEYS.allSections),
    redis.del(CACHE_KEYS.activeSections),
    redis.del(CACHE_KEYS.sectionById(id)),
  ]);
  // Scan and delete ALL warehouse-variant keys for this section
  // (e.g. section:{id}:wh0, section:{id}:wh3, section:{id}:products:wh0, etc.)
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `section:${id}:*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {
    // Redis unavailable — best effort
  }
};

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

// Get all product sections
export const getAllProductSections = async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEYS.allSections).catch(() => null);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const data = await productSectionDao.list({ active: undefined });
    const payload = { success: true, data };
    redis.setex(CACHE_KEYS.allSections, SECTION_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
    res.status(200).json(payload);
  } catch (error) {
    console.error("Error fetching product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get active product sections only
export const getActiveProductSections = async (req, res) => {
  try {
    const cached = await redis.get(CACHE_KEYS.activeSections).catch(() => null);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const data = await productSectionDao.list({ active: true });
    const payload = { success: true, data };
    redis.setex(CACHE_KEYS.activeSections, SECTION_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
    res.status(200).json(payload);
  } catch (error) {
    console.error("Error fetching active product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get counts for all sections
export const getSectionCounts = async (req, res) => {
  try {
    const data = await productSectionDao.getSectionCounts();
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

// Update product section
export const updateProductSection = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    delete updateData.id;
    delete updateData.created_at;

    // Allowed fields for update
    const allowedFields = [
      'section_name',
      'description',
      'is_active',
      'display_order',
      'component_name',
      'is_marketing',
      'allow_group_mapping',
      'allow_category_mapping'
    ];

    // Filter updateData to only include allowed fields
    const filteredUpdateData = Object.keys(updateData)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updateData[key];
        return obj;
      }, {});

    const data = await productSectionDao.update(parseInt(id), filteredUpdateData);

    invalidateSectionCache(parseInt(id));

    res.status(200).json({
      success: true,
      data,
      message: "Product section updated successfully",
    });
  } catch (error) {
    console.error("Error updating product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Toggle section active status
export const toggleSectionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await productSectionDao.getById(parseInt(id));

    if (!section) {
      return res.status(404).json({ error: "Product section not found" });
    }

    const newStatus = !section.is_active;
    const data = await productSectionDao.update(parseInt(id), { is_active: newStatus });

    invalidateSectionCache(parseInt(id));

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

// Update display order for multiple sections
export const updateSectionOrder = async (req, res) => {
  try {
    const { sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: "sections array is required" });
    }

    await Promise.all(
      sections.map(section => productSectionDao.update(parseInt(section.id), { display_order: section.display_order }))
    );

    // Order change affects the list caches; individual section content is unchanged
    redis.del(CACHE_KEYS.allSections).catch(() => {});
    redis.del(CACHE_KEYS.activeSections).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Section order updated successfully",
    });
  } catch (error) {
    console.error("Error updating section order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== PRODUCT-SECTION ASSIGNMENT FUNCTIONS ==========

// Add products to a section
export const addProductsToSection = async (req, res) => {
  try {
    const { id } = req.params; // section_id
    const { product_ids } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: "product_ids array is required and must not be empty" });
    }

    const section = await productSectionDao.getById(parseInt(id));
    if (!section) return res.status(404).json({ error: "Product section not found" });

    let nextOrder = (await productSectionProductDao.getMaxOrder(parseInt(id))) + 1;

    const assignments = product_ids.map((product_id) => ({
      product_id,
      section_id: parseInt(id),
      display_order: nextOrder++,
    }));

    const data = await productSectionProductDao.upsertMany(assignments);

    invalidateSectionCache(parseInt(id)).catch(() => {});

    res.status(200).json({
      success: true,
      data,
      message: `${product_ids.length} product(s) added to section successfully`,
    });
  } catch (error) {
    console.error("Error adding products to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a product from a section
export const removeProductFromSection = async (req, res) => {
  try {
    const { id, productId } = req.params;
    await productSectionProductDao.deleteBySectionAndProduct(parseInt(id), productId);

    invalidateSectionCache(parseInt(id)).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Product removed from section successfully",
    });
  } catch (error) {
    console.error("Error removing product from section:", error);
    res.status(500).json({ error: "Internal server error" });
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

// Get all products in a section
export const getProductsInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 24, warehouse_id, sort, minPrice, maxPrice, brand } = req.query;

    // Accept numeric ID or string section_key
    let sectionId = parseInt(id);
    if (isNaN(sectionId)) {
      const section = await prisma.product_sections.findUnique({
        where: { section_key: id },
        select: { id: true },
      });
      if (!section) {
        return res.status(200).json({ success: true, data: [], pagination: { page: 1, limit: parseInt(limit), total: 0, totalPages: 0 } });
      }
      sectionId = section.id;
    }

    const pageInt  = Math.max(1, parseInt(page)  || 1);
    const limitInt = Math.min(100, Math.max(1, parseInt(limit) || 24));
    const offset = (pageInt - 1) * limitInt;

    // Build filter WHERE from query params
    const priceFilter = {};
    const minPriceF = minPrice ? parseFloat(minPrice) : NaN;
    const maxPriceF = maxPrice ? parseFloat(maxPrice) : NaN;
    if (!isNaN(minPriceF)) priceFilter.gte = minPriceF;
    if (!isNaN(maxPriceF) && maxPriceF < 50000) priceFilter.lte = maxPriceF;
    const extraWhere = {
      ...(Object.keys(priceFilter).length > 0 && { price: priceFilter }),
      ...(brand && { brand_name: brand }),
    };

    // Build orderBy from sort param
    const orderByMap = {
      lowest_price:   { price: 'asc' },
      highest_price:  { price: 'desc' },
      highest_rating: { rating: 'desc' },
      newest:         { created_at: 'desc' },
    };
    const orderBy = orderByMap[sort] || { created_at: 'desc' };

    // Cache key includes filter params (skip cache when filters active for fresh results)
    const hasFilters = Object.keys(extraWhere).length > 0 || (sort && sort !== 'newest');
    const cacheKey = hasFilters
      ? null
      : `${CACHE_KEYS.sectionProducts(sectionId)}:p${pageInt}:l${limitInt}`;

    if (cacheKey) {
      const cachedRaw = await redis.get(cacheKey).catch(() => null);
      if (cachedRaw) return res.status(200).json(JSON.parse(cachedRaw));
    }

    // 1. Fetch category mappings and determine mode in parallel
    const [mappedCategories, directCount, groupMappings] = await Promise.all([
      productSectionCategoryDao.listBySection(sectionId),
      productSectionProductDao.countBySection(sectionId, {}),
      productSectionGroupDao.listBySection(sectionId),
    ]);
    const categoryIds = mappedCategories.length > 0 ? mappedCategories.map(mc => mc.category_id) : null;

    let products = [];
    let total = 0;

    // Minimal include — inventory already loaded, no extra enrichment needed
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

    if (directCount > 0) {
      // Mode A: Directly assigned products — reuse directCount when no category filter active
      const [data, dataTotal] = await Promise.all([
        productSectionProductDao.listBySection(sectionId, { offset, limit: limitInt, categoryIds }),
        categoryIds ? productSectionProductDao.countBySection(sectionId, { categoryIds }) : Promise.resolve(directCount),
      ]);
      products = data.map(item => ({ ...item.product }));
      total = dataTotal;
    } else if (categoryIds && categoryIds.length > 0) {
      // Mode B: Category-mapped products
      const where = { category_id: { in: categoryIds }, active: true, variants: { some: { active: true } }, ...extraWhere };
      const [categoryProds, categoryTotal] = await Promise.all([
        prisma.products.findMany({ where, include: productInclude, skip: offset, take: limitInt, orderBy }),
        prisma.products.count({ where }),
      ]);
      products = categoryProds;
      total = categoryTotal;
    } else if (groupMappings && groupMappings.length > 0) {
      // Mode C: Group-mapped products
      const groupIds = groupMappings.map(m => m.group_id);
      const groups = await prisma.groups.findMany({
        where: { id: { in: groupIds } },
        select: { subcategory_id: true },
      });
      const subcategoryIds = groups.map(g => g.subcategory_id).filter(Boolean);
      if (subcategoryIds.length > 0) {
        const where = { subcategory_id: { in: subcategoryIds }, active: true, variants: { some: { active: true } }, ...extraWhere };
        const [groupProds, groupTotal] = await Promise.all([
          prisma.products.findMany({ where, include: productInclude, skip: offset, take: limitInt, orderBy }),
          prisma.products.count({ where }),
        ]);
        products = groupProds;
        total = groupTotal;
      }
    }

    // Mode D: No explicit mappings — fall back to newest active products (e.g. new_arrivals)
    if (products.length === 0 && total === 0 && directCount === 0 && !categoryIds && (!groupMappings || groupMappings.length === 0)) {
      const fallbackWhere = { active: true, variants: { some: { active: true } }, ...extraWhere };
      const [fallbackProds, fallbackTotal] = await Promise.all([
        prisma.products.findMany({ where: fallbackWhere, include: productInclude, skip: offset, take: limitInt, orderBy: { created_at: 'desc' } }),
        prisma.products.count({ where: fallbackWhere }),
      ]);
      products = fallbackProds;
      total = fallbackTotal;
    }

    // Compute stock inline — no extra DB call needed
    const baseProducts = products.map(p => {
      const stockQty = computeStockFromVariants(p.variants);
      const activeVariants = (p.variants || []).filter(v => v.active !== false);
      const priceVariant = activeVariants.find(v => v.is_default === true) || activeVariants[0];
      return {
        id: p.id,
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
    };

    if (cacheKey) redis.setex(cacheKey, SECTION_CACHE_TTL, JSON.stringify(payload)).catch(() => {});
    res.status(200).json(payload);
  } catch (error) {
    console.error("Error fetching products in section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product order within a section
export const updateProductOrderInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: "products array is required" });
    }

    await productSectionProductDao.upsertMany(
      products.map(product => ({
        section_id: parseInt(id),
        product_id: product.product_id,
        display_order: product.display_order,
      }))
    );

    invalidateSectionCache(parseInt(id));

    res.status(200).json({
      success: true,
      message: "Product order updated successfully",
    });
  } catch (error) {
    console.error("Error updating product order:", error);
    res.status(500).json({ error: "Internal server error" });
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

// Sync categories for a section (Replace all)
export const syncCategoriesInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_ids } = req.body;

    if (!Array.isArray(category_ids)) {
      return res.status(400).json({ error: "category_ids array is required" });
    }

    await productSectionCategoryDao.sync(parseInt(id), category_ids);

    invalidateSectionCache(parseInt(id)).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Section categories synced successfully. ${category_ids.length} categories mapped.`,
    });
  } catch (error) {
    console.error("Error syncing categories to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add categories to a section
export const addCategoriesToSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_ids } = req.body;

    if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
      return res.status(400).json({ error: "category_ids array is required and must not be empty" });
    }

    const mappings = category_ids.map((category_id) => ({
      section_id: parseInt(id),
      category_id: category_id,
    }));

    const data = await productSectionCategoryDao.addMany(mappings);

    invalidateSectionCache(parseInt(id));

    res.status(200).json({
      success: true,
      data,
      message: `${category_ids.length} category/categories mapped to section successfully`,
    });
  } catch (error) {
    console.error("Error adding categories to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a category from a section
export const removeCategoryFromSection = async (req, res) => {
  try {
    const { id, categoryId } = req.params;
    await productSectionCategoryDao.remove(parseInt(id), categoryId);

    invalidateSectionCache(parseInt(id));

    res.status(200).json({
      success: true,
      message: "Category removed from section successfully",
    });
  } catch (error) {
    console.error("Error removing category from section:", error);
    res.status(500).json({ error: "Internal server error" });
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
export const getSectionWithContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouse_id } = req.query;
    const warehouseIdInt = warehouse_id ? parseInt(warehouse_id) : null;
    const sectionId = parseInt(id);
    const userPincode = req.headers['x-user-pincode'];
    const validPincode = userPincode && /^\d{6}$/.test(userPincode);

    // Cache key excludes pincode — availability is enriched per-item via Redis in checkBulkAvailability
    // v2: cache key bumped when bulk_pricing_tiers was added to productInclude, so stale
    // pre-tiers payloads don't get served to clients expecting the new field.
    const cacheKey = `section:${sectionId}:wh${warehouseIdInt || 0}:v2`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (validPincode && parsed.products?.length > 0) {
          const items = parsed.products
            .filter(p => p.id)
            .map(p => ({
              product_id: p.id,
              variant_id: p.variants?.[0]?.id || p.default_variant_id || null,
              quantity: 1,
            }));
          if (items.length > 0) {
            const availability = await cartAvailabilityDAO.checkBulkAvailability(items, userPincode);
            parsed.products = parsed.products.map(p => ({
              ...p,
              availability: availability[p.id] ?? { available: true },
            }));
          }
        }
        return res.status(200).json({ success: true, data: parsed });
      }
    } catch {
      // Redis unavailable — proceed to DB
    }

    // 1. Fetch section metadata + all mapping tables in parallel
    const [section, groupMappings, storeMappings, categoryMappings] = await Promise.all([
      productSectionDao.getById(sectionId),
      productSectionGroupDao.listBySection(sectionId),
      storeSectionMappingDao.getStoreMappingsBySection
        ? storeSectionMappingDao.getStoreMappingsBySection(sectionId)
        : Promise.resolve([]),
      productSectionCategoryDao.listBySection(sectionId),
    ]);

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

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
        ? prisma.products.findMany({ where: { store_id: { in: storeIds }, is_active: true, is_deleted: false }, include: productInclude, take: 100 })
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
    redis.setex(cacheKey, SECTION_CACHE_TTL, JSON.stringify(responseData)).catch(() => {});

    // 6. Availability — only for real products (not videos/banners/brands)
    let enrichedProducts = products;
    if (validPincode && realProductIds.size > 0) {
      try {
        const items = products
          .filter(p => realProductIds.has(p.id))
          .map(p => ({
            product_id: p.id,
            variant_id: p.variants?.[0]?.id || p.default_variant_id || null,
            quantity: 1,
          }));
        if (items.length > 0) {
          const availability = await cartAvailabilityDAO.checkBulkAvailability(items, userPincode);
          enrichedProducts = products.map(p => ({
            ...p,
            ...(realProductIds.has(p.id) ? { availability: availability[p.id] ?? { available: true } } : {}),
          }));
        }
      } catch (err) {
        console.warn('[Availability] Enrichment failed, returning products without availability:', err.message);
      }
    }

    // Avoid spreading responseData then overriding products — build final object directly
    res.status(200).json({
      success: true,
      data: { ...responseData, products: enrichedProducts },
    });

  } catch (error) {
    console.error("Error fetching section content:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
