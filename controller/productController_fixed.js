import { supabase } from "../config/supabaseClient.js";

export const getAllProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true);

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

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

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