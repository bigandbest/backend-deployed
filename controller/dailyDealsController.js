import { uploadToCloudinary } from "../services/uploadService.js";
import dailyDealsDao from "../dao/daily-deals.dao.js";
import dailyDealsProductDao from "../dao/daily-deals-product.dao.js";
import addBannerDao from "../dao/add-banner.dao.js";
import productDao from "../dao/product.dao.js";

// --- Daily Deal Controllers ---

// Add a Daily Deal
export async function addDailyDeal(req, res) {
  try {
    const { title, discount, badge, sort_order, banner_id } = req.body;
    const imageFile = req.file;
    let imageUrl = null;

    if (imageFile) {
      console.log(
        "Uploading daily deal image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "daily-deals",
        imageFile.mimetype,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }
      imageUrl = uploadResult.secure_url;
    }

    if (banner_id) {
      const bannerData = await addBannerDao.getById(banner_id);
      if (!bannerData || bannerData.banner_type !== "daily_deals") {
        return res
          .status(400)
          .json({
            success: false,
            error:
              'Invalid banner_id. Banner must exist and have type "daily_deals".',
          });
      }
    }

    const data = await dailyDealsDao.create({
      title,
      image_url: imageUrl,
      discount,
      badge,
      sort_order: sort_order ? parseInt(sort_order) : 0,
      banner_id: banner_id || null,
    });

    res.status(201).json({ success: true, deal: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Update a Daily Deal
export async function updateDailyDeal(req, res) {
  try {
    const { id } = req.params;
    const { title, discount, badge, sort_order, active, banner_id } = req.body;
    const imageFile = req.file;

    let updateData = {};
    if (title !== undefined) updateData.title = title;
    if (discount !== undefined) updateData.discount = discount;
    if (badge !== undefined) updateData.badge = badge;
    if (sort_order !== undefined) updateData.sort_order = parseInt(sort_order);
    if (active !== undefined)
      updateData.active = active === "true" || active === true;

    if (imageFile) {
      // Get existing deal to delete old image
      const existingDeal = await dailyDealsDao.getById(id);
      console.log(
        "Uploading daily deal update image to Cloudinary:",
        imageFile.originalname,
      );
      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "daily-deals",
        imageFile.mimetype,
        existingDeal?.image_url ?? null,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }
      updateData.image_url = uploadResult.secure_url;
    }

    if (banner_id !== undefined) {
      if (banner_id === null || banner_id === "" || banner_id === "null") {
        updateData.banner_id = null;
      } else {
        const bannerData = await addBannerDao.getById(banner_id);
        if (!bannerData || bannerData.banner_type !== "daily_deals") {
          return res
            .status(400)
            .json({
              success: false,
              error:
                'Invalid banner_id. Banner must exist and have type "daily_deals".',
            });
        }
        updateData.banner_id = banner_id;
      }
    }

    const data = await dailyDealsDao.update(id, updateData);
    res.json({ success: true, deal: data });
  } catch (err) {
    if (err.code === "P2025")
      return res.status(404).json({ success: false, error: "Deal not found" });
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete a Daily Deal
export async function deleteDailyDeal(req, res) {
  try {
    const { id } = req.params;
    await dailyDealsDao.delete(id);
    res.json({ success: true, message: "Daily deal deleted successfully" });
  } catch (err) {
    if (err.code === "P2025")
      return res.status(404).json({ success: false, error: "Deal not found" });
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Daily Deals
export async function getAllDailyDeals(req, res) {
  try {
    const data = await dailyDealsDao.list();
    res.json({ success: true, deals: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Daily Deals WITH Products (Optimized)
export async function getAllDailyDealsWithProducts(req, res) {
  try {
    const deals = await dailyDealsDao.list({ active: true });
    if (!deals || deals.length === 0)
      return res.json({ success: true, deals: [] });

    const dealsWithProducts = await Promise.all(
      deals.map(async (deal) => {
        const mappings = await dailyDealsProductDao.getProductsByDealId(
          deal.id,
        );
        const products = mappings.map((m) => {
          const product = m.product;
          return {
            ...product,
            inStock:
              product.variants?.some((v) => v.inventory?.stock_qty > 0) ||
              false,
          };
        });
        return { ...deal, products };
      }),
    );

    res.json({ success: true, deals: dealsWithProducts });
  } catch (err) {
    console.error("Error in getAllDailyDealsWithProducts:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// View a Single Daily Deal
export async function getDailyDealById(req, res) {
  try {
    const { id } = req.params;
    const data = await dailyDealsDao.getById(id);
    if (!data)
      return res
        .status(404)
        .json({ success: false, error: "Daily deal not found" });
    res.json({ success: true, deal: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// --- Daily Deal Product Mapping Controllers ---

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
    const dealData = await dailyDealsDao.getById(daily_deal_id);
    if (!dealData)
      return res
        .status(404)
        .json({ success: false, error: "Daily deal not found" });

    const data = await dailyDealsProductDao.getProductsByDealId(daily_deal_id);
    const products = data.map((item) => {
      const p = item.product;
      const defaultVariant =
        p.variants?.find((v) => v.is_default) || p.variants?.[0] || {};
      return {
        id: p.id,
        name: p.name,
        price: defaultVariant.price || 0,
        oldPrice: defaultVariant.old_price || 0,
        rating: p.rating ? parseFloat(p.rating) : 4.0,
        discount: defaultVariant.discount_percentage || 0,
        image: p.image,
        category: p.category_id,
        uom: p.uom,
        stock: defaultVariant.inventory?.stock_qty || 0,
        inStock: (defaultVariant.inventory?.stock_qty || 0) > 0,
        brand: "BigandBest",
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
      products,
      total: products.length,
    });
  } catch (err) {
    console.error("Get products for deal error:", err);
    res
      .status(500)
      .json({ success: false, error: err.message || "Server error" });
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
    const deals = await dailyDealsDao.list();
    const dailyDealData = deals.find((d) => d.title === daily_deal_title);
    if (!dailyDealData)
      return res.status(404).json({ error: "Daily Deal not found." });

    const { items: products } = await productDao.listProducts(
      { name: { in: product_names } },
      { limit: 1000 },
    );
    if (!products || !products.length)
      return res.status(404).json({ error: "No matching products found." });

    await dailyDealsProductDao.bulkMap(
      dailyDealData.id,
      products.map((p) => p.id),
    );
    res.status(201).json({
      message: `Mapped ${products.length} products to Daily Deal "${daily_deal_title}".`,
      mapped_products: products.map((p) => p.name),
    });
  } catch (err) {
    console.error("Bulk map error:", err.message);
    res
      .status(500)
      .json({ success: false, error: err.message || "Server error" });
  }
};
