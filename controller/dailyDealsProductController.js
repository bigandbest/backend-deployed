import { supabase } from "../config/supabaseClient.js";

// Map a single product to a Daily Deal
export const mapProductToDailyDeal = async (req, res) => {
  try {
    const { product_id, daily_deal_id } = req.body;

    if (!product_id || !daily_deal_id) {
      return res
        .status(400)
        .json({ error: "product_id and daily_deal_id are required." });
    }

    // Insert mapping (ignore if duplicate)
    const { error } = await supabase
      .from("daily_deals_product")
      .insert([{ product_id, daily_deal_id }]);

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Mapping already exists." });
      }
      return res.status(500).json({ error: error.message });
    }

    res
      .status(201)
      .json({ message: "Product mapped to Daily Deal successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Remove a product from a Daily Deal
export const removeProductFromDailyDeal = async (req, res) => {
  try {
    const { product_id, daily_deal_id } = req.body;

    const { error } = await supabase
      .from("daily_deals_product")
      .delete()
      .eq("product_id", product_id)
      .eq("daily_deal_id", daily_deal_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json({ message: "Mapping removed successfully." });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Get all Daily Deals for a product
export const getDailyDealsForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;

    const { data, error } = await supabase
      .from("daily_deals_product")
      .select("daily_deal_id, daily_deals (id, title, discount, badge, active)")
      .eq("product_id", product_id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// Get all products in a Daily Deal
export const getProductsForDailyDeal = async (req, res) => {
  try {
    const { daily_deal_id } = req.params;

    // Fetch the daily deal info
    const { data: dealData, error: dealError } = await supabase
      .from("daily_deals")
      .select("id, title, discount, image_url")
      .eq("id", daily_deal_id)
      .single();

    if (dealError) {
      return res.status(404).json({
        success: false,
        error: "Daily deal not found"
      });
    }

    // Fetch products for this deal
    const { data, error } = await supabase
      .from("daily_deals_product")
      .select(
        "product_id, products (id, name, price, rating, image, category, uom, discount, old_price, stock, brand_name, description)"
      )
      .eq("daily_deal_id", daily_deal_id);

    if (error) return res.status(500).json({
      success: false,
      error: error.message
    });

    // Transform the data to match expected format
    const products = data.map(item => ({
      id: item.products.id,
      name: item.products.name,
      price: item.products.price,
      oldPrice: item.products.old_price,
      rating: item.products.rating || 4.0,
      discount: item.products.discount || 0,
      image: item.products.image,
      category: item.products.category,
      uom: item.products.uom,
      stock: item.products.stock || 0,
      inStock: (item.products.stock || 0) > 0,
      brand: item.products.brand_name || "BigandBest",
      description: item.products.description,
    }));

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
    res.status(500).json({
      success: false,
      error: "Server error"
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
    const { data: dailyDealData, error: dailyDealError } = await supabase
      .from("daily_deals")
      .select("id")
      .eq("title", daily_deal_title)
      .single();

    if (dailyDealError || !dailyDealData) {
      return res.status(404).json({ error: "Daily Deal not found." });
    }

    // 2. Get product IDs from names
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .in("name", product_names);

    if (productError || !products.length) {
      return res.status(404).json({ error: "No matching products found." });
    }

    // 3. Map each product to Daily Deal
    const inserts = products.map((p) => ({
      product_id: p.id,
      daily_deal_id: dailyDealData.id,
    }));

    const { error: insertError } = await supabase
      .from("daily_deals_product")
      .insert(inserts, { upsert: false });

    if (insertError && insertError.code !== "23505") {
      return res.status(500).json({ error: insertError.message });
    }

    res.status(201).json({
      message: `Mapped ${products.length} products to Daily Deal "${daily_deal_title}".`,
      mapped_products: products.map((p) => p.name),
    });
  } catch (err) {
    console.error("Bulk map error:", err.message);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
