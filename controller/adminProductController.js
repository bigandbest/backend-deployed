import ProductDAO from "../dao/product.dao.js";

// Get all products for admin with full details and joins
export const getAllProductsForAdmin = async (req, res) => {
  try {
    // Use Prisma through ProductDAO instead of Supabase
    const products = await ProductDAO.listProducts(
      {},
      { limit: 1000, page: 1 },
    );

    res.status(200).json({
      success: true,
      products: products.items || [],
      total: products.total || 0,
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};

// Update product warehouse mapping
export const updateProductWarehouseMapping = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      warehouse_mapping_type,
      primary_warehouses,
      fallback_warehouses,
      enable_fallback,
      warehouse_notes,
      assigned_warehouse_ids,
      stock,
      stock_quantity,
      faq,
      weight_unit,
      weight_display,
      weight_value,
      portion,
      quantity,
      image,
      images,
      // Remove fields that don't exist in database schema
      initial_stock,
      auto_distribute_to_zones,
      zone_distribution_quantity,
      ...otherFields
    } = req.body;

    console.log("Updating warehouse mapping for product:", productId, req.body);

    // Validate required fields
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    if (!warehouse_mapping_type) {
      return res.status(400).json({
        success: false,
        error: "Warehouse mapping type is required",
      });
    }

    // Validate mapping type
    const validTypes = [
      "nationwide",
      "zonal_with_fallback",
      "zonal_only",
      "division_only",
      "custom",
    ];
    if (!validTypes.includes(warehouse_mapping_type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid warehouse mapping type",
      });
    }

    // Prepare update data with all relevant fields
    const updateData = {
      warehouse_mapping_type,
      primary_warehouses: primary_warehouses || [],
      fallback_warehouses: enable_fallback ? fallback_warehouses || [] : [],
      enable_fallback: enable_fallback || false,
      warehouse_notes: warehouse_notes || null,
      assigned_warehouse_ids: assigned_warehouse_ids || [],
    };

    // Add stock-related fields if provided (only include fields that exist in database)
    if (typeof stock !== "undefined" && stock !== null) {
      updateData.stock = Number(stock);
    }
    if (typeof stock_quantity !== "undefined" && stock_quantity !== null) {
      updateData.stock_quantity = Number(stock_quantity);
    }
    if (faq && Array.isArray(faq)) {
      updateData.faq = faq;
    }
    // Add weight and quantity fields that exist in schema
    if (weight_unit) {
      updateData.weight_unit = weight_unit;
    }
    if (weight_display) {
      updateData.weight_display = weight_display;
    }
    if (weight_value) {
      updateData.weight_value = weight_value;
    }
    if (portion) {
      updateData.portion = portion;
    }
    if (quantity) {
      updateData.quantity = quantity;
    }
    // Add image fields that exist in schema
    if (image) {
      updateData.image = image;
    }
    if (images && Array.isArray(images)) {
      updateData.images = images;
    }

    console.log("Update data being sent to Prisma:", updateData);

    // Update the product using Prisma
    const product = await ProductDAO.updateProduct(productId, updateData);

    console.log("Product updated successfully:", product);
    res.status(200).json({
      success: true,
      message: "Warehouse mapping updated successfully",
      product,
    });
  } catch (err) {
    console.error("Error updating warehouse mapping:", err);
    res.status(500).json({
      success: false,
      error: err.message || "An unexpected error occurred. Please try again.",
    });
  }
};

// Get single product for admin with warehouse details
export const getProductForAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    // Fetch product with details using Prisma
    const product = await ProductDAO.getProductById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (err) {
    console.error("Error fetching product:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};

// Delete product for admin
export const deleteProductForAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    console.log("Deleting product:", productId);

    // First check if product exists
    const existingProduct = await ProductDAO.getProductById(productId);

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Delete the product
    await ProductDAO.deleteProduct(productId);

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      deletedProduct: existingProduct,
    });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
};

// Update product (general update for all fields)
export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updateData = req.body;

    console.log("Updating product:", productId, updateData);

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Product ID is required",
      });
    }

    // Remove fields that shouldn't be updated directly or don't exist in database
    const {
      id,
      created_at,
      product_variants,
      groups,
      subcategories,
      variants,
      category,
      subcategory,
      group,
      brands,
      reviews,
      // Fields that don't exist in products table schema
      auto_distribute_to_zones,
      initial_stock,
      zone_distribution_quantity,
      ...fieldsToUpdate
    } = updateData;

    // Convert empty strings to null for UUID fields
    if (fieldsToUpdate.category_id === "") fieldsToUpdate.category_id = null;
    if (fieldsToUpdate.subcategory_id === "")
      fieldsToUpdate.subcategory_id = null;
    if (fieldsToUpdate.group_id === "") fieldsToUpdate.group_id = null;
    if (fieldsToUpdate.store_id === "") fieldsToUpdate.store_id = null;

    console.log("Fields to update:", fieldsToUpdate);

    // Check if product exists
    const existingProduct = await ProductDAO.getProductById(productId);

    if (!existingProduct) {
      console.error("Product not found");
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Update the product
    const product = await ProductDAO.updateProduct(productId, fieldsToUpdate);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found after update",
      });
    }

    console.log("Product updated successfully:", product);
    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({
      success: false,
      error: err.message || "An unexpected error occurred. Please try again.",
    });
  }
};
