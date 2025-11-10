import { supabase } from "../config/supabaseClient.js";

// Get all variants for a product
export const getProductVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const { data, error } = await supabase
      .from("product_variants")
      .select(`
        id,
        product_id,
        variant_name,
        variant_price,
        variant_old_price,
        variant_discount,
        variant_stock,
        variant_weight,
        variant_unit,
        shipping_amount,
        variant_image_url,
        is_default,
        active,
        created_at
      `)
      .eq("product_id", productId)
      .eq("active", true)
      .order("variant_price", { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }



    res.status(200).json({
      success: true,
      variants: data || [],
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add variant to product
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

    // Validation
    if (!variant_name || !variant_price || !variant_weight || !variant_unit) {
      return res.status(400).json({ 
        error: "Required fields: variant_name, variant_price, variant_weight, variant_unit" 
      });
    }

    if (isNaN(variant_price) || variant_price <= 0) {
      return res.status(400).json({ error: "Invalid variant price" });
    }

    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Insert variant
    const { data, error } = await supabase
      .from("product_variants")
      .insert({
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
      })
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({
      success: true,
      variant: data[0],
      message: "Variant added successfully"
    });
  } catch (error) {
    console.error('Server error in addProductVariant:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product variant
export const updateProductVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const updateData = req.body;

    if (!variantId) {
      return res.status(400).json({ error: "Variant ID is required" });
    }

    // Check if variant exists
    const { data: existingVariant, error: checkError } = await supabase
      .from("product_variants")
      .select("id")
      .eq("id", variantId)
      .single();

    if (checkError || !existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Sanitize and validate data
    const sanitizedData = { ...updateData };
    delete sanitizedData.id;
    delete sanitizedData.product_id;
    delete sanitizedData.created_at;
    
    // Validate and convert data types
    if (sanitizedData.variant_price !== undefined) {
      const price = parseFloat(sanitizedData.variant_price);
      if (isNaN(price) || price <= 0) {
        return res.status(400).json({ error: "Invalid variant price" });
      }
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

    if (sanitizedData.variant_name) {
      sanitizedData.variant_name = sanitizedData.variant_name.trim();
    }

    if (sanitizedData.variant_image_url) {
      sanitizedData.variant_image_url = sanitizedData.variant_image_url.trim();
    }

    // Update variant
    const { data, error } = await supabase
      .from("product_variants")
      .update(sanitizedData)
      .eq("id", variantId)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      variant: data[0],
      message: "Variant updated successfully"
    });
  } catch (error) {
    console.error('Server error in updateProductVariant:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete product variant
export const deleteProductVariant = async (req, res) => {
  try {
    const { variantId } = req.params;

    if (!variantId) {
      return res.status(400).json({ error: "Variant ID is required" });
    }

    // Check if variant exists
    const { data: existingVariant, error: checkError } = await supabase
      .from("product_variants")
      .select("id")
      .eq("id", variantId)
      .single();

    if (checkError || !existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Soft delete by setting active to false
    const { error } = await supabase
      .from("product_variants")
      .update({ active: false })
      .eq("id", variantId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      message: "Variant deleted successfully"
    });
  } catch (error) {
    console.error('Server error in deleteProductVariant:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get products with their variants
export const getProductsWithVariants = async (req, res) => {
  try {
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(
        `
        *,
        product_variants (
          id,
          variant_name,
          variant_price,
          variant_old_price,
          variant_discount,
          variant_stock,
          variant_weight,
          variant_unit,
          shipping_amount,
          is_default,
          active
        )
      `)
      .eq("active", true);

    if (productsError) {
      return res.status(500).json({ error: productsError.message });
    }

    res.status(200).json({
      success: true,
      products: products,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
