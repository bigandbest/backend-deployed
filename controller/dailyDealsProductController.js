import dailyDealsProductDao from "../dao/daily-deals-product.dao.js";
import dailyDealsDao from "../dao/daily-deals.dao.js";
import productDao from "../dao/product.dao.js";
import cartAvailabilityDAO from "../dao/cart-availability.dao.js";

// Map a single product to a Daily Deal
export const mapProductToDailyDeal = async (req, res) => {
  try {
    const { product_id, daily_deal_id } = req.body;

    if (!product_id || !daily_deal_id) {
      return res
        .status(400)
        .json({ error: "product_id and daily_deal_id are required." });
    }

    await dailyDealsProductDao.mapProduct(daily_deal_id, product_id);

    res
      .status(201)
      .json({ message: "Product mapped to Daily Deal successfully." });
  } catch (err) {
    console.error("Map product error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// Remove a product from a Daily Deal
export const removeProductFromDailyDeal = async (req, res) => {
  try {
    const { product_id, daily_deal_id } = req.body;

    await dailyDealsProductDao.removeProduct(daily_deal_id, product_id);

    res.status(200).json({ message: "Mapping removed successfully." });
  } catch (err) {
    console.error("Remove mapping error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// Get all Daily Deals for a product
export const getDailyDealsForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const data = await dailyDealsProductDao.getDealsByProductId(product_id);

    res.status(200).json(data);
  } catch (err) {
    console.error("Get deals for product error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// Get all products in a Daily Deal
export const getProductsForDailyDeal = async (req, res) => {
  try {
    const { daily_deal_id } = req.params;

    // Fetch the daily deal info
    const dealData = await dailyDealsDao.getById(daily_deal_id);

    if (!dealData) {
      return res.status(404).json({
        success: false,
        error: "Daily deal not found"
      });
    }

    // Fetch products for this deal
    const data = await dailyDealsProductDao.getProductsByDealId(daily_deal_id);

    // Extract actual product objects
    const productsList = data.map((item) => item.product).filter(Boolean);

    // Enrich with inventory
    const enrichedProducts = await productDao.enrichProductsWithInventory(
      productsList
    );

    // Transform/Format for frontend (UnifiedProductCard expectations)
    let formattedProducts = enrichedProducts.map((p) => {
      const defaultVariant =
        p.variants?.find((v) => v.is_default) || p.variants?.[0] || {};

      return {
        ...p, // Include all original fields (id, name, etc)

        // Helpful top-level props for default view
        price: defaultVariant.price || 0,
        oldPrice: defaultVariant.old_price || 0,
        stock: defaultVariant.stock_info?.available_stock || 0,
        inStock: defaultVariant.stock_info?.in_stock || false,

        // Ensure full variants array is passed with stock_info
        variants: p.variants,

        // Map media/brand/category if needed
        image: p.media?.[0]?.url || p.image,
        brand: p.brands?.[0]?.brand?.name || p.brand,
        category: p.category?.name || p.category_id,
      };
    });

    // Enrich with availability
    const pincode = req.headers['x-user-pincode'];
    if (pincode && /^\d{6}$/.test(pincode) && formattedProducts.length > 0) {
      try {
        const items = formattedProducts.filter(p => p.id).map(p => ({
          product_id: p.id,
          variant_id: p.variants?.[0]?.id || null,
          quantity: 1,
        }));
        if (items.length > 0) {
          const availability = await cartAvailabilityDAO.checkBulkAvailability(items, pincode);
          formattedProducts = formattedProducts.map(p => ({
            ...p,
            availability: availability[p.id] ?? { available: true },
          }));
        }
      } catch (err2) {
        console.warn('[Availability] Daily deals enrichment failed:', err2.message);
      }
    }

    res.status(200).json({
      success: true,
      dailyDeal: {
        id: dealData.id,
        title: dealData.title,
        discount: dealData.discount,
        image_url: dealData.image_url,
        banner: dealData.banner ?? null,
      },
      products: formattedProducts,
      total: formattedProducts.length,
    });
  } catch (err) {
    console.error("Get products for deal error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Server error"
    });
  }
};

// Bulk map products by names and Daily Deal name
export const bulkMapProductsToDailyDeal = async (req, res) => {
  try {
    const { daily_deal_title, product_names } = req.body;

    if (!daily_deal_title || !product_names || !Array.isArray(product_names)) {
      return res
        .status(400)
        .json({ error: "daily_deal_title and product_names[] are required." });
    }

    // 1. Get Daily Deal ID from title
    // Since DailyDealsDAO doesn't have getByTitle, we list and filter or use direct prisma for now
    // Better to use list with filters if supported, or direct prisma
    const deals = await dailyDealsDao.list();
    const dailyDealData = deals.find(d => d.title === daily_deal_title);

    if (!dailyDealData) {
      return res.status(404).json({ error: "Daily Deal not found." });
    }

    // 2. Get product IDs from names
    // We can use a search or list method from ProductDAO
    const { items: products } = await productDao.listProducts({
      name: { in: product_names }
    }, { limit: 1000 });

    if (!products || !products.length) {
      return res.status(404).json({ error: "No matching products found." });
    }

    // 3. Map each product to Daily Deal
    await dailyDealsProductDao.bulkMap(dailyDealData.id, products.map(p => p.id));

    res.status(201).json({
      message: `Mapped ${products.length} products to Daily Deal "${daily_deal_title}".`,
      mapped_products: products.map((p) => p.name),
    });
  } catch (err) {
    console.error("Bulk map error:", err.message);
    res.status(500).json({ success: false, error: err.message || "Server error" });
  }
};
