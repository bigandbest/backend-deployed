import { supabase } from "../config/supabaseClient.js";
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
import prisma from "../config/prisma.js";

const VARIANT_JOIN = "product_variants(*)";
const MEDIA_JOIN = "product_media(url, media_type, is_primary, sort_order)";

const extractMediaUrls = (product) => {
  const mediaRaw = Array.isArray(product?.media)
    ? product.media
    : Array.isArray(product?.media)
      ? product.media
      : [];

  const mediaSorted = [...mediaRaw].sort((a, b) => {
    const ap = a?.is_primary ? 1 : 0;
    const bp = b?.is_primary ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const ao = typeof a?.sort_order === "number" ? a.sort_order : 0;
    const bo = typeof b?.sort_order === "number" ? b.sort_order : 0;
    return ao - bo;
  });

  const urls = mediaSorted.map((m) => m?.url).filter(Boolean);
  const primaryUrl = urls[0] || product?.image || null;
  return { primaryUrl, urls };
};

// Helper for consistency in transformations
const transformProduct = (product, assignments = []) => {
  const activeVariants = (product.variants || []).filter(v => v.active !== false);
  const defaultVariant = activeVariants.find(v => v.is_default === true);

  // Calculate total stock from all variant warehouse stocks
  const totalStock = activeVariants.reduce((sum, variant) => {
    const variantStock = (variant.warehouse_stock || []).reduce(
      (variantSum, ws) => variantSum + (ws.stock_quantity || 0),
      0
    );
    return sum + variantStock;
  }, 0);

  // Extract image from product_media
  const productImage = product.media?.[0]?.url || product.image || null;
  const productImages = (product.media || []).map(media => media.url).filter(Boolean);

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    oldPrice: product.old_price,
    rating: product.rating || 4.0,
    reviews: product.review_count || 0,
    discount: product.discount || 0,
    image: productImage,
    images: productImages.length > 0 ? productImages : product.images,
    inStock: totalStock > 0,
    stock: totalStock,
    stockQuantity: totalStock,
    popular: product.popular,
    featured: product.featured,
    most_orders: product.most_orders,
    top_sale: product.top_sale,
    category: product.category?.name || product.category_name || product.category,
    weight: product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
    brand: product.brand_name || "BigandBest",
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
    warehouse_assignments: assignments
  };
};

export const getAllProducts = async (req, res) => {
  try {
    // Use Prisma through ProductDAO instead of Supabase
    const result = await productDao.listProducts(
      { active: true },
      { limit: 1000, page: 1 },
    );

    // Transform products to include proper stock calculation and images
    const transformedProducts = (result.items || []).map((product) => {
      const activeVariants = (product.variants || []).filter(v => v.active !== false);
      const totalStock = activeVariants.reduce((sum, variant) => {
        const variantStock = (variant.warehouse_stock || []).reduce(
          (variantSum, ws) => variantSum + (ws.stock_quantity || 0),
          0
        );
        return sum + variantStock;
      }, 0);

      // Extract image from product_media
      const productImage = product.media?.[0]?.url || product.image || null;
      const productImages = (product.media || []).map(media => media.url).filter(Boolean);

      return {
        ...product,
        image: productImage,
        images: productImages.length > 0 ? productImages : product.images,
        inStock: totalStock > 0,
        stock: totalStock,
        stockQuantity: totalStock,
      };
    });

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: result.total || 0,
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

    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
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

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(200).json({ success: true, products: [] });
    }

    const products = await productDao.getProductsByIds(product_ids);
    const transformed = products.map(product => transformProduct(product));

    return res.status(200).json({ success: true, products: transformed });
  } catch (error) {
    console.error("getProductsCartData error:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
  try {
    const products = await productDao.getFeaturedProducts(20);
    const transformedProducts = products.map(product => transformProduct(product));

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

export const getEverydayEssentials = async (req, res) => {
  try {
    const products = await productDao.getEverydayEssentials(20);
    const transformedProducts = products.map(product => transformProduct(product));

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

export const getTopProducts = async (req, res) => {
  try {
    const products = await productDao.getTopProducts(20);
    const transformedProducts = products.map(product => transformProduct(product));

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
      ...(category && { category_id: category }), // Assuming category ID for now, or name if handled by DAO
      ...(minPrice && { price: { gte: parseFloat(minPrice) } }),
      ...(maxPrice && { price: { lte: parseFloat(maxPrice) } }),
      ...(featured === "true" && { featured: true }),
      ...(popular === "true" && { popular: true }),
      ...(most_orders === "true" && { most_orders: true }),
      ...(top_sale === "true" && { top_sale: true }),
    };

    const { items: products, total, totalPages } = await productDao.listProducts(
      filters,
      { page: parseInt(page), limit: parseInt(limit) }
    );

    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
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
    const { pincode } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    const product = await productDao.getProductById(id);

    if (!product || !product.active) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Get delivery information
    let deliveryInfo = {
      delivery_type: product.delivery_type || "nationwide",
      delivery_available: true,
      delivery_zones: [],
      delivery_notes: product.delivery_notes || null,
    };

    if (
      product.delivery_type === "zonal" &&
      product.allowed_zone_ids &&
      product.allowed_zone_ids.length > 0
    ) {
      const zones = await deliveryZoneDao.listByIds(product.allowed_zone_ids);
      deliveryInfo.delivery_zones = zones;
    }

    // Check pincode-specific delivery if pincode provided
    if (pincode && /^\d{6}$/.test(pincode)) {
      const canDeliver = await productDao.canDeliverToPincode(id, pincode);
      deliveryInfo.can_deliver_to_pincode = canDeliver;
      deliveryInfo.checked_pincode = pincode;
    }

    const transformedProduct = transformProduct(product);

    res.status(200).json({
      success: true,
      product: {
        ...transformedProduct,
        delivery_info: deliveryInfo,
        store_id: product.store_id,
        store_name: product.store?.name || null,
        brand_id: product.brand_id,
        brand_name: product.brand_name,
        enable_bulk_pricing: product.enable_bulk_pricing,
        bulk_min_quantity: product.bulk_min_quantity,
        bulk_discount_percentage: product.bulk_discount_percentage,
        faq: product.faq,
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

    if (delivery_type === "zonal" && (!allowed_zone_ids || allowed_zone_ids.length === 0)) {
      return res.status(400).json({ error: "Zone IDs are required for zonal delivery" });
    }

    let finalZoneIds = delivery_type === "nationwide" ? [] : allowed_zone_ids;

    if (finalZoneIds.length > 0) {
      const zones = await deliveryZoneDao.listByIds(finalZoneIds);
      if (!zones || zones.length !== finalZoneIds.length) {
        return res.status(400).json({ error: "One or more zone IDs are invalid or inactive" });
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
      return res.status(400).json({ error: "Valid 6-digit pincode is required" });
    }

    if (!product_items || !Array.isArray(product_items) || product_items.length === 0) {
      return res.status(400).json({ error: "Product items are required" });
    }

    const results = await Promise.all(
      product_items.map(async (item) => {
        const canDeliver = await productDao.canDeliverToPincode(parseInt(item.product_id), pincode);
        return {
          product_id: item.product_id,
          pincode,
          can_deliver: canDeliver,
        };
      })
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
export const getProductsByDeliveryZone = async (req, res) => {
  try {
    const { pincode, category, limit = 20, offset = 0 } = req.query;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        error: "Valid 6-digit pincode is required",
      });
    }

    // Get zones for this pincode
    const { data: zones } = await supabase.rpc("get_zones_for_pincode", {
      target_pincode: pincode,
    });

    if (!zones || zones.length === 0) {
      return res.status(200).json({
        success: true,
        products: [],
        message: "No delivery zones found for this pincode",
        pincode,
        zones: [],
      });
    }

    const zoneIds = zones.map((z) => z.zone_id);

    // Build query for deliverable products
    let query = supabase
      .from("products")
      .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
      .eq("active", true)
      .or(
        `delivery_type.eq.nationwide,and(delivery_type.eq.zonal,allowed_zone_ids.ov.{${zoneIds.join(
          ","
        )}})`
      )
      .range(offset, offset + limit - 1);

    // Add category filter if provided
    if (category) {
      query = query.eq("category", category);
    }

    const { data: products, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Transform products
    const transformedProducts = products.map((product) => {
      const activeVariants = (product.product_variants || []).filter(v => v.active !== false);
      const totalStock = activeVariants.reduce((sum, variant) => {
        const variantStock = (variant.warehouse_stock || []).reduce(
          (variantSum, ws) => variantSum + (ws.stock_quantity || 0),
          0
        );
        return sum + variantStock;
      }, 0);

      const { primaryUrl: productImage, urls: productImages } = extractMediaUrls(product);

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        oldPrice: product.old_price,
        rating: product.rating || 4.0,
        reviews: product.review_count || 0,
        discount: product.discount || 0,
        image: productImage,
        images: productImages.length > 0 ? productImages : product.images,
        inStock: totalStock > 0,
        stock: totalStock,
        popular: product.popular,
        featured: product.featured,
        category: product.category,
        weight:
          product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
        brand: product.brand_name || "BigandBest",
        shipping_amount: product.shipping_amount || 0,
        delivery_type: product.delivery_type,
        delivery_available: true,
        created_at: product.created_at,
        hasVariants: product.product_variants?.length > 0,
        variants: product.product_variants || [],
        defaultVariant:
          product.product_variants?.find((v) => v.is_default === true) || null,
      };
    });

    res.status(200).json({
      success: true,
      products: transformedProducts,
      pincode,
      zones: zones,
      total: transformedProducts.length,
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

    let products = [];

    // If section_key is provided, fetch products from section mappings
    if (section_key) {
      // Get section info
      const { data: sectionData, error: sectionError } = await supabase
        .from("product_sections")
        .select("*")
        .eq("section_key", section_key)
        .eq("is_active", true)
        .maybeSingle();

      if (!sectionError && sectionData) {
        // Get direct section-product mappings
        const { data: directMappings, error: directMappingsError } =
          await supabase
            .from("store_section_mappings")
            .select(
              `
            products!inner(
              *,
              product_variants(*),
              product_media(url, media_type, is_primary, sort_order)
            )
          `
            )
            .eq("section_id", sectionData.id)
            .eq("mapping_type", "section_product")
            .eq("is_active", true)
            .limit(parseInt(limit));

        if (!directMappingsError && directMappings) {
          products = directMappings.map((mapping) => mapping.products);
        }
      }

      // If no products found from section mappings, fall back to latest products
      if (products.length === 0) {
        const { data: latestData, error: latestError } = await supabase
          .from("products")
          .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(parseInt(limit));

        if (!latestError && latestData) {
          products = latestData;
        }
      }
    } else if (filter === "new_arrivals") {
      // Get latest products
      const { data: productDetails, error: detailsError } = await supabase
        .from("products")
        .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit));

      if (!detailsError && productDetails) {
        products = productDetails;
      }
    } else if (filter === "best_sellers" || !filter) {
      // Default to best sellers (current logic)
      // First, get top selling products based on order_items quantity
      const { data: orderItems, error: orderError } = await supabase
        .from("order_items")
        .select("product_id, quantity");

      let topSellingProductIds = [];

      if (!orderError && orderItems) {
        // Aggregate quantities by product_id
        const salesMap = {};
        orderItems.forEach((item) => {
          if (item.product_id && item.quantity) {
            salesMap[item.product_id] =
              (salesMap[item.product_id] || 0) + item.quantity;
          }
        });

        // Sort by total quantity sold (descending)
        topSellingProductIds = Object.entries(salesMap)
          .sort(([, a], [, b]) => b - a)
          .slice(0, parseInt(limit))
          .map(([productId]) => productId);
      }

      if (topSellingProductIds.length > 0) {
        // Get product details for top selling products
        const { data: productDetails, error: detailsError } = await supabase
          .from("products")
          .select(
            `
            *,
            product_variants!left(
              id,
              variant_name,
              variant_price,
              variant_old_price,
              variant_discount,
              variant_stock,
              variant_weight,
              variant_unit,
              variant_image,
              is_default
            ),
            product_media(
              url,
              media_type,
              is_primary,
              sort_order
            )
          `
          )
          .in("id", topSellingProductIds)
          .eq("active", true);

        if (!detailsError && productDetails) {
          // Sort products to match the order of top selling
          const productMap = productDetails.reduce((map, product) => {
            map[product.id] = product;
            return map;
          }, {});

          products = topSellingProductIds
            .map((id) => productMap[id])
            .filter((product) => product); // Remove any null products
        }
      }

      // If we don't have enough top selling products, fill with latest products
      if (products.length < parseInt(limit)) {
        const remainingLimit = parseInt(limit) - products.length;
        const excludeIds = products.map((p) => p.id);

        let latestQuery = supabase
          .from("products")
          .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(remainingLimit);

        if (excludeIds.length > 0) {
          latestQuery = latestQuery.not(
            "id",
            "in",
            `(${excludeIds.join(",")})`
          );
        }

        const { data: latestData, error: latestError } = await latestQuery;

        if (!latestError && latestData) {
          products = [...products, ...latestData];
        }
      }
    } else if (filter === "trending") {
      // For trending, use products with recent orders (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentOrderItems, error: recentError } = await supabase
        .from("order_items")
        .select("product_id, quantity, orders!inner(created_at)")
        .gte("orders.created_at", thirtyDaysAgo.toISOString());

      let trendingProductIds = [];

      if (!recentError && recentOrderItems) {
        const trendingMap = {};
        recentOrderItems.forEach((item) => {
          if (item.product_id && item.quantity) {
            trendingMap[item.product_id] =
              (trendingMap[item.product_id] || 0) + item.quantity;
          }
        });

        trendingProductIds = Object.entries(trendingMap)
          .sort(([, a], [, b]) => b - a)
          .slice(0, parseInt(limit))
          .map(([productId]) => productId);
      }

      if (trendingProductIds.length > 0) {
        const { data: productDetails, error: detailsError } = await supabase
          .from("products")
          .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
          .in("id", trendingProductIds)
          .eq("active", true);

        if (!detailsError && productDetails) {
          const productMap = productDetails.reduce((map, product) => {
            map[product.id] = product;
            return map;
          }, {});

          products = trendingProductIds
            .map((id) => productMap[id])
            .filter((product) => product);
        }
      }

      // Fill with latest if needed
      if (products.length < parseInt(limit)) {
        const remainingLimit = parseInt(limit) - products.length;
        const excludeIds = products.map((p) => p.id);

        let latestQuery = supabase
          .from("products")
          .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(remainingLimit);

        if (excludeIds.length > 0) {
          latestQuery = latestQuery.not(
            "id",
            "in",
            `(${excludeIds.join(",")})`
          );
        }

        const { data: latestData, error: latestError } = await latestQuery;

        if (!latestError && latestData) {
          products = [...products, ...latestData];
        }
      }
    } else if (filter === "top_sale") {
      // Get products marked as top sale
      const { data: productDetails, error: detailsError } = await supabase
        .from("products")
        .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
        .eq("active", true)
        .eq("top_sale", true)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit));

      if (!detailsError && productDetails) {
        products = productDetails;
      }
    } else if (filter === "most_orders") {
      // Get products marked as most ordered
      const { data: productDetails, error: detailsError } = await supabase
        .from("products")
        .select(`*, ${VARIANT_JOIN}, ${MEDIA_JOIN}`)
        .eq("active", true)
        .eq("most_orders", true)
        .order("created_at", { ascending: false })
        .limit(parseInt(limit));

      if (!detailsError && productDetails) {
        products = productDetails;
      }
    }

    console.log("Quick picks data:", products.length, "products found");

    // Transform the data to match frontend expectations
    const transformedProducts = products.map((product) => {
      const defaultVariant = product.product_variants?.find(
        (v) => v.is_default === true
      );
      const activeVariants = (product.product_variants || []).filter(v => v.active !== false);
      const totalStock = activeVariants.reduce((sum, variant) => {
        const variantStock = (variant.warehouse_stock || []).reduce(
          (variantSum, ws) => variantSum + (ws.stock_quantity || 0),
          0
        );
        return sum + variantStock;
      }, 0);

      const { primaryUrl: productImage, urls: productImages } = extractMediaUrls(product);

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        // ✅ ALWAYS use main product pricing for card display (NEVER variant pricing)
        price: product.price,
        oldPrice: product.old_price,
        rating: product.rating || 4.0,
        reviews: product.review_count || 0,
        discount: product.discount || 0,
        image: productImage,
        images: productImages.length > 0 ? productImages : product.images,
        inStock: totalStock > 0,
        stock: totalStock,
        popular: product.popular,
        featured: product.featured,
        most_orders: product.most_orders,
        top_sale: product.top_sale,
        category: product.category,
        category_info: product.categories,
        weight:
          product.uom ||
          `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
        brand: product.brand_name || "BigandBest",
        shipping_amount: product.shipping_amount || 0,
        specifications: product.specifications,
        created_at: product.created_at,
        hasVariants: product.product_variants?.length > 0,
        variants: product.product_variants || [],
        defaultVariant: defaultVariant,
        // ✅ Preserve original product data (for card display)
        originalPrice: product.price,
        originalOldPrice: product.old_price,
        originalStock: product.stock || 0,
        // ✅ Ensure main product data is never overridden
        cardPrice: product.price,
        cardOldPrice: product.old_price,
      };
    });

    res.status(200).json({
      success: true,
      products: transformedProducts.slice(0, parseInt(limit)),
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get products by subcategory
export const getProductsBySubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    const products = await productDao.getProductsByFilter({ subcategoryId });
    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
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

    const products = await productDao.getProductsByFilter({ groupId });
    const transformedProducts = products.map(product => transformProduct(product));

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
      return res.status(400).json({ success: false, error: "Warehouse assignments array is required" });
    }

    const product = await productDao.getProductById(product_id);
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });

    const results = [];
    for (const assignment of warehouse_assignments) {
      const { warehouse_id, stock_quantity, minimum_threshold = 0, maximum_capacity } = assignment;

      try {
        const existingStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, warehouse_id);
        const stockData = {
          stock_quantity,
          minimum_threshold,
          maximum_capacity,
          last_updated_by: req.user?.id
        };

        let result;
        if (existingStock) {
          result = await productWarehouseStockDao.upsertStock(product_id, warehouse_id, stockData);
          results.push({ warehouse_id, action: "updated", data: result });
        } else {
          stockData.last_restocked_at = new Date();
          result = await productWarehouseStockDao.upsertStock(product_id, warehouse_id, stockData);
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
            performed_by: req.user?.id
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
      product_info: { id: product.id, name: product.name, delivery_type: product.delivery_type }
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
      maxDiscount: parseFloat(maxDiscount)
    });

    const transformedProducts = products.slice(0, parseInt(limit)).map(product => transformProduct(product));

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
      maxDiscount: parseFloat(maxDiscount)
    });

    const transformedProducts = products.slice(0, parseInt(limit)).map(product => transformProduct(product));

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

    // Ensure brandId filters products correctly by using brandIds array
    const products = await productDao.getProductsByFilter({ brandIds: [brandId] });
    const transformedProducts = products.map((product) => transformProduct(product));

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
      return res.status(400).json({ success: false, error: "product_ids array is required" });
    }

    const products = await productDao.getRelatedProducts(product_ids);
    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts
    });
  } catch (error) {
    console.error("getRelatedProducts error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get new arrivals - latest products
export const getNewArrivals = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const products = await productDao.getNewArrivals(parseInt(limit));
    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("getNewArrivals error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get super saver products - lowest priced products
export const getSuperSaver = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const products = await productDao.getSuperSaver(parseInt(limit));
    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("getSuperSaver error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// Get products related by subcategory
export const getRelatedProductsBySubcategory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 10 } = req.query;

    if (!productId) {
      return res.status(400).json({ success: false, error: "productId is required" });
    }

    const products = await productDao.getRelatedProductsBySubcategory(productId, parseInt(limit));
    const transformedProducts = products.map(product => transformProduct(product));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
    });
  } catch (error) {
    console.error("getRelatedProductsBySubcategory error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// --- Variant Management ---

export const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const variants = await productVariantDao.listByProduct(productId, true);

    res.status(200).json({
      success: true,
      variants: variants || [],
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
        error: "Required fields: variant_name, variant_price, variant_weight, variant_unit"
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
      variant_old_price: variant_old_price ? parseFloat(variant_old_price) : null,
      variant_discount: variant_discount ? parseInt(variant_discount) : 0,
      variant_stock: variant_stock ? parseInt(variant_stock) : 0,
      variant_weight: variant_weight.trim(),
      variant_unit: variant_unit.trim(),
      shipping_amount: shipping_amount ? parseFloat(shipping_amount) : 0,
      is_default: Boolean(is_default),
      variant_image_url: variant_image_url?.trim() || null,
      active: true
    });

    res.status(201).json({
      success: true,
      variant,
      message: "Variant added successfully"
    });
  } catch (error) {
    console.error('Server error in addProductVariant:', error);
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
      if (isNaN(price) || price <= 0) return res.status(400).json({ error: "Invalid variant price" });
      sanitizedData.variant_price = price;
    }

    if (sanitizedData.variant_old_price !== undefined) {
      sanitizedData.variant_old_price = sanitizedData.variant_old_price ? parseFloat(sanitizedData.variant_old_price) : null;
    }

    if (sanitizedData.variant_discount !== undefined) {
      sanitizedData.variant_discount = parseInt(sanitizedData.variant_discount) || 0;
    }

    if (sanitizedData.variant_stock !== undefined) {
      sanitizedData.variant_stock = parseInt(sanitizedData.variant_stock) || 0;
    }

    if (sanitizedData.variant_name) sanitizedData.variant_name = sanitizedData.variant_name.trim();

    const updated = await productVariantDao.update(variantId, sanitizedData);

    res.status(200).json({
      success: true,
      variant: updated,
      message: "Variant updated successfully"
    });
  } catch (error) {
    console.error('Server error in updateProductVariant:', error);
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
      message: "Variant deleted successfully"
    });
  } catch (error) {
    console.error('Server error in deleteProductVariant:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateVariantStock = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { variant_stock, active } = req.body;

    if (variant_stock === undefined && active === undefined) {
      return res.status(400).json({ error: "variant_stock or active status is required" });
    }

    const existingVariant = await productVariantDao.getById(variantId);
    if (!existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const updateData = {};
    if (variant_stock !== undefined) {
      const stock = parseInt(variant_stock);
      if (isNaN(stock) || stock < 0) return res.status(400).json({ error: "Invalid stock quantity" });
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
      message: "Variant stock updated successfully"
    });
  } catch (error) {
    console.error('Server error in updateVariantStock:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getVariantWarehouseStock = async (req, res) => {
  try {
    const { variantId } = req.params;
    const variant = await productVariantDao.getById(variantId);
    if (!variant) {
      return res.status(404).json({ success: false, error: "Variant not found" });
    }

    const warehouseStock = await productWarehouseStockDao.listByVariant(variantId);

    const stockData = warehouseStock?.map(item => ({
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
      is_low_stock: item.stock_quantity <= (item.minimum_threshold || 0)
    })) || [];

    res.status(200).json({
      success: true,
      variant,
      warehouse_stock: stockData,
      total_warehouses: stockData.length
    });
  } catch (error) {
    console.error('Server error in getVariantWarehouseStock:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

export const updateVariantWarehouseStock = async (req, res) => {
  try {
    const { variantId, warehouseId } = req.params;
    const { stock_quantity, minimum_threshold, cost_per_unit } = req.body;

    const variant = await productVariantDao.getById(variantId);
    if (!variant) return res.status(404).json({ success: false, error: "Variant not found" });

    const warehouse = await warehouseDao.getById(warehouseId);
    if (!warehouse) return res.status(404).json({ success: false, error: "Warehouse not found" });

    const stockData = {
      stock_quantity: stock_quantity !== undefined ? parseInt(stock_quantity) : undefined,
      minimum_threshold: minimum_threshold !== undefined ? parseInt(minimum_threshold) : undefined,
      cost_per_unit: cost_per_unit !== undefined ? parseFloat(cost_per_unit) : undefined,
    };

    const result = await productWarehouseStockDao.upsertVariantStock(
      variant.product_id,
      variantId,
      parseInt(warehouseId),
      stockData
    );

    res.status(200).json({
      success: true,
      data: {
        ...result,
        warehouse_name: warehouse.name,
        warehouse_type: warehouse.type,
        available_quantity: result.stock_quantity - (result.reserved_quantity || 0)
      },
      message: "Variant warehouse stock updated successfully"
    });
  } catch (error) {
    console.error('Server error in updateVariantWarehouseStock:', error);
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
      warehouse_stock
    } = req.body;

    if (!variant_name || !variant_price || !variant_weight || !variant_unit) {
      return res.status(400).json({ success: false, error: "Required fields missing" });
    }

    const product = await productDao.getById(productId);
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });

    const variant = await productVariantDao.create({
      product_id: productId,
      variant_name: variant_name.trim(),
      variant_price: parseFloat(variant_price),
      variant_old_price: variant_old_price ? parseFloat(variant_old_price) : null,
      variant_discount: variant_discount ? parseInt(variant_discount) : 0,
      variant_stock: variant_stock ? parseInt(variant_stock) : 0,
      variant_weight: variant_weight.trim(),
      variant_unit: variant_unit.trim(),
      shipping_amount: shipping_amount ? parseFloat(shipping_amount) : 0,
      is_default: Boolean(is_default),
      variant_image_url: variant_image_url?.trim() || null,
      active: true
    });

    let warehouseStockResults = [];
    if (warehouse_stock && Array.isArray(warehouse_stock) && warehouse_stock.length > 0) {
      const stockRecords = warehouse_stock.map(ws => ({
        product_id: productId,
        warehouse_id: parseInt(ws.warehouse_id),
        variant_id: variant.id,
        stock_quantity: parseInt(ws.stock_quantity) || 0,
        reserved_quantity: 0,
        minimum_threshold: parseInt(ws.minimum_threshold) || 10,
        cost_per_unit: parseFloat(ws.cost_per_unit) || 0,
      }));
      await productWarehouseStockDao.createMany(stockRecords);
      warehouseStockResults = await productWarehouseStockDao.listByVariant(variant.id);
    }

    res.status(201).json({
      success: true,
      variant,
      warehouse_stock: warehouseStockResults,
      message: "Variant added successfully with warehouse stock"
    });
  } catch (error) {
    console.error('Server error in addProductVariantWithStock:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// --- Availability & Transfers ---

export const checkProductAvailability = async (req, res) => {
  try {
    const { product_id, pincode } = req.query;
    if (!product_id || !pincode) return res.status(400).json({ success: false, error: "Missing parameters" });

    const product = await productDao.getById(product_id);
    if (!product) return res.status(404).json({ success: false, error: "Product not found" });

    const divisionWarehouse = await warehousePincodeDao.getByPincode(pincode);
    if (divisionWarehouse) {
      const divisionStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, divisionWarehouse.warehouse_id);
      if (divisionStock && (divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0)) > 0) {
        return res.json({
          success: true,
          available: true,
          warehouse_type: "division",
          warehouse_id: divisionWarehouse.warehouse_id,
          warehouse_name: divisionWarehouse.warehouses?.name,
          delivery_days: 1,
          delivery_message: "Delivery in 1 day",
          available_quantity: divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0),
          pincode_info: { pincode: divisionWarehouse.pincode, city: divisionWarehouse.city, state: divisionWarehouse.state },
        });
      }
    }

    const zonePincode = await zonePincodeDao.getByPincode(pincode);
    if (zonePincode) {
      const zonalWarehouses = await deliveryZoneDao.getZonalWarehouses(zonePincode.zone_id);
      for (const warehouse of zonalWarehouses) {
        const zonalStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, warehouse.id);
        if (zonalStock && (zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0)) > 0) {
          return res.json({
            success: true,
            available: true,
            warehouse_type: "zonal",
            warehouse_id: warehouse.id,
            warehouse_name: warehouse.name,
            delivery_days: 3,
            delivery_message: "Delivery in 3-4 working days",
            available_quantity: zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0),
            pincode_info: { pincode: zonePincode.pincode, city: zonePincode.city, state: zonePincode.state },
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
    const { items, pincode } = req.body;
    if (!items || !Array.isArray(items) || !pincode) return res.status(400).json({ success: false, error: "Invalid input" });

    const divisionWarehouse = await warehousePincodeDao.getByPincode(pincode);
    const zonePincode = await zonePincodeDao.getByPincode(pincode);

    const results = [];
    let allAvailable = true;
    let maxDeliveryDays = 0;

    for (const item of items) {
      const { product_id, quantity } = item;
      const product = await productDao.getProductById(product_id);
      if (!product) {
        results.push({ product_id, available: false, error: "Product not found" });
        allAvailable = false;
        continue;
      }

      let availabilityInfo = null;
      if (divisionWarehouse) {
        const divisionStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, divisionWarehouse.warehouse_id);
        const availableQty = divisionStock ? divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0) : 0;
        if (availableQty >= quantity) {
          availabilityInfo = {
            product_id, product_name: product.name, available: true, warehouse_type: "division",
            warehouse_id: divisionWarehouse.warehouse_id, warehouse_name: divisionWarehouse.warehouses?.name,
            delivery_days: 1, delivery_message: "Delivery in 1 day", available_quantity: availableQty, requested_quantity: quantity,
          };
          maxDeliveryDays = Math.max(maxDeliveryDays, 1);
        }
      }

      if (!availabilityInfo && zonePincode) {
        const zonalWarehouses = await deliveryZoneDao.getZonalWarehouses(zonePincode.zone_id);
        for (const warehouse of zonalWarehouses) {
          const zonalStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, warehouse.id);
          const availableQty = zonalStock ? zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0) : 0;
          if (availableQty >= quantity) {
            availabilityInfo = {
              product_id, product_name: product.name, available: true, warehouse_type: "zonal",
              warehouse_id: warehouse.id, warehouse_name: warehouse.name,
              delivery_days: 3, delivery_message: "Delivery in 3-4 working days", available_quantity: availableQty, requested_quantity: quantity,
            };
            maxDeliveryDays = Math.max(maxDeliveryDays, 3);
            break;
          }
        }
      }

      if (availabilityInfo) {
        results.push(availabilityInfo);
      } else {
        results.push({ product_id, product_name: product.name, available: false, delivery_message: "Not available", requested_quantity: quantity });
        allAvailable = false;
      }
    }

    res.json({
      success: true, all_available: allAvailable, pincode, max_delivery_days: maxDeliveryDays,
      delivery_message: maxDeliveryDays === 1 ? "Delivery in 1 day" : maxDeliveryDays === 3 ? "Delivery in 3-4 working days" : "Delivery time varies",
      items: results,
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
    if (!divisionWarehouse || divisionWarehouse.type !== 'division' || !divisionWarehouse.parent_warehouse_id) {
      return res.status(400).json({ success: false, error: "Invalid warehouse" });
    }

    const divisionStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, division_warehouse_id);
    const zonalStock = await productWarehouseStockDao.getByProductAndWarehouse(product_id, divisionWarehouse.parent_warehouse_id);

    if (!divisionStock || !zonalStock) return res.status(404).json({ success: false, error: "Stock record not found" });

    const zonalAvailable = zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0);
    const transferQty = quantity || divisionStock.minimum_threshold || 10;

    if (zonalAvailable < transferQty) return res.status(400).json({ success: false, error: "Insufficient zonal stock" });

    // Update stock via DAO
    await productWarehouseStockDao.upsertStock(product_id, divisionWarehouse.parent_warehouse_id, {
      stock_quantity: zonalStock.stock_quantity - transferQty
    });
    await productWarehouseStockDao.upsertStock(product_id, division_warehouse_id, {
      stock_quantity: divisionStock.stock_quantity + transferQty,
      last_restocked_at: new Date()
    });

    // Log movements
    await stockMovementDao.create({
      product_id, warehouse_id: divisionWarehouse.parent_warehouse_id, movement_type: "outbound",
      quantity: transferQty, previous_stock: zonalStock.stock_quantity, new_stock: zonalStock.stock_quantity - transferQty,
      reference_type: "auto_transfer", reference_id: division_warehouse_id.toString(), reason: `Auto transfer to ${divisionWarehouse.name}`
    });
    await stockMovementDao.create({
      product_id, warehouse_id: division_warehouse_id, movement_type: "inbound",
      quantity: transferQty, previous_stock: divisionStock.stock_quantity, new_stock: divisionStock.stock_quantity + transferQty,
      reference_type: "auto_transfer", reference_id: divisionWarehouse.parent_warehouse_id.toString(), reason: `Auto transfer from zonal`
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
      where: { is_active: true, stock_quantity: { lte: lowStockThreshold }, warehouses: { type: 'division' } },
      include: { warehouses: true }
    });

    const transfers = [];
    for (const item of records) {
      const parentId = item.warehouses?.parent_warehouse_id;
      if (!parentId) continue;

      const zonalStock = await productWarehouseStockDao.getByProductAndWarehouse(item.product_id, parentId);
      const transferQty = item.minimum_threshold || 10;

      if (zonalStock && (zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0)) >= transferQty) {
        await productWarehouseStockDao.upsertStock(item.product_id, parentId, { stock_quantity: zonalStock.stock_quantity - transferQty });
        await productWarehouseStockDao.upsertStock(item.product_id, item.warehouse_id, { stock_quantity: item.stock_quantity + transferQty, last_restocked_at: new Date() });

        await stockMovementDao.create({
          product_id: item.product_id, warehouse_id: parentId, movement_type: "outbound",
          quantity: transferQty, previous_stock: zonalStock.stock_quantity, new_stock: zonalStock.stock_quantity - transferQty,
          reference_type: "auto_transfer_monitor", reference_id: item.warehouse_id.toString(), reason: `Auto transfer low stock`
        });
        await stockMovementDao.create({
          product_id: item.product_id, warehouse_id: item.warehouse_id, movement_type: "inbound",
          quantity: transferQty, previous_stock: item.stock_quantity, new_stock: item.stock_quantity + transferQty,
          reference_type: "auto_transfer_monitor", reference_id: parentId.toString(), reason: `Auto transfer from zonal`
        });
        transfers.push({ product_id: item.product_id, warehouse_id: item.warehouse_id });
      }
    }

    res.json({ success: true, message: `Processed ${transfers.length} transfers` });
  } catch (error) {
    console.error("Error in monitorAndAutoTransfer:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
