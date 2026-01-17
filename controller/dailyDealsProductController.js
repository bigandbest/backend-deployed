import dailyDealsProductDao from "../dao/daily-deals-product.dao.js";
import dailyDealsDao from "../dao/daily-deals.dao.js";
import productDao from "../dao/product.dao.js";

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

    // Transform the data to match expected format
    const products = data.map(item => {
      const p = item.product;
      const defaultVariant = p.variants?.find(v => v.is_default) || p.variants?.[0] || {};

      return {
        id: p.id,
        name: p.name,
        price: defaultVariant.price || 0,
        oldPrice: defaultVariant.old_price || 0,
        rating: p.rating ? parseFloat(p.rating) : 4.0,
        discount: defaultVariant.discount_percentage || 0,
        image: p.image,
        category: p.category_id,
        uom: p.uom, // Ensure UOM is available or handled
        stock: defaultVariant.inventory?.stock_qty || 0,
        inStock: (defaultVariant.inventory?.stock_qty || 0) > 0,
        brand: "BigandBest", // Fallback as brand relation might be complex
        description: p.description,
      };
    });

    res.status(200).json({
      success: true,
      dailyDeal: {
        id: dealData.id,
        title: dealData.title,
        discount: dealData.discount,
        image_url: dealData.image_url,
      },
      products: products,
      total: products.length,
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
