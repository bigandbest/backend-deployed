// import { supabase } from "../config/supabaseClient.js"; // Removed: replaced with Prisma
import * as deliveryValidationService from "./deliveryValidationService.js";
import productDao from "../dao/product.dao.js";
import productVariantDao from "../dao/product-variant.dao.js";
import productWarehouseStockDao from "../dao/product-warehouse-stock.dao.js";
import categoryDao from "../dao/category.dao.js";
import deliveryZoneDao from "../dao/delivery-zone.dao.js";
import partnerDao from "../dao/partner.dao.js";
import stockMovementDao from "../dao/stock-movement.dao.js";
import warehousePincodeDao from "../dao/warehouse-pincode.dao.js";
import zonePincodeDao from "../dao/zone-pincode.dao.js";
import warehouseDao from "../dao/warehouse.dao.js";
import cartAvailabilityDAO from "../dao/cart-availability.dao.js";
import prisma from "../config/prisma.js";
import ProductBrandDAO from "../dao/product-brand.dao.js";

const VARIANT_JOIN = "product_variants(*)";

// Helper for consistency in transformations
const transformProduct = (product, assignments = []) => {
  const activeVariants = (product.variants || []).filter(
    (v) => v.active !== false,
  );
  const defaultVariant =
    activeVariants.find((v) => v.is_default === true) || activeVariants[0];

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price || defaultVariant?.price,
    oldPrice: product.old_price || defaultVariant?.old_price,
    rating: parseFloat(product.rating) || 4.0,
    reviews: product.review_count || 0,
    discount: product.discount || 0,
    image:
      product.image ||
      product.media?.find((m) => m.is_primary)?.url ||
      product.media?.[0]?.url,
    images: product.images || product.media?.map((m) => m.url) || [],
    inStock: (product.stock_quantity || product.stock || 0) > 0,
    stock: product.stock_quantity || product.stock || 0,
    stockQuantity: product.stock_quantity || product.stock || 0,
    popular: product.popular,
    featured: product.featured,
    most_orders: product.most_orders,
    top_sale: product.top_sale,
    category:
      product.category?.name || product.category_name || product.category,
    weight:
      product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
    brand:
      product.brands?.[0]?.brand?.name || product.brand_name || "BigandBest",
    shipping_amount: product.shipping_amount || 0,
    specifications: product.specifications,
    created_at: product.created_at,
    delivery_type: product.delivery_type || "nationwide",
    return_applicable: product.return_applicable !== false,
    return_days: product.return_days || 7,
    quick_delivery: product.quick_delivery || false,
    hasVariants: activeVariants.length > 0,
    variants: activeVariants,
    defaultVariant: defaultVariant || null,
    warehouse_assignments: assignments,
    created_by: product.created_by,
    seller_id: product.seller_id,
    seller_name: product.seller_id ? "Seller" : "BigandBestMart", // Placeholder until seller table exists
  };
};

export const getAllProducts = async (req, res) => {
  try {
    // Use Prisma through ProductDAO instead of Supabase
    const products = await productDao.listProducts(
      { active: true },
      { limit: 1000, page: 1 },
    );

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      products.items || [],
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null,
    );

    res.status(200).json({
      success: true,
      products: enrichedProducts,
      total: products.total || 0,
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};

export const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const products = await productDao.getProductsByCategoryName(category);

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      products,
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null,
    );

    res.status(200).json({
      success: true,
      products: enrichedProducts,
      total: enrichedProducts.length,
      category: category,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getAllCategories = async (req, res) => {
  try {
    const categories = await categoryDao.listCategories(true);

    const transformedCategories = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      image_url: cat.image_url,
      featured: cat.featured,
      icon: cat.icon,
    }));

    res.status(200).json({
      success: true,
      categories: transformedCategories,
      total: transformedCategories.length,
    });
  } catch (error) {
    console.error("Server error in getAllCategories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Batch product lookup for cart/order pages
export const getProductsCartData = async (req, res) => {
  try {
    const { product_ids } = req.body || {};

    if (
      !product_ids ||
      !Array.isArray(product_ids) ||
      product_ids.length === 0
    ) {
      return res.status(200).json({ success: true, products: [] });
    }

    const products = await productDao.getProductsByIds(product_ids);
    const transformed = products.map((product) => transformProduct(product));

    return res.status(200).json({ success: true, products: transformed });
  } catch (error) {
    console.error("getProductsCartData error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await productDao.getFeaturedProducts(20);

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      products,
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null,
    );

    res.status(200).json({
      success: true,
      products: enrichedProducts,
      total: enrichedProducts.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getEverydayEssentials = async (req, res) => {
  try {
    const products = await productDao.getEverydayEssentials(20);

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      products,
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null,
    );

    res.status(200).json({
      success: true,
      products: enrichedProducts,
      total: enrichedProducts.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getTopProducts = async (req, res) => {
  try {
    const products = await productDao.getTopProducts(20);

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      products,
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null,
    );

    res.status(200).json({
      success: true,
      products: enrichedProducts,
      total: enrichedProducts.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProductsWithFilters = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      featured,
      popular,
      most_orders,
      top_sale,
      search,
    } = req.query;

    const filters = {
      active: true,
      ...(category && { category_id: category }),
      ...(minPrice && { price: { gte: parseFloat(minPrice) } }),
      ...(maxPrice && { price: { lte: parseFloat(maxPrice) } }),
      ...(featured === "true" && { featured: true }),
      ...(popular === "true" && { popular: true }),
      ...(most_orders === "true" && { most_orders: true }),
      ...(top_sale === "true" && { top_sale: true }),
    };

    const {
      items: products,
      total,
      totalPages,
    } = await productDao.listProducts(filters, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      products,
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null,
    );

    res.status(200).json({
      success: true,
      products: enrichedProducts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { pincode, warehouse_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    // Fetch product using DAO (same as admin endpoint for consistency)
    const product = await productDao.getProductById(id);

    if (!product || !product.active) {
      return res.status(404).json({ error: "Product not found" });
    }

    // CRITICAL: Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      [product],
      warehouse_id ? parseInt(warehouse_id) : null,
    );
    const enrichedProduct = enrichedProducts[0];

    // Get delivery information
    let deliveryInfo = {
      delivery_type: "nationwide",
      delivery_available: true,
      delivery_zones: [],
      delivery_notes: null,
    };

    // Check pincode-specific delivery if pincode provided
    if (pincode && /^\d{6}$/.test(pincode)) {
      const canDeliver = await productDao.canDeliverToPincode(id, pincode);
      deliveryInfo.can_deliver_to_pincode = canDeliver;
      deliveryInfo.checked_pincode = pincode;
    }

    // Compute price from default variant if available
    const defaultVariant =
      enrichedProduct.variants?.find((v) => v.is_default) ||
      enrichedProduct.variants?.[0];
    const computedPrice = defaultVariant?.price || 0;
    const computedOldPrice = defaultVariant?.old_price || computedPrice * 1.2;

    res.status(200).json({
      success: true,
      product: {
        ...enrichedProduct,
        // Computed convenience fields
        price: computedPrice,
        old_price: computedOldPrice,
        oldPrice: computedOldPrice,
        image: enrichedProduct.media?.[0]?.url || "",
        images: enrichedProduct.media?.map((m) => m.url) || [],
        delivery_info: deliveryInfo,
        // Flattened convenience fields
        store_name:
          enrichedProduct.product_recommended_store?.[0]?.recommended_store
            ?.name ||
          enrichedProduct.store?.name ||
          null,
        brand: enrichedProduct.brands?.[0]?.brand?.name || null,
        brand_name: enrichedProduct.brands?.[0]?.brand?.name || null,
        brand_id: enrichedProduct.brands?.[0]?.brand?.id || null,
        // Keep original nested objects (don't override them)
        // category, subcategory, group, brands, media, store, product_recommended_store are already in enrichedProduct
      },
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// --- Product Delivery Settings (Admin) ---

/**
 * Create or update product with delivery settings (for admin)
 */
export const updateProductDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      delivery_type,
      allowed_zone_ids = [],
      delivery_restrictions = {},
      delivery_notes,
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    if (delivery_type && !["nationwide", "zonal"].includes(delivery_type)) {
      return res.status(400).json({
        error: "Invalid delivery_type. Must be 'nationwide' or 'zonal'",
      });
    }

    if (
      delivery_type === "zonal" &&
      (!allowed_zone_ids || allowed_zone_ids.length === 0)
    ) {
      return res
        .status(400)
        .json({ error: "Zone IDs are required for zonal delivery" });
    }

    let finalZoneIds = delivery_type === "nationwide" ? [] : allowed_zone_ids;

    if (finalZoneIds.length > 0) {
      const zones = await deliveryZoneDao.listByIds(finalZoneIds);
      if (!zones || zones.length !== finalZoneIds.length) {
        return res
          .status(400)
          .json({ error: "One or more zone IDs are invalid or inactive" });
      }
    }

    const updatedProduct = await productDao.updateProduct(id, {
      delivery_type,
      allowed_zone_ids: finalZoneIds,
      delivery_restrictions,
      delivery_notes,
    });

    res.status(200).json({
      success: true,
      message: "Delivery settings updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Check delivery availability for multiple products
 */
export const checkProductsDelivery = async (req, res) => {
  try {
    const { pincode, product_items } = req.body;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res
        .status(400)
        .json({ error: "Valid 6-digit pincode is required" });
    }

    if (
      !product_items ||
      !Array.isArray(product_items) ||
      product_items.length === 0
    ) {
      return res.status(400).json({ error: "Product items are required" });
    }

    const results = await Promise.all(
      product_items.map(async (item) => {
        const canDeliver = await productDao.canDeliverToPincode(
          parseInt(item.product_id),
          pincode,
        );
        return {
          product_id: item.product_id,
          pincode,
          can_deliver: canDeliver,
        };
      }),
    );

    res.status(200).json({
      success: true,
      pincode,
      results,
    });
  } catch (error) {
    console.error("Server error in checkProductsDelivery:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get products filtered by delivery availability to a pincode
 */
// Get products filtered by delivery availability to a pincode
export const getProductsByDeliveryZone = async (req, res) => {
  try {
    const { pincode, category, limit = 20, offset = 0 } = req.query;
    const limitInt = parseInt(limit);
    const offsetInt = parseInt(offset);

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        error: "Valid 6-digit pincode is required",
      });
    }

    // Get zones for this pincode using Prisma
    // 1. Get zones explicitly linked to this pincode
    const pincodeZones = await prisma.zone_pincodes.findMany({
      where: { pincode: pincode, is_active: true },
      include: { zone: true },
      // distinct: ['zone_id'] // Optional if duplicates possible, but usually active pincode-zone is unique per zone
    });

    // 2. Get nationwide zones (if applicable, usually nationwide products skip zone check, but check if nationwide zones exist)
    const nationwideZones = await prisma.delivery_zones.findMany({
      where: { is_nationwide: true, is_active: true },
    });

    const activeZoneIds = [
      ...pincodeZones.map((pz) => pz.zone_id),
      ...nationwideZones.map((nz) => nz.id),
    ];

    // Unique IDs
    const uniqueZoneIds = [...new Set(activeZoneIds)];

    if (uniqueZoneIds.length === 0) {
      // Even if no zones found, we might still serve NATIONWIDE products?
      // The original code returned empty list if no zones found.
      // But typically nationwide products should be available everywhere.
      // We will follow original logic: if no zones, verify if it strictly means "no service" or just "no zonal service".
      // Original: if (!zones) return [];
      // We'll mimic this but be aware nationwide products exist.
      // However, if we assume "zones" meant "Serviceable Zones", then 0 zones means no service.
      // But we fetched nationwide zones too. So if uniqueZoneIds is empty, truly no service.
      return res.status(200).json({
        success: true,
        products: [],
        message: "No delivery zones found for this pincode",
        pincode,
        zones: [],
      });
    }

    // Build query for deliverable products
    // Logic: Product is Active AND (Delivery is Nationwide OR (Delivery is Zonal AND allowed_zone_ids overlaps with uniqueZoneIds))
    const whereClause = {
      active: true,
      OR: [
        { delivery_type: "nationwide" },
        {
          delivery_type: "zonal",
          allowed_zone_ids: { hasSome: uniqueZoneIds },
        },
      ],
    };

    if (category) {
      whereClause.category = category; // Ensure 'category' field name matches schema (string or relation?)
      // Schema view showed product has 'category' (json or string? or relation?).
      // Products definition in schema not fully visible but DAO uses 'category' filter.
      // Prisma client types showed 'category' as input.
    }

    const products = await prisma.products.findMany({
      where: whereClause,
      include: {
        variants: true,
        media: true,
        product_recommended_store: {
          include: { recommended_store: true },
        },
        brands: { include: { brand: true } },
      },
      skip: offsetInt,
      take: limitInt,
    });

    // Flatten zones for response
    const zonesResponse = [
      ...pincodeZones.map((pz) => pz.zone),
      ...nationwideZones,
    ];

    // Transform products
    const transformedProducts = products.map((product) => {
      const defaultVariant =
        product.variants?.find((v) => v.is_default === true) ||
        product.variants?.[0] ||
        null;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        oldPrice: product.old_price,
        rating: parseFloat(product.rating) || 4.0,
        reviews: product.review_count || 0,
        discount: product.discount || 0,
        image:
          product.image ||
          product.media?.find((m) => m.is_primary)?.url ||
          product.media?.[0]?.url,
        images: product.images || product.media?.map((m) => m.url) || [],
        inStock: (product.stock || 0) > 0,
        stock: product.stock || 0,
        popular: product.popular,
        featured: product.featured,
        category: product.category,
        weight:
          product.uom ||
          `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
        brand: product.brands?.[0]?.brand?.name || "BigandBest",
        shipping_amount: product.shipping_amount || 0,
        delivery_type: product.delivery_type,
        delivery_available: true,
        created_at: product.created_at,
        hasVariants: product.variants?.length > 0,
        variants: product.variants || [],
        defaultVariant: defaultVariant,
      };
    });

    res.status(200).json({
      success: true,
      products: transformedProducts,
      pincode,
      zones: zonesResponse,
      total: transformedProducts.length, // approximation, for true total we need count()
      category: category || "all",
    });
  } catch (error) {
    console.error("Get products by delivery zone error:", error);
    res.status(500).json({
      error: "Failed to get products",
      message: error.message,
    });
  }
};

// Get Quick Picks - products that are popular, most_orders, or top_sale
export const getQuickPicks = async (req, res) => {
  try {
    const { limit = 30, filter, section_key } = req.query;
    const limitInt = parseInt(limit);

    let products = [];

    // If section_key is provided, fetch products from section mappings
    if (section_key) {
      // Get section info
      const sectionData = await prisma.product_sections.findUnique({
        where: { section_key: section_key },
      });

      if (sectionData && sectionData.is_active) {
        // Get direct section-product mappings
        const directMappings = await prisma.store_section_mappings.findMany({
          where: {
            section_id: sectionData.id,
            mapping_type: "section_product",
            is_active: true,
          },
          include: {
            products: {
              include: {
                variants: true,
                media: true,
                brands: { include: { brand: true } },
                product_recommended_store: {
                  include: { recommended_store: true },
                },
              },
            },
          },
          take: limitInt,
        });

        if (directMappings.length > 0) {
          products = directMappings.map((mapping) => mapping.products);
        }
      }

      // If no products found from section mappings, fall back to latest products
      if (products.length === 0) {
        products = await prisma.products.findMany({
          where: { active: true },
          orderBy: { created_at: "desc" },
          take: limitInt,
          include: {
            variants: true,
            media: true,
            brands: { include: { brand: true } },
            product_recommended_store: {
              include: { recommended_store: true },
            },
          },
        });
      }
    } else if (filter === "new_arrivals") {
      // Get latest products
      products = await prisma.products.findMany({
        where: { active: true },
        orderBy: { created_at: "desc" },
        take: limitInt,
        include: {
          variants: true,
          media: true,
          brands: { include: { brand: true } },
          product_recommended_store: {
            include: { recommended_store: true },
          },
        },
      });
    } else if (filter === "best_sellers" || !filter) {
      // Best Sellers logic: derived from order_items
      const topSellingItems = await prisma.order_items.groupBy({
        by: ["variant_id"],
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: "desc",
          },
        },
        take: limitInt,
      });

      const topVariantIds = topSellingItems.map((item) => item.variant_id);

      if (topVariantIds.length > 0) {
        // Get products that have these variants
        const variants = await prisma.product_variants.findMany({
          where: { id: { in: topVariantIds } },
          select: { product_id: true },
        });
        const topProductIds = [...new Set(variants.map((v) => v.product_id))];

        const productDetails = await prisma.products.findMany({
          where: {
            id: { in: topProductIds },
            active: true,
          },
          include: {
            variants: true,
            media: true,
            brands: { include: { brand: true } },
            product_recommended_store: {
              include: { recommended_store: true },
            },
          },
        });

        // Create a map for sorting
        const productMap = new Map();
        productDetails.forEach((p) => productMap.set(p.id, p));

        // Maintain the order of best sellers
        products = topProductIds
          .map((id) => productMap.get(id))
          .filter((p) => p !== undefined);
      }

      // Fill with latest if needed
      if (products.length < limitInt) {
        const remainingLimit = limitInt - products.length;
        const excludeIds = products.map((p) => p.id);

        const latestProducts = await prisma.products.findMany({
          where: {
            active: true,
            id: { notIn: excludeIds },
          },
          orderBy: { created_at: "desc" },
          take: remainingLimit,
          include: {
            variants: true,
            media: true,
            brands: { include: { brand: true } },
            product_recommended_store: {
              include: { recommended_store: true },
            },
          },
        });

        products = [...products, ...latestProducts];
      }
    } else if (filter === "trending") {
      // Trending: recent orders (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Prisma doesn't support complex joins in groupBy easily with date filtering on related table
      // We'll fetch order items for recent orders first.
      // 1. Get recent orders
      const recentOrders = await prisma.orders.findMany({
        where: { created_at: { gte: thirtyDaysAgo } },
        select: { id: true },
      });

      const recentOrderIds = recentOrders.map((o) => o.id);

      if (recentOrderIds.length > 0) {
        // 2. Group order items by variant
        const trendingItems = await prisma.order_items.groupBy({
          by: ["variant_id"],
          where: {
            order_id: { in: recentOrderIds },
          },
          _sum: {
            quantity: true,
          },
          orderBy: {
            _sum: {
              quantity: "desc",
            },
          },
          take: limitInt,
        });

        const trendingVariantIds = trendingItems.map((item) => item.variant_id);

        if (trendingVariantIds.length > 0) {
          // Get products that have these variants
          const variants = await prisma.product_variants.findMany({
            where: { id: { in: trendingVariantIds } },
            select: { product_id: true },
          });
          const trendingProductIds = [
            ...new Set(variants.map((v) => v.product_id)),
          ];

          const productDetails = await prisma.products.findMany({
            where: {
              id: { in: trendingProductIds },
              active: true,
            },
            include: {
              variants: true,
              media: true,
              brands: true,
              product_recommended_store: {
                include: { recommended_store: true },
              },
            },
          });

          const productMap = new Map();
          productDetails.forEach((p) => productMap.set(p.id, p));

          products = trendingProductIds
            .map((id) => productMap.get(id))
            .filter((p) => p !== undefined);
        }
      }

      // Fill with latest
      if (products.length < limitInt) {
        const remainingLimit = limitInt - products.length;
        const excludeIds = products.map((p) => p.id);

        const latestProducts = await prisma.products.findMany({
          where: {
            active: true,
            id: { notIn: excludeIds },
          },
          orderBy: { created_at: "desc" },
          take: remainingLimit,
          include: {
            variants: true,
            media: true,
            brands: true,
            product_recommended_store: {
              include: { recommended_store: true },
            },
          },
        });

        products = [...products, ...latestProducts];
      }
    } else if (filter === "top_sale") {
      // Since top_sale field doesn't exist, use latest products
      products = await prisma.products.findMany({
        where: {
          active: true,
        },
        orderBy: { created_at: "desc" },
        take: limitInt,
        include: {
          variants: true,
          media: true,
          brands: true,
          product_recommended_store: {
            include: { recommended_store: true },
          },
        },
      });
    } else if (filter === "most_orders") {
      // Since most_orders field doesn't exist, use best sellers logic
      const topSellingItems = await prisma.order_items.groupBy({
        by: ["variant_id"],
        _sum: {
          quantity: true,
        },
        orderBy: {
          _sum: {
            quantity: "desc",
          },
        },
        take: limitInt,
      });

      const topVariantIds = topSellingItems.map((item) => item.variant_id);

      if (topVariantIds.length > 0) {
        const variants = await prisma.product_variants.findMany({
          where: { id: { in: topVariantIds } },
          select: { product_id: true },
        });
        const topProductIds = [...new Set(variants.map((v) => v.product_id))];

        products = await prisma.products.findMany({
          where: {
            id: { in: topProductIds },
            active: true,
          },
          include: {
            variants: true,
            media: true,
            brands: true,
            product_recommended_store: {
              include: { recommended_store: true },
            },
          },
        });
      }
    }

    // console.log("Quick picks data:", products.length, "products found");

    // Enrich with inventory data before transformation
    if (products.length > 0) {
      // Assuming warehouse_id might be passed in query, if not, it handles null (checks all warehouses/aggregated)
      const warehouseId = req.query.warehouse_id
        ? parseInt(req.query.warehouse_id)
        : null;
      products = await productDao.enrichProductsWithInventory(
        products,
        warehouseId,
      );

      // Map stock info to top-level fields
      products = products.map((p) => ({
        ...p,
        stock: p.stock_info?.available_stock || 0,
        stock_quantity: p.stock_info?.available_stock || 0,
      }));
    }

    // Transform the data to match frontend expectations
    const transformedProducts = products.map((product) =>
      transformProduct(product),
    );

    res.status(200).json({
      success: true,
      products: transformedProducts.slice(0, limitInt),
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("Server error in getQuickPicks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get products by subcategory
export const getProductsBySubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Use listProducts with includeAllVariants to get full product details
    let products = await productDao.listProducts(
      { subcategory_id: subcategoryId, includeAllVariants: true },
      { page, limit },
    );

    // Enrich with inventory data
    if (products.items && products.items.length > 0) {
      const warehouseId = req.query.warehouse_id
        ? parseInt(req.query.warehouse_id)
        : null;
      products.items = await productDao.enrichProductsWithInventory(
        products.items,
        warehouseId,
      );
    }

    // Flatten the response for frontend convenience (matching admin endpoint structure)
    const flattenedProducts = (products.items || []).map((p) => {
      const brandObj =
        p.brands && p.brands.length > 0 ? p.brands[0].brand : null;
      const storeObj =
        p.product_recommended_store && p.product_recommended_store.length > 0
          ? p.product_recommended_store[0].recommended_store
          : null;

      // Get default variant for price display
      const defaultVariant =
        p.variants?.find((v) => v.is_default) || p.variants?.[0];

      return {
        // Spread all original fields from DAO first
        id: p.id,
        name: p.name,
        description: p.description,
        active: p.active,
        created_at: p.created_at,
        updated_at: p.updated_at,
        category_id: p.category_id,
        subcategory_id: p.subcategory_id,
        group_id: p.group_id,
        store_id: p.store_id,
        vertical: p.vertical,
        return_applicable: p.return_applicable,
        return_days: p.return_days,
        has_variants: p.has_variants,
        rating: parseFloat(p.rating) || 0,
        review_count: p.review_count,
        hsn_or_sac_code: p.hsn_or_sac_code,
        gst_rate: p.gst_rate,
        cess_rate: p.cess_rate,
        faq: p.faq,
        // Include nested relation objects
        category: p.category,
        subcategory: p.subcategory,
        group: p.group,
        store: p.store,
        brands: p.brands,
        product_recommended_store: p.product_recommended_store,
        media: p.media,
        variants: p.variants,
        // Flattened brand and store info for convenience
        brand_id: brandObj?.id || null,
        brand_name: brandObj?.name || null,
        store_id: storeObj?.id || null,
        store_name: storeObj?.name || null,
        // Price from default variant
        price: defaultVariant?.price || "0",
        oldPrice: defaultVariant?.old_price || "0",
        old_price: defaultVariant?.old_price || "0",
        discount: defaultVariant?.discount_percentage || 0,
        // Images from media for convenience
        image: p.media?.[0]?.url || "",
        images: p.media?.map((m) => m.url) || [],
        // Stock info
        inStock: defaultVariant?.stock_info?.in_stock || false,
        stock: defaultVariant?.stock_info?.available_stock || 0,
        stockQuantity: defaultVariant?.stock_info?.available_stock || 0,
        // Variant info with all fields including attributes
        hasVariants: p.variants && p.variants.length > 0,
        defaultVariant: defaultVariant,
        // Return rating as number
        reviews: p.review_count || 0,
      };
    });

    res.status(200).json({
      success: true,
      products: flattenedProducts,
      total: products.total || 0,
      page: products.page,
      limit: products.limit,
      totalPages: Math.ceil((products.total || 0) / products.limit),
      subcategoryId,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get products by group
export const getProductsByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    let products = await productDao.getProductsByFilter({ groupId });

    // Enrich with inventory data
    if (products.length > 0) {
      const warehouseId = req.query.warehouse_id
        ? parseInt(req.query.warehouse_id)
        : null;
      products = await productDao.enrichProductsWithInventory(
        products,
        warehouseId,
      );

      // Map stock info to top-level fields
      products = products.map((p) => ({
        ...p,
        stock: p.stock_info?.available_stock || 0,
        stock_quantity: p.stock_info?.available_stock || 0,
      }));
    }

    const transformedProducts = products.map((product) =>
      transformProduct(product),
    );

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
      groupId,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Assign product to warehouses with stock
export const assignProductToWarehouses = async (req, res) => {
  try {
    const { product_id } = req.params;
    const { warehouse_assignments } = req.body;

    if (!warehouse_assignments || !Array.isArray(warehouse_assignments)) {
      return res.status(400).json({
        success: false,
        error: "Warehouse assignments array is required",
      });
    }

    const product = await productDao.getProductById(product_id);
    if (!product)
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });

    const results = [];
    for (const assignment of warehouse_assignments) {
      const {
        warehouse_id,
        stock_quantity,
        minimum_threshold = 0,
        maximum_capacity,
      } = assignment;

      try {
        const existingStock =
          await productWarehouseStockDao.getByProductAndWarehouse(
            product_id,
            warehouse_id,
          );
        const stockData = {
          stock_quantity,
          minimum_threshold,
          maximum_capacity,
          last_updated_by: req.user?.id,
        };

        let result;
        if (existingStock) {
          result = await productWarehouseStockDao.upsertStock(
            product_id,
            warehouse_id,
            stockData,
          );
          results.push({ warehouse_id, action: "updated", data: result });
        } else {
          stockData.last_restocked_at = new Date();
          result = await productWarehouseStockDao.upsertStock(
            product_id,
            warehouse_id,
            stockData,
          );
          results.push({ warehouse_id, action: "created", data: result });

          // Log stock movement
          await stockMovementDao.create({
            product_id,
            warehouse_id,
            movement_type: "inbound",
            quantity: stock_quantity,
            previous_stock: 0,
            new_stock: stock_quantity,
            reference_type: "assignment",
            reason: "Product assigned to warehouse",
            performed_by: req.user?.id,
          });
        }
      } catch (error) {
        console.error(`Error processing warehouse ${warehouse_id}:`, error);
        results.push({ warehouse_id, action: "failed", error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: "Warehouse assignments processed",
      results,
      product_info: {
        id: product.id,
        name: product.name,
        delivery_type: product.delivery_type,
      },
    });
  } catch (error) {
    console.error("Error in assignProductToWarehouses:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get products by category with discount filter and sorting
export const getProductsByCategoryWithDiscount = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { minDiscount = 0, maxDiscount = 100, limit = 50 } = req.query;

    const products = await productDao.getProductsByFilter({
      categoryId,
      minDiscount: parseFloat(minDiscount),
      maxDiscount: parseFloat(maxDiscount),
    });

    const transformedProducts = products
      .slice(0, parseInt(limit))
      .map((product) => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get products by subcategory with discount filter and sorting
export const getProductsBySubcategoryWithDiscount = async (req, res) => {
  try {
    const { subcategoryId } = req.params;
    const { minDiscount = 0, maxDiscount = 100, limit = 50 } = req.query;

    const products = await productDao.getProductsByFilter({
      subcategoryId,
      minDiscount: parseFloat(minDiscount),
      maxDiscount: parseFloat(maxDiscount),
    });

    const transformedProducts = products
      .slice(0, parseInt(limit))
      .map((product) => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get products by brand
export const getProductsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params;

    // Use ProductBrandDAO to get products with necessary relations (media, variants, etc.)
    const brandProducts = await ProductBrandDAO.listProductsByBrand(brandId);

    // Extract actual product objects
    let products = brandProducts.map((item) => item.product).filter(Boolean);

    // Enrich with inventory data
    if (products.length > 0) {
      products = await productDao.enrichProductsWithInventory(products);

      // Map stock info to top-level fields expected by transformProduct
      products = products.map((p) => ({
        ...p,
        stock: p.stock_info?.available_stock || 0,
        stock_quantity: p.stock_info?.available_stock || 0,
      }));
    }

    const transformedProducts = products.map((product) =>
      transformProduct(product),
    );

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
      brand_id: brandId,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get related products based on cart items (by category)
export const getRelatedProducts = async (req, res) => {
  try {
    const { product_ids } = req.body;

    if (!product_ids || !Array.isArray(product_ids)) {
      return res
        .status(400)
        .json({ success: false, error: "product_ids array is required" });
    }

    const products = await productDao.getRelatedProducts(product_ids);
    const transformedProducts = products.map((product) =>
      transformProduct(product),
    );

    res.status(200).json({
      success: true,
      products: transformedProducts,
    });
  } catch (error) {
    console.error("getRelatedProducts error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// --- Variant Management ---

export const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const variants = await productVariantDao.listByProduct(productId, true);

    // CRITICAL: Enrich with inventory data
    // Import inventory DAO dynamically to avoid circular dependencies if any
    const inventoryDAO = (await import("../dao/inventory.dao.js")).default;

    // Collect variant IDs
    const variantIds = variants.map(v => v.id);

    // Fetch stock data
    const stockMap = await inventoryDAO.getStockByVariantIds(
      variantIds,
      req.query.warehouse_id ? parseInt(req.query.warehouse_id) : null
    );

    // Enrich variants
    const enrichedVariants = variants.map(variant => {
      const stockInfo = stockMap.get(variant.id) || {
        available_stock: 0,
        in_stock: false,
        low_stock: false,
        warehouses: []
      };

      return {
        ...variant,
        stock_info: {
          available_stock: stockInfo.available_stock,
          in_stock: stockInfo.in_stock,
          low_stock: stockInfo.low_stock,
          warehouse_count: stockInfo.warehouses?.length || 0
        },
        // Frontend often looks for these top-level fields
        variant_stock: stockInfo.available_stock,
        stock: stockInfo.available_stock,
        inStock: stockInfo.in_stock
      };
    });

    res.status(200).json({
      success: true,
      variants: enrichedVariants || [],
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const addProductVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      variant_name,
      variant_price,
      variant_old_price,
      variant_discount,
      variant_stock,
      variant_weight,
      variant_unit,
      shipping_amount,
      is_default,
      variant_image_url,
    } = req.body;

    if (!variant_name || !variant_price || !variant_weight || !variant_unit) {
      return res.status(400).json({
        error:
          "Required fields: variant_name, variant_price, variant_weight, variant_unit",
      });
    }

    const product = await productDao.getById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const variant = await productVariantDao.create({
      product_id: productId,
      variant_name: variant_name.trim(),
      variant_price: parseFloat(variant_price),
      variant_old_price: variant_old_price
        ? parseFloat(variant_old_price)
        : null,
      variant_discount: variant_discount ? parseInt(variant_discount) : 0,
      variant_stock: variant_stock ? parseInt(variant_stock) : 0,
      variant_weight: variant_weight.trim(),
      variant_unit: variant_unit.trim(),
      shipping_amount: shipping_amount ? parseFloat(shipping_amount) : 0,
      is_default: Boolean(is_default),
      variant_image_url: variant_image_url?.trim() || null,
      active: true,
    });

    res.status(201).json({
      success: true,
      variant,
      message: "Variant added successfully",
    });
  } catch (error) {
    console.error("Server error in addProductVariant:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProductVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const updateData = req.body;

    const existingVariant = await productVariantDao.getById(variantId);
    if (!existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const sanitizedData = { ...updateData };
    delete sanitizedData.id;
    delete sanitizedData.product_id;
    delete sanitizedData.created_at;

    if (sanitizedData.variant_price !== undefined) {
      const price = parseFloat(sanitizedData.variant_price);
      if (isNaN(price) || price <= 0)
        return res.status(400).json({ error: "Invalid variant price" });
      sanitizedData.variant_price = price;
    }

    if (sanitizedData.variant_old_price !== undefined) {
      sanitizedData.variant_old_price = sanitizedData.variant_old_price
        ? parseFloat(sanitizedData.variant_old_price)
        : null;
    }

    if (sanitizedData.variant_discount !== undefined) {
      sanitizedData.variant_discount =
        parseInt(sanitizedData.variant_discount) || 0;
    }

    if (sanitizedData.variant_stock !== undefined) {
      sanitizedData.variant_stock = parseInt(sanitizedData.variant_stock) || 0;
    }

    if (sanitizedData.variant_name)
      sanitizedData.variant_name = sanitizedData.variant_name.trim();

    const updated = await productVariantDao.update(variantId, sanitizedData);

    res.status(200).json({
      success: true,
      variant: updated,
      message: "Variant updated successfully",
    });
  } catch (error) {
    console.error("Server error in updateProductVariant:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteProductVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const existingVariant = await productVariantDao.getById(variantId);
    if (!existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await productVariantDao.update(variantId, { active: false });

    res.status(200).json({
      success: true,
      message: "Variant deleted successfully",
    });
  } catch (error) {
    console.error("Server error in deleteProductVariant:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateVariantStock = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { variant_stock, active } = req.body;

    if (variant_stock === undefined && active === undefined) {
      return res
        .status(400)
        .json({ error: "variant_stock or active status is required" });
    }

    const existingVariant = await productVariantDao.getById(variantId);
    if (!existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const updateData = {};
    if (variant_stock !== undefined) {
      const stock = parseInt(variant_stock);
      if (isNaN(stock) || stock < 0)
        return res.status(400).json({ error: "Invalid stock quantity" });
      updateData.variant_stock = stock;
    }

    if (active !== undefined) {
      updateData.active = Boolean(active);
    } else if (variant_stock !== undefined) {
      updateData.active = variant_stock > 0;
    }

    const updated = await productVariantDao.update(variantId, updateData);

    res.status(200).json({
      success: true,
      variant: updated,
      message: "Variant stock updated successfully",
    });
  } catch (error) {
    console.error("Server error in updateVariantStock:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getVariantWarehouseStock = async (req, res) => {
  try {
    const { variantId } = req.params;
    const variant = await productVariantDao.getById(variantId);
    if (!variant) {
      return res
        .status(404)
        .json({ success: false, error: "Variant not found" });
    }

    const warehouseStock =
      await productWarehouseStockDao.listByVariant(variantId);

    const stockData =
      warehouseStock?.map((item) => ({
        warehouse_id: item.warehouse_id,
        warehouse_name: item.warehouses?.name,
        warehouse_type: item.warehouses?.type,
        parent_warehouse_id: item.warehouses?.parent_warehouse_id,
        location: item.warehouses?.location,
        stock_quantity: item.stock_quantity,
        reserved_quantity: item.reserved_quantity || 0,
        available_quantity: item.stock_quantity - (item.reserved_quantity || 0),
        minimum_threshold: item.minimum_threshold || 0,
        cost_per_unit: item.cost_per_unit,
        last_restocked_at: item.last_restocked_at,
        is_low_stock: item.stock_quantity <= (item.minimum_threshold || 0),
      })) || [];

    res.status(200).json({
      success: true,
      variant,
      warehouse_stock: stockData,
      total_warehouses: stockData.length,
    });
  } catch (error) {
    console.error("Server error in getVariantWarehouseStock:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const updateVariantWarehouseStock = async (req, res) => {
  try {
    const { variantId, warehouseId } = req.params;
    const { stock_quantity, minimum_threshold, cost_per_unit } = req.body;

    const variant = await productVariantDao.getById(variantId);
    if (!variant)
      return res
        .status(404)
        .json({ success: false, error: "Variant not found" });

    const warehouse = await warehouseDao.getById(warehouseId);
    if (!warehouse)
      return res
        .status(404)
        .json({ success: false, error: "Warehouse not found" });

    const stockData = {
      stock_quantity:
        stock_quantity !== undefined ? parseInt(stock_quantity) : undefined,
      minimum_threshold:
        minimum_threshold !== undefined
          ? parseInt(minimum_threshold)
          : undefined,
      cost_per_unit:
        cost_per_unit !== undefined ? parseFloat(cost_per_unit) : undefined,
    };

    const result = await productWarehouseStockDao.upsertVariantStock(
      variant.product_id,
      variantId,
      parseInt(warehouseId),
      stockData,
    );

    res.status(200).json({
      success: true,
      data: {
        ...result,
        warehouse_name: warehouse.name,
        warehouse_type: warehouse.type,
        available_quantity:
          result.stock_quantity - (result.reserved_quantity || 0),
      },
      message: "Variant warehouse stock updated successfully",
    });
  } catch (error) {
    console.error("Server error in updateVariantWarehouseStock:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const addProductVariantWithStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      variant_name,
      variant_price,
      variant_old_price,
      variant_discount,
      variant_stock,
      variant_weight,
      variant_unit,
      shipping_amount,
      is_default,
      variant_image_url,
      warehouse_stock,
    } = req.body;

    if (!variant_name || !variant_price || !variant_weight || !variant_unit) {
      return res
        .status(400)
        .json({ success: false, error: "Required fields missing" });
    }

    const product = await productDao.getById(productId);
    if (!product)
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });

    const variant = await productVariantDao.create({
      product_id: productId,
      variant_name: variant_name.trim(),
      variant_price: parseFloat(variant_price),
      variant_old_price: variant_old_price
        ? parseFloat(variant_old_price)
        : null,
      variant_discount: variant_discount ? parseInt(variant_discount) : 0,
      variant_stock: variant_stock ? parseInt(variant_stock) : 0,
      variant_weight: variant_weight.trim(),
      variant_unit: variant_unit.trim(),
      shipping_amount: shipping_amount ? parseFloat(shipping_amount) : 0,
      is_default: Boolean(is_default),
      variant_image_url: variant_image_url?.trim() || null,
      active: true,
    });

    let warehouseStockResults = [];
    if (
      warehouse_stock &&
      Array.isArray(warehouse_stock) &&
      warehouse_stock.length > 0
    ) {
      const stockRecords = warehouse_stock.map((ws) => ({
        product_id: productId,
        warehouse_id: parseInt(ws.warehouse_id),
        variant_id: variant.id,
        stock_quantity: parseInt(ws.stock_quantity) || 0,
        reserved_quantity: 0,
        minimum_threshold: parseInt(ws.minimum_threshold) || 10,
        cost_per_unit: parseFloat(ws.cost_per_unit) || 0,
      }));
      await productWarehouseStockDao.createMany(stockRecords);
      warehouseStockResults = await productWarehouseStockDao.listByVariant(
        variant.id,
      );
    }

    res.status(201).json({
      success: true,
      variant,
      warehouse_stock: warehouseStockResults,
      message: "Variant added successfully with warehouse stock",
    });
  } catch (error) {
    console.error("Server error in addProductVariantWithStock:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// --- Availability & Transfers ---

export const checkProductAvailability = async (req, res) => {
  try {
    const { product_id, pincode } = req.query;
    if (!product_id || !pincode)
      return res
        .status(400)
        .json({ success: false, error: "Missing parameters" });

    const product = await productDao.getById(product_id);
    if (!product)
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });

    const divisionWarehouse = await warehousePincodeDao.getByPincode(pincode);
    if (divisionWarehouse) {
      const divisionStock =
        await productWarehouseStockDao.getByProductAndWarehouse(
          product_id,
          divisionWarehouse.warehouse_id,
        );
      if (
        divisionStock &&
        divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0) >
        0
      ) {
        return res.json({
          success: true,
          available: true,
          warehouse_type: "division",
          warehouse_id: divisionWarehouse.warehouse_id,
          warehouse_name: divisionWarehouse.warehouses?.name,
          delivery_days: 1,
          delivery_message: "Delivery in 1 day",
          available_quantity:
            divisionStock.stock_quantity -
            (divisionStock.reserved_quantity || 0),
          pincode_info: {
            pincode: divisionWarehouse.pincode,
            city: divisionWarehouse.city,
            state: divisionWarehouse.state,
          },
        });
      }
    }

    const zonePincode = await zonePincodeDao.getByPincode(pincode);
    if (zonePincode) {
      const zonalWarehouses = await deliveryZoneDao.getZonalWarehouses(
        zonePincode.zone_id,
      );
      for (const warehouse of zonalWarehouses) {
        const zonalStock =
          await productWarehouseStockDao.getByProductAndWarehouse(
            product_id,
            warehouse.id,
          );
        if (
          zonalStock &&
          zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0) > 0
        ) {
          return res.json({
            success: true,
            available: true,
            warehouse_type: "zonal",
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            delivery_days: 3,
            delivery_message: "Delivery in 3-4 working days",
            available_quantity:
              zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0),
            pincode_info: {
              pincode: zonePincode.pincode,
              city: zonePincode.city,
              state: zonePincode.state,
            },
          });
        }
      }
    }

    return res.json({
      success: true,
      available: false,
      delivery_message: "Not available for delivery to this pincode",
      pincode_info: { pincode },
    });
  } catch (error) {
    console.error("Error in checkProductAvailability:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const checkCartAvailability = async (req, res) => {
  try {
    const { items, pincode, latitude, longitude } = req.body;

    // Validate required parameters
    if (!items || !Array.isArray(items)) {
      return res
        .status(400)
        .json({ success: false, error: "Items array is required." });
    }

    if (!pincode) {
      return res
        .status(400)
        .json({ success: false, error: "Pincode is required." });
    }

    if (items.length === 0) {
      return res.status(200).json({
        success: true,
        all_available: true,
        pincode,
        items: [],
      });
    }

    // Use the cart-availability DAO for proper validation
    const result = await cartAvailabilityDAO.checkDeliveryAvailability(
      items,
      latitude,
      longitude,
      pincode,
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error in checkCartAvailability:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const autoTransferInventory = async (req, res) => {
  try {
    const { product_id, division_warehouse_id, quantity } = req.body;
    const divisionWarehouse = await warehouseDao.getById(division_warehouse_id);
    if (
      !divisionWarehouse ||
      divisionWarehouse.type !== "division" ||
      !divisionWarehouse.parent_warehouse_id
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid warehouse" });
    }

    const divisionStock =
      await productWarehouseStockDao.getByProductAndWarehouse(
        product_id,
        division_warehouse_id,
      );
    const zonalStock = await productWarehouseStockDao.getByProductAndWarehouse(
      product_id,
      divisionWarehouse.parent_warehouse_id,
    );

    if (!divisionStock || !zonalStock)
      return res
        .status(404)
        .json({ success: false, error: "Stock record not found" });

    const zonalAvailable =
      zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0);
    const transferQty = quantity || divisionStock.minimum_threshold || 10;

    if (zonalAvailable < transferQty)
      return res
        .status(400)
        .json({ success: false, error: "Insufficient zonal stock" });

    // Update stock via DAO
    await productWarehouseStockDao.upsertStock(
      product_id,
      divisionWarehouse.parent_warehouse_id,
      {
        stock_quantity: zonalStock.stock_quantity - transferQty,
      },
    );
    await productWarehouseStockDao.upsertStock(
      product_id,
      division_warehouse_id,
      {
        stock_quantity: divisionStock.stock_quantity + transferQty,
        last_restocked_at: new Date(),
      },
    );

    // Log movements
    await stockMovementDao.create({
      product_id,
      warehouse_id: divisionWarehouse.parent_warehouse_id,
      movement_type: "outbound",
      quantity: transferQty,
      previous_stock: zonalStock.stock_quantity,
      new_stock: zonalStock.stock_quantity - transferQty,
      reference_type: "auto_transfer",
      reference_id: division_warehouse_id.toString(),
      reason: `Auto transfer to ${divisionWarehouse.name}`,
    });
    await stockMovementDao.create({
      product_id,
      warehouse_id: division_warehouse_id,
      movement_type: "inbound",
      quantity: transferQty,
      previous_stock: divisionStock.stock_quantity,
      new_stock: divisionStock.stock_quantity + transferQty,
      reference_type: "auto_transfer",
      reference_id: divisionWarehouse.parent_warehouse_id.toString(),
      reason: `Auto transfer from zonal`,
    });

    res.json({ success: true, message: "Inventory transferred successfully" });
  } catch (error) {
    console.error("Error in autoTransferInventory:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const monitorAndAutoTransfer = async (req, res) => {
  try {
    const lowStockThreshold = 2;
    const records = await prisma.product_warehouse_stock.findMany({
      where: {
        is_active: true,
        stock_quantity: { lte: lowStockThreshold },
        warehouses: { type: "division" },
      },
      include: { warehouses: true },
    });

    const transfers = [];
    for (const item of records) {
      const parentId = item.warehouses?.parent_warehouse_id;
      if (!parentId) continue;

      const zonalStock =
        await productWarehouseStockDao.getByProductAndWarehouse(
          item.product_id,
          parentId,
        );
      const transferQty = item.minimum_threshold || 10;

      if (
        zonalStock &&
        zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0) >=
        transferQty
      ) {
        await productWarehouseStockDao.upsertStock(item.product_id, parentId, {
          stock_quantity: zonalStock.stock_quantity - transferQty,
        });
        await productWarehouseStockDao.upsertStock(
          item.product_id,
          item.warehouse_id,
          {
            stock_quantity: item.stock_quantity + transferQty,
            last_restocked_at: new Date(),
          },
        );

        await stockMovementDao.create({
          product_id: item.product_id,
          warehouse_id: parentId,
          movement_type: "outbound",
          quantity: transferQty,
          previous_stock: zonalStock.stock_quantity,
          new_stock: zonalStock.stock_quantity - transferQty,
          reference_type: "auto_transfer_monitor",
          reference_id: item.warehouse_id.toString(),
          reason: `Auto transfer low stock`,
        });
        await stockMovementDao.create({
          product_id: item.product_id,
          warehouse_id: item.warehouse_id,
          movement_type: "inbound",
          quantity: transferQty,
          previous_stock: item.stock_quantity,
          new_stock: item.stock_quantity + transferQty,
          reference_type: "auto_transfer_monitor",
          reference_id: parentId.toString(),
          reason: `Auto transfer from zonal`,
        });
        transfers.push({
          product_id: item.product_id,
          warehouse_id: item.warehouse_id,
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${transfers.length} transfers`,
    });
  } catch (error) {
    console.error("Error in monitorAndAutoTransfer:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get related products by subcategory
export const getRelatedProductsBySubcategory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 12, warehouse_id } = req.query;

    // Get the product to find its subcategory
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { subcategory_id: true },
    });

    if (!product || !product.subcategory_id) {
      return res
        .status(404)
        .json({ success: false, error: "Product not found" });
    }

    // Fetch related products from same subcategory
    const relatedProducts = await prisma.products.findMany({
      where: {
        subcategory_id: product.subcategory_id,
        id: { not: productId }, // Exclude current product
        active: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        rating: true,
        review_count: true,
        active: true,
        created_at: true,
        category_id: true,
        subcategory_id: true,
        store_id: true,
        has_variants: true,
        variants: {
          where: { active: true },
          orderBy: { is_default: "desc" },
          take: 3,
          select: {
            id: true,
            title: true,
            price: true,
            old_price: true,
            is_default: true,
          },
        },
        media: {
          where: { is_primary: true },
          take: 1,
          select: {
            id: true,
            url: true,
            media_type: true,
          },
        },
        brands: {
          take: 1,
          select: {
            brand: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: parseInt(limit),
    });

    // Enrich with inventory data
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      relatedProducts,
      warehouse_id ? parseInt(warehouse_id) : null,
    );

    // Compute prices for each product
    const productsWithPrices = enrichedProducts.map((p) => {
      const defaultVariant =
        p.variants?.find((v) => v.is_default) || p.variants?.[0];
      return {
        ...p,
        price: defaultVariant?.price || 0,
        old_price:
          defaultVariant?.old_price || defaultVariant?.price * 1.2 || 0,
        image: p.media?.[0]?.url || "",
        brand: p.brands?.[0]?.brand?.name || null,
      };
    });

    res.status(200).json({
      success: true,
      products: productsWithPrices,
      total: productsWithPrices.length,
    });
  } catch (error) {
    console.error("Error fetching related products:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
