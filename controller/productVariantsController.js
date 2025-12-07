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

// Update variant stock
export const updateVariantStock = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { variant_stock, active } = req.body;

    if (!variantId) {
      return res.status(400).json({ error: "Variant ID is required" });
    }

    if (variant_stock === undefined && active === undefined) {
      return res.status(400).json({ error: "variant_stock or active status is required" });
    }

    // Check if variant exists
    const { data: existingVariant, error: checkError } = await supabase
      .from("product_variants")
      .select("id, variant_name, variant_stock, active")
      .eq("id", variantId)
      .single();

    if (checkError || !existingVariant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Prepare update data
    const updateData = {};
    
    if (variant_stock !== undefined) {
      const stock = parseInt(variant_stock);
      if (isNaN(stock) || stock < 0) {
        return res.status(400).json({ error: "Invalid stock quantity. Must be a non-negative number." });
      }
      updateData.variant_stock = stock;
    }

    // Update active status (for in-stock/out-of-stock)
    if (active !== undefined) {
      updateData.active = Boolean(active);
    }

    // Auto-set active based on stock if not explicitly set
    if (variant_stock !== undefined && active === undefined) {
      updateData.active = variant_stock > 0;
    }

    updateData.updated_at = new Date().toISOString();

    // Update variant
    const { data, error } = await supabase
      .from("product_variants")
      .update(updateData)
      .eq("id", variantId)
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      variant: data[0],
      message: "Variant stock updated successfully"
    });
  } catch (error) {
    console.error('Server error in updateVariantStock:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get variant warehouse stock across all warehouses
export const getVariantWarehouseStock = async (req, res) => {
  try {
    const { variantId } = req.params;

    if (!variantId) {
      return res.status(400).json({ 
        success: false,
        error: "Variant ID is required" 
      });
    }

    // Check if variant exists
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .select("id, product_id, variant_name, variant_price, variant_weight")
      .eq("id", variantId)
      .single();

    if (variantError || !variant) {
      return res.status(404).json({ 
        success: false,
        error: "Variant not found" 
      });
    }

    // Get warehouse stock for this variant
    const { data: warehouseStock, error: stockError } = await supabase
      .from("product_warehouse_stock")
      .select(`
        warehouse_id,
        stock_quantity,
        reserved_quantity,
        minimum_threshold,
        cost_per_unit,
        last_restocked_at,
        warehouses (
          id,
          name,
          type,
          parent_warehouse_id,
          location
        )
      `)
      .eq("variant_id", variantId)
      .eq("is_active", true);

    if (stockError) {
      console.error("Error fetching warehouse stock:", stockError);
      return res.status(500).json({ 
        success: false,
        error: "Failed to fetch warehouse stock" 
      });
    }

    // Transform the data
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
      variant: variant,
      warehouse_stock: stockData,
      total_warehouses: stockData.length
    });
  } catch (error) {
    console.error('Server error in getVariantWarehouseStock:', error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

// Update variant stock in a specific warehouse
export const updateVariantWarehouseStock = async (req, res) => {
  try {
    const { variantId, warehouseId } = req.params;
    const { stock_quantity, minimum_threshold, cost_per_unit } = req.body;

    if (!variantId || !warehouseId) {
      return res.status(400).json({ 
        success: false,
        error: "Variant ID and Warehouse ID are required" 
      });
    }

    // Validate stock_quantity
    if (stock_quantity !== undefined) {
      const stock = parseInt(stock_quantity);
      if (isNaN(stock) || stock < 0) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid stock quantity. Must be a non-negative number." 
        });
      }
    }

    // Check if variant exists
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .eq("id", variantId)
      .single();

    if (variantError || !variant) {
      return res.status(404).json({ 
        success: false,
        error: "Variant not found" 
      });
    }

    // Check if warehouse exists
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id, name, type")
      .eq("id", warehouseId)
      .single();

    if (warehouseError || !warehouse) {
      return res.status(404).json({ 
        success: false,
        error: "Warehouse not found" 
      });
    }

    // Check if stock record exists
    const { data: existingStock, error: checkError } = await supabase
      .from("product_warehouse_stock")
      .select("*")
      .eq("product_id", variant.product_id)
      .eq("warehouse_id", warehouseId)
      .eq("variant_id", variantId)
      .single();

    let result;
    if (checkError && checkError.code === "PGRST116") {
      // Record doesn't exist, create it
      const { data, error } = await supabase
        .from("product_warehouse_stock")
        .insert({
          product_id: variant.product_id,
          warehouse_id: parseInt(warehouseId),
          variant_id: variantId,
          stock_quantity: stock_quantity !== undefined ? parseInt(stock_quantity) : 0,
          reserved_quantity: 0,
          minimum_threshold: minimum_threshold !== undefined ? parseInt(minimum_threshold) : 10,
          cost_per_unit: cost_per_unit !== undefined ? parseFloat(cost_per_unit) : 0,
          last_restocked_at: new Date().toISOString(),
          is_active: true
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating warehouse stock:", error);
        return res.status(500).json({ 
          success: false,
          error: "Failed to create warehouse stock record" 
        });
      }
      result = data;
    } else if (existingStock) {
      // Record exists, update it
      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (stock_quantity !== undefined) {
        updateData.stock_quantity = parseInt(stock_quantity);
        updateData.last_restocked_at = new Date().toISOString();
      }
      if (minimum_threshold !== undefined) {
        updateData.minimum_threshold = parseInt(minimum_threshold);
      }
      if (cost_per_unit !== undefined) {
        updateData.cost_per_unit = parseFloat(cost_per_unit);
      }

      const { data, error } = await supabase
        .from("product_warehouse_stock")
        .update(updateData)
        .eq("product_id", variant.product_id)
        .eq("warehouse_id", warehouseId)
        .eq("variant_id", variantId)
        .select()
        .single();

      if (error) {
        console.error("Error updating warehouse stock:", error);
        return res.status(500).json({ 
          success: false,
          error: "Failed to update warehouse stock" 
        });
      }
      result = data;
    } else {
      return res.status(500).json({ 
        success: false,
        error: "Unexpected error checking stock record" 
      });
    }

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
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};

// Add variant with warehouse stock
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
      warehouse_stock // Array of {warehouse_id, stock_quantity, minimum_threshold}
    } = req.body;

    // Validation
    if (!variant_name || !variant_price || !variant_weight || !variant_unit) {
      return res.status(400).json({ 
        success: false,
        error: "Required fields: variant_name, variant_price, variant_weight, variant_unit" 
      });
    }

    if (isNaN(variant_price) || variant_price <= 0) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid variant price" 
      });
    }

    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return res.status(404).json({ 
        success: false,
        error: "Product not found" 
      });
    }

    // Insert variant
    const { data: variantData, error: variantError } = await supabase
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
      .select()
      .single();

    if (variantError) {
      console.error("Error creating variant:", variantError);
      return res.status(500).json({ 
        success: false,
        error: variantError.message 
      });
    }

    // If warehouse_stock is provided, create warehouse stock records
    let warehouseStockResults = [];
    if (warehouse_stock && Array.isArray(warehouse_stock) && warehouse_stock.length > 0) {
      const stockRecords = warehouse_stock.map(ws => ({
        product_id: productId,
        warehouse_id: parseInt(ws.warehouse_id),
        variant_id: variantData.id,
        stock_quantity: parseInt(ws.stock_quantity) || 0,
        reserved_quantity: 0,
        minimum_threshold: parseInt(ws.minimum_threshold) || 10,
        cost_per_unit: parseFloat(ws.cost_per_unit) || 0,
        last_restocked_at: new Date().toISOString(),
        is_active: true
      }));

      const { data: stockData, error: stockError } = await supabase
        .from("product_warehouse_stock")
        .insert(stockRecords)
        .select();

      if (stockError) {
        console.error("Error creating warehouse stock:", stockError);
        // Don't fail the whole operation, just log the error
        warehouseStockResults = [];
      } else {
        warehouseStockResults = stockData || [];
      }
    }

    res.status(201).json({
      success: true,
      variant: variantData,
      warehouse_stock: warehouseStockResults,
      message: "Variant added successfully with warehouse stock"
    });
  } catch (error) {
    console.error('Server error in addProductVariantWithStock:', error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
};
