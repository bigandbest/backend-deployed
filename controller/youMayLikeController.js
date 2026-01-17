import YouMayLikeDAO from "../dao/you-may-like.dao.js";
import ProductDAO from "../dao/product.dao.js";

/**
 * You May Like Controller - Routes for "You May Like" product recommendations
 * Updated to use you-may-like.dao.js
 */

// 1️⃣ Map a single product to the 'you_may_like' table
export const mapProductToYouMayLike = async (req, res) => {
  try {
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "product_id is required." });
    }

    // Check if already mapped
    const exists = await YouMayLikeDAO.check(product_id);
    if (exists) {
      return res
        .status(409)
        .json({ error: 'Product is already in "You May Like".' });
    }

    await YouMayLikeDAO.add(product_id);

    res
      .status(201)
      .json({ message: 'Product added to "You May Like" successfully.' });
  } catch (err) {
    console.error("Error in mapProductToYouMayLike:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 2️⃣ Remove a product from the 'you_may_like' table
export const removeProductFromYouMayLike = async (req, res) => {
  try {
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ error: "product_id is required." });
    }

    await YouMayLikeDAO.remove(product_id);

    res
      .status(200)
      .json({ message: 'Product removed from "You May Like" successfully.' });
  } catch (err) {
    console.error("Error in removeProductFromYouMayLike:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 3️⃣ Get all products from the 'you_may_like' table
export const getYouMayLikeProducts = async (req, res) => {
  try {
    const products = await YouMayLikeDAO.getAll();

    res.status(200).json(products);
  } catch (err) {
    console.error("Error in getYouMayLikeProducts:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 4️⃣ Get a single product by ID from the 'you_may_like' table
export const getYouMayLikeProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await YouMayLikeDAO.getById(id);

    if (!product) {
      return res
        .status(404)
        .json({ error: 'Product not found in "You May Like"' });
    }

    res.status(200).json(product);
  } catch (err) {
    console.error("Error in getYouMayLikeProductById:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// 5️⃣ Bulk add products to 'you_may_like' by product name
export const bulkAddByNames = async (req, res) => {
  try {
    const { product_names } = req.body;

    if (!product_names || !Array.isArray(product_names)) {
      return res.status(400).json({ error: "product_names[] are required." });
    }

    // Get product IDs from names using ProductDAO
    const products = await ProductDAO.findByNames(product_names);

    if (!products || products.length === 0) {
      return res.status(404).json({ error: "No matching products found." });
    }

    // Map each product to 'you_may_like'
    const productIds = products.map((p) => p.id);
    const result = await YouMayLikeDAO.bulkAdd(productIds);

    res.status(201).json({
      message: `Mapped ${products.length} products to "You May Like".`,
      mapped_products: products.map((p) => p.name),
      count: result.count,
    });
  } catch (err) {
    console.error("Bulk map error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};
