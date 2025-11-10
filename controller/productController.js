import { supabase } from "../config/supabaseClient.js";
import * as deliveryValidationService from "./deliveryValidationService.js";

export const getAllProducts = async (req, res) => {
  try {
    // Fetch products with their default variants
    const { data, error } = await supabase
      .from("products")
      .select(`
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
        )
      `)
      .eq("active", true);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Transform the data to match frontend expectations
    const transformedProducts = data.map((product) => {
      // Find default variant if exists
      const defaultVariant = product.product_variants?.find(v => v.is_default === true);
      
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
        image: product.image,
        images: product.images,
        inStock: (product.stock_quantity || product.stock || 0) > 0,
        stock: product.stock_quantity || product.stock || 0,
        stockQuantity: product.stock_quantity || product.stock || 0,
        popular: product.popular,
        featured: product.featured,
        category: product.category,
        weight: product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
        brand: product.brand_name || "BigandBest",
        shipping_amount: product.shipping_amount || 0,
        created_at: product.created_at,
        // ✅ Keep variants separate - DON'T let them override main product data
        hasVariants: product.product_variants?.length > 0,
        variants: product.product_variants || [],
        defaultVariant: defaultVariant,
        // ✅ Preserve original product data (for card display)
        originalPrice: product.price,
        originalOldPrice: product.old_price,
        originalStock: product.stock_quantity || product.stock || 0,
        // ✅ Ensure main product data is never overridden
        cardPrice: product.price,
        cardOldPrice: product.old_price
      };
    });

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

export const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .eq("category", category);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    const transformedProducts = data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      rating: product.rating || 4.0,
      reviews: product.review_count || 0,
      discount: product.discount || 0,
      image: product.image,
      images: product.images,
      inStock: (product.stock || 0) > 0,
      stock: product.stock || 0,
      popular: product.popular,
      featured: product.featured,
      category: product.category,
      weight:
        product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
      brand: product.brand_name || "BigandBest",
      shipping_amount: product.shipping_amount || 0,
      created_at: product.created_at,
    }));

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
    // First try to get categories from the categories table
    const { data: categoriesData, error: categoriesError } = await supabase
      .from("categories")
      .select("*")
      .eq("active", true);

    let categories = [];

    // If we have data from categories table, use that
    if (categoriesData && categoriesData.length > 0 && !categoriesError) {
      categories = categoriesData.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        image_url: cat.image_url,
        featured: cat.featured,
        icon: cat.icon,
      }));
    } else {
      // Fallback: get unique categories from products table
      const { data: productCategories, error: productError } = await supabase
        .from("products")
        .select("category")
        .not("category", "is", null)
        .eq("active", true);

      if (productCategories && !productError) {
        const uniqueProductCategories = [
          ...new Set(productCategories.map((item) => item.category)),
        ].filter(Boolean);

        categories = uniqueProductCategories.map((catName) => ({
          id: null,
          name: catName,
          description: null,
          image_url: null,
          featured: false,
          icon: null,
        }));
      }
    }

    res.status(200).json({
      success: true,
      categories: categories,
      total: categories.length,
    });
  } catch (error) {
    console.error("Server error in getAllCategories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        categories!products_category_id_fkey(
          id,
          name,
          description,
          image_url
        )
      `
      )
      .eq("active", true)
      .eq("featured", true)
      .limit(20);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    const transformedProducts = data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      rating: product.rating || 4.0,
      reviews: product.review_count || 0,
      discount: product.discount || 0,
      image: product.image,
      images: product.images,
      inStock: (product.stock || 0) > 0,
      stock: product.stock || 0,
      popular: product.popular,
      featured: product.featured,
      category: product.category,
      category_info: product.categories,
      uom: product.uom,
      brand_name: product.brand_name,
      shipping_amount: product.shipping_amount || 0,
      created_at: product.created_at,
    }));

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

// Get products with pagination and filters
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

    let query = supabase
      .from("products")
      .select(
        `
        *,
        categories!products_category_id_fkey(
          id,
          name,
          description,
          image_url
        )
      `,
        { count: "exact" }
      )
      .eq("active", true);

    // Apply filters
    if (category) {
      query = query.or(
        `category.eq.${category},categories.name.eq.${category}`
      );
    }

    if (minPrice) {
      query = query.gte("price", parseFloat(minPrice));
    }

    if (maxPrice) {
      query = query.lte("price", parseFloat(maxPrice));
    }

    if (featured === "true") {
      query = query.eq("featured", true);
    }

    if (popular === "true") {
      query = query.eq("popular", true);
    }

    if (most_orders === "true") {
      query = query.eq("most_orders", true);
    }

    if (top_sale === "true") {
      query = query.eq("top_sale", true);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    const transformedProducts = data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      rating: product.rating || 4.0,
      reviews: product.review_count || 0,
      discount: product.discount || 0,
      image: product.image,
      images: product.images,
      inStock: (product.stock || 0) > 0,
      stock: product.stock || 0,
      popular: product.popular,
      featured: product.featured,
      category: product.category,
      category_info: product.categories,
      uom: product.uom,
      brand_name: product.brand_name,
      shipping_amount: product.shipping_amount || 0,
      created_at: product.created_at,
    }));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit),
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

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("active", true)
      .single();

    if (error) {
      console.error("Supabase error:", error);
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Get delivery information
    let deliveryInfo = {
      delivery_type: data.delivery_type || "nationwide",
      delivery_available: true,
      delivery_zones: [],
      delivery_notes: data.delivery_notes || null,
    };

    // If delivery type is zonal, get zone details
    if (
      data.delivery_type === "zonal" &&
      data.allowed_zone_ids &&
      data.allowed_zone_ids.length > 0
    ) {
      const { data: zones } = await supabase
        .from("delivery_zones")
        .select("id, name, display_name")
        .in("id", data.allowed_zone_ids)
        .eq("is_active", true);

      if (zones) {
        deliveryInfo.delivery_zones = zones;
      }
    }

    // Check pincode-specific delivery if pincode provided
    if (pincode && /^\d{6}$/.test(pincode)) {
      const { data: canDeliver } = await supabase.rpc(
        "can_deliver_to_pincode",
        {
          product_id: parseInt(id),
          target_pincode: pincode,
        }
      );

      deliveryInfo.can_deliver_to_pincode = canDeliver;
      deliveryInfo.checked_pincode = pincode;
    }

    // Transform the data to match frontend expectations
    const transformedProduct = {
      id: data.id,
      name: data.name,
      description: data.description,
      price: data.price,
      oldPrice: data.old_price,
      rating: data.rating || 4.0,
      reviews: data.review_count || 0,
      discount: data.discount || 0,
      image: data.image,
      images: data.images,
      video: data.video,
      inStock: (data.stock_quantity || data.stock || 0) > 0,
      stock: data.stock_quantity || data.stock || 0,
      popular: data.popular,
      featured: data.featured,
      category: data.category,
      weight: data.uom || `${data.uom_value || 1} ${data.uom_unit || "kg"}`,
      brand: data.brand_name || "BigandBest",
      shipping_amount: data.shipping_amount || 0,
      specifications: data.specifications,
      created_at: data.created_at,
      delivery_info: deliveryInfo,
    };

    res.status(200).json({
      success: true,
      product: transformedProduct,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

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

    // Validate delivery_type
    if (delivery_type && !["nationwide", "zonal"].includes(delivery_type)) {
      return res.status(400).json({
        error: "Invalid delivery_type. Must be 'nationwide' or 'zonal'",
      });
    }

    // Validate zone IDs if delivery_type is zonal
    if (
      delivery_type === "zonal" &&
      (!allowed_zone_ids || allowed_zone_ids.length === 0)
    ) {
      return res.status(400).json({
        error: "Zone IDs are required for zonal delivery",
      });
    }

    // If nationwide, clear zone IDs
    let finalZoneIds = allowed_zone_ids;
    if (delivery_type === "nationwide") {
      finalZoneIds = [];
    }

    // Validate zone IDs exist and are active
    if (finalZoneIds.length > 0) {
      const { data: zones, error: zoneError } = await supabase
        .from("delivery_zones")
        .select("id")
        .in("id", finalZoneIds)
        .eq("is_active", true);

      if (zoneError || !zones || zones.length !== finalZoneIds.length) {
        return res.status(400).json({
          error: "One or more zone IDs are invalid or inactive",
        });
      }
    }

    // Update product delivery settings
    const updateData = {};
    if (delivery_type !== undefined) updateData.delivery_type = delivery_type;
    if (allowed_zone_ids !== undefined)
      updateData.allowed_zone_ids = finalZoneIds;
    if (delivery_restrictions !== undefined)
      updateData.delivery_restrictions = delivery_restrictions;
    if (delivery_notes !== undefined)
      updateData.delivery_notes = delivery_notes;

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select(
        "id, name, delivery_type, allowed_zone_ids, delivery_restrictions, delivery_notes"
      )
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({
      success: true,
      message: "Product delivery settings updated successfully",
      product: data,
    });
  } catch (error) {
    console.error("Update product delivery error:", error);
    res.status(500).json({
      error: "Failed to update delivery settings",
      message: error.message,
    });
  }
};

/**
 * Check delivery availability for multiple products
 */
export const checkProductsDelivery = async (req, res) => {
  try {
    const { product_ids, pincode } = req.body;

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        error: "Valid 6-digit pincode is required",
      });
    }

    if (
      !product_ids ||
      !Array.isArray(product_ids) ||
      product_ids.length === 0
    ) {
      return res.status(400).json({
        error: "Product IDs array is required",
      });
    }

    const deliveryResults = [];

    for (const productId of product_ids) {
      try {
        // Get product basic info
        const { data: product } = await supabase
          .from("products")
          .select("id, name, delivery_type, active")
          .eq("id", productId)
          .single();

        if (!product || !product.active) {
          deliveryResults.push({
            product_id: productId,
            product_name: product?.name || "Unknown",
            can_deliver: false,
            reason: "Product not found or inactive",
          });
          continue;
        }

        // Check delivery availability
        const { data: canDeliver } = await supabase.rpc(
          "can_deliver_to_pincode",
          {
            product_id: productId,
            target_pincode: pincode,
          }
        );

        deliveryResults.push({
          product_id: productId,
          product_name: product.name,
          delivery_type: product.delivery_type,
          can_deliver: canDeliver,
          reason: canDeliver ? "Available" : "Not available in your area",
        });
      } catch (productError) {
        console.error(`Error checking product ${productId}:`, productError);
        deliveryResults.push({
          product_id: productId,
          can_deliver: false,
          reason: "Error checking delivery",
        });
      }
    }

    res.status(200).json({
      success: true,
      pincode,
      results: deliveryResults,
      summary: {
        total_products: product_ids.length,
        deliverable: deliveryResults.filter((r) => r.can_deliver).length,
        non_deliverable: deliveryResults.filter((r) => !r.can_deliver).length,
      },
    });
  } catch (error) {
    console.error("Check products delivery error:", error);
    res.status(500).json({
      error: "Failed to check delivery availability",
      message: error.message,
    });
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
      .select("*")
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
    const transformedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      rating: product.rating || 4.0,
      reviews: product.review_count || 0,
      discount: product.discount || 0,
      image: product.image,
      images: product.images,
      inStock: (product.stock || 0) > 0,
      stock: product.stock || 0,
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
    }));

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
    const { limit = 30, filter } = req.query;

    let products = [];

    if (filter === "new_arrivals") {
      // Get latest products
      const { data: productDetails, error: detailsError } = await supabase
        .from("products")
        .select(`
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
          )
        `)
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
          .select(`
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
            )
          `)
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
          .select("*")
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
          .select("*")
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
          .select("*")
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
        .select("*")
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
        .select("*")
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
      const defaultVariant = product.product_variants?.find(v => v.is_default === true);
      
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
        image: product.image,
        images: product.images,
        inStock: (product.stock || 0) > 0,
        stock: product.stock || 0,
        popular: product.popular,
        featured: product.featured,
        most_orders: product.most_orders,
        top_sale: product.top_sale,
        category: product.category,
        category_info: product.categories,
        weight: product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
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
        cardOldPrice: product.old_price
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

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        categories!products_category_id_fkey(
          id,
          name,
          description,
          image_url
        )
      `
      )
      .eq("active", true)
      .eq("subcategory_id", subcategoryId);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    const transformedProducts = data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      rating: product.rating || 4.0,
      reviews: product.review_count || 0,
      discount: product.discount || 0,
      image: product.image,
      images: product.images,
      inStock: (product.stock || 0) > 0,
      stock: product.stock || 0,
      popular: product.popular,
      featured: product.featured,
      category: product.category,
      category_info: product.categories,
      subcategory_id: product.subcategory_id,
      group_id: product.group_id,
      uom: product.uom,
      brand_name: product.brand_name,
      shipping_amount: product.shipping_amount || 0,
      weight:
        product.uom || `${product.uom_value || 1} ${product.uom_unit || "kg"}`,
      brand: product.brand_name || "BigandBest",
      created_at: product.created_at,
    }));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
      subcategoryId: subcategoryId,
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

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        categories!products_category_id_fkey(
          id,
          name,
          description,
          image_url
        )
      `
      )
      .eq("active", true)
      .eq("group_id", groupId);

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    const transformedProducts = data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      oldPrice: product.old_price,
      rating: product.rating || 4.0,
      reviews: product.review_count || 0,
      discount: product.discount || 0,
      image: product.image,
      images: product.images,
      inStock: (product.stock || 0) > 0,
      stock: product.stock || 0,
      popular: product.popular,
      featured: product.featured,
      category: product.category,
      category_info: product.categories,
      subcategory_id: product.subcategory_id,
      group_id: product.group_id,
      uom: product.uom,
      brand_name: product.brand_name,
      shipping_amount: product.shipping_amount || 0,
      created_at: product.created_at,
    }));

    res.status(200).json({
      success: true,
      products: transformedProducts,
      total: transformedProducts.length,
      groupId: groupId,
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

    // Validate product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, delivery_type")
      .eq("id", product_id)
      .single();

    if (productError || !product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Process each warehouse assignment
    const results = [];
    for (const assignment of warehouse_assignments) {
      const {
        warehouse_id,
        stock_quantity,
        minimum_threshold = 0,
        maximum_capacity,
      } = assignment;

      try {
        // Check if assignment already exists
        const { data: existing } = await supabase
          .from("product_warehouse_stock")
          .select("id")
          .eq("product_id", product_id)
          .eq("warehouse_id", warehouse_id)
          .single();

        if (existing) {
          // Update existing assignment
          const { data, error } = await supabase
            .from("product_warehouse_stock")
            .update({
              stock_quantity,
              minimum_threshold,
              maximum_capacity,
              last_updated_by: req.user?.id,
            })
            .eq("id", existing.id)
            .select()
            .single();

          if (!error) {
            results.push({ warehouse_id, action: "updated", data });
          }
        } else {
          // Create new assignment
          const { data, error } = await supabase
            .from("product_warehouse_stock")
            .insert({
              product_id,
              warehouse_id,
              stock_quantity,
              minimum_threshold,
              maximum_capacity,
              last_updated_by: req.user?.id,
              last_restocked_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (!error) {
            results.push({ warehouse_id, action: "created", data });

            // Log stock movement
            await supabase.from("stock_movements").insert({
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
        }
      } catch (error) {
        console.error(`Error processing warehouse ${warehouse_id}:`, error);
        results.push({
          warehouse_id,
          action: "failed",
          error: error.message,
        });
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
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Check product delivery with warehouse logic
export const checkProductDeliveryWithWarehouse = async (req, res) => {
  try {
    const { product_id, pincode, quantity = 1 } = req.body;

    if (!product_id || !pincode) {
      return res.status(400).json({
        success: false,
        error: "Product ID and pincode are required",
      });
    }

    // Use delivery validation service
    const result = await deliveryValidationService.checkProductDelivery(
      product_id,
      pincode,
      quantity
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in checkProductDeliveryWithWarehouse:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Get product variants
export const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;

    const { data, error } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", productId)
      .order("is_default", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      variants: data || [],
      total: data?.length || 0,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
