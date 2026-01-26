import ProductDAO from "../dao/product.dao.js";
import prisma from "../config/prisma.js";

// Create new product
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      hsn_code,
      sac_code,
      gst_rate,
      vertical,
      category_id,
      subcategory_id,
      group_id,
      store_id,
      return_applicable,
      return_days,
      active,
      has_variants,
      product_variants,
      images,
      media, // Accept both 'images' and 'media' from frontend
      brand_name, // Typically brand_id from frontend
      ...otherFields
    } = req.body;

    console.log("Creating product:", name);

    // Basic validation
    if (!name || !priceInfoCheck(req.body)) {
      // Helper to check price if needed, but for now just name
    }

    // Construct Product Data
    const productData = {
      name,
      description,
      hsn_or_sac_code: hsn_code || sac_code,
      gst_rate: gst_rate ? parseFloat(gst_rate) : 0,
      cess_rate: req.body.cess_rate ? parseFloat(req.body.cess_rate) : 0,
      vertical: vertical || "qwik",
      return_applicable: !!return_applicable,
      return_days: return_days ? parseInt(return_days) : 0,
      active: active !== undefined ? active : true,
      has_variants: !!has_variants,
    };

    // Handle Relations using Prisma's connect syntax
    if (category_id) {
      productData.category = { connect: { id: category_id } };
    }
    if (subcategory_id) {
      productData.subcategory = { connect: { id: subcategory_id } };
    }
    if (group_id) {
      productData.group = { connect: { id: group_id } };
    }

    // If Brand ID passed as brand_name (frontend quirk mentioned in AddProduct.jsx)
    const brandId = brand_name;

    // Prepare Nested Writes
    // 1. Media - Accept both 'images' array of URLs and 'media' array of objects
    const mediaArray =
      media && Array.isArray(media)
        ? media
        : images && Array.isArray(images)
          ? images
          : [];

    if (mediaArray && mediaArray.length > 0) {
      productData.media = {
        create: mediaArray.map((item, index) => {
          // Handle both formats: object with {url, media_type, etc.} or string URL
          if (typeof item === "string") {
            return {
              media_type: "image",
              url: item,
              is_primary: index === 0,
              sort_order: index,
            };
          } else {
            return {
              media_type: item.media_type || "image",
              url: item.url,
              is_primary:
                item.is_primary !== undefined ? item.is_primary : index === 0,
              sort_order:
                item.sort_order !== undefined ? item.sort_order : index,
            };
          }
        }),
      };
    }

    // 2. Variants
    if (
      product_variants &&
      Array.isArray(product_variants) &&
      product_variants.length > 0
    ) {
      productData.variants = {
        create: product_variants.map((v) => {
          const variantData = {
            title: v.variant_name || v.title,
            sku:
              v.sku ||
              `${name.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            price: parseFloat(v.variant_price || 0),
            old_price: v.variant_old_price
              ? parseFloat(v.variant_old_price)
              : null,
            discount_percentage: v.discount_percentage
              ? parseInt(v.discount_percentage)
              : 0,
            is_default: !!v.is_default,
            active: true,
            shipping_amount: v.shipping_amount
              ? parseFloat(v.shipping_amount)
              : 0,

            // Bulk Pricing
            is_bulk_enabled:
              v.is_bulk_enabled !== undefined ? !!v.is_bulk_enabled : false,
            bulk_min_quantity: v.bulk_min_quantity
              ? parseInt(v.bulk_min_quantity)
              : 50,
            bulk_discount_percentage: v.bulk_discount_percentage
              ? parseInt(v.bulk_discount_percentage)
              : 0,
            bulk_price: v.bulk_price ? parseFloat(v.bulk_price) : 0,
          };

          // Handle Inventory (Nested Create)
          // Default stock quantity if provided in variant data, else 0
          // Inventory creation deferred to post-creation bulk insert for multi-warehouse support

          // Handle Attributes (if array provided)
          if (
            v.attributes &&
            Array.isArray(v.attributes) &&
            v.attributes.length > 0
          ) {
            variantData.attributes = {
              create: v.attributes.map((attr) => ({
                attribute_name: attr.attribute_name,
                attribute_value: attr.attribute_value,
              })),
            };
          }

          return variantData;
        }),
      };
    }

    // Create via DAO (Pass strict data)
    const newProduct = await ProductDAO.createProduct(productData);

    // Handle Brand Relation (Join Table)
    if (brandId && newProduct) {
      try {
        await ProductDAO.addBrandToProduct(newProduct.id, brandId);
      } catch (e) {
        console.error("Failed to link brand:", e);
      }
    }

    // Handle Recommended Store Linking (passed as store_id from frontend)
    if (store_id && newProduct) {
      try {
        await ProductDAO.addRecommendedStore(newProduct.id, store_id);
      } catch (storeError) {
        console.error("Error linking recommended store:", storeError.message);
      }
    }

    // --- AUTOMATIC INVENTORY CREATION ---
    // Automatically create inventory records for this product (and variants) in ONLY ACTIVE warehouses
    try {
      // 1. Fetch all active warehouses
      const warehouses = await prisma.warehouses.findMany({
        where: { is_active: true },
        select: { id: true },
      });

      if (warehouses.length > 0) {
        const inventoryRecords = [];

        // 3. Prepare inventory records for VARIANTS (if any)
        if (newProduct.variants && newProduct.variants.length > 0) {
          newProduct.variants.forEach((variant) => {
            warehouses.forEach((wh) => {
              inventoryRecords.push({
                variant_id: variant.id,
                warehouse_id: wh.id,
                stock_qty: 0,
                reserved_qty: 0,
                bulk_stock_threshold: variant.bulk_min_quantity || 0,
                // bulk_reserved_qty: 0 // Default
              });
            });
          });
        }

        // 4. Bulk Insert
        if (inventoryRecords.length > 0) {
          await prisma.inventory.createMany({
            data: inventoryRecords,
            skipDuplicates: true,
          });
          console.log(
            `Initialized ${inventoryRecords.length} inventory records for product ${newProduct.name}`,
          );
        }
      }
    } catch (invError) {
      console.error(
        "Failed to initialize inventory for new product:",
        invError,
      );
    }
    // ------------------------------------

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      productId: newProduct.id,
      product: newProduct,
    });
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({
      success: false,
      error: err.message || "An unexpected error occurred.",
    });
  }
};

function priceInfoCheck(body) {
  // simplified check
  return true;
}

// Get all products for admin with full details
export const getAllProductsForAdmin = async (req, res) => {
  try {
    // Use Prisma through ProductDAO instead of Supabase
    const products = await ProductDAO.listProducts(
      {},
      { limit: 1000, page: 1 },
    );

    // Flatten the response for frontend convenience (Brand & Store)
    const flattenedProducts = (products.items || []).map((p) => {
      const brandObj =
        p.brands && p.brands.length > 0 ? p.brands[0].brand : null;
      const storeObj =
        p.product_recommended_store && p.product_recommended_store.length > 0
          ? p.product_recommended_store[0].recommended_store
          : null;

      return {
        ...p,
        brand_id: brandObj ? brandObj.id : null,
        brand_name: brandObj ? brandObj.name : null,
        store_id: storeObj ? storeObj.id : null,
        store_name: storeObj ? storeObj.name : null,
      };
    });

    res.status(200).json({
      success: true,
      products: flattenedProducts,
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

    // Flatten the single product response for frontend convenience
    const brandObj =
      product.brands && product.brands.length > 0
        ? product.brands[0].brand
        : null;
    const storeObj =
      product.product_recommended_store &&
      product.product_recommended_store.length > 0
        ? product.product_recommended_store[0].recommended_store
        : null;

    const flattenedProduct = {
      ...product,
      brand_id: brandObj ? brandObj.id : null,
      brand_name: brandObj ? brandObj.name : null,
      store_id: storeObj ? storeObj.id : null,
      store_name: storeObj ? storeObj.name : null,
    };

    res.status(200).json({
      success: true,
      product: flattenedProduct,
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

    // STRICTLY filter fields that exist in the products schema
    const fieldsToUpdate = {};
    const validFields = [
      "name",
      "description",
      "vertical",
      "hsn_or_sac_code",
      "gst_rate",
      "cess_rate",
      "category_id",
      "subcategory_id",
      "group_id",
      "store_id",
      "rating",
      "review_count",
      "return_applicable",
      "return_days",
      "active",
      "has_variants",
      "faq",
    ];

    // Map valid fields
    validFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        fieldsToUpdate[field] = updateData[field];
      }
    });

    // Handle HSN Code - map to hsn_or_sac_code
    if (updateData.hsn_code !== undefined) {
      fieldsToUpdate.hsn_or_sac_code = updateData.hsn_code;
    } else if (updateData.sac_code !== undefined) {
      // Fallback or alternative if hsn is not provided
      fieldsToUpdate.hsn_or_sac_code = updateData.sac_code;
    }

    // Handle Relations via Connect/Disconnect (since scalar ID updates are failing)

    // Category
    if (updateData.category_id) {
      fieldsToUpdate.category = { connect: { id: updateData.category_id } };
      delete fieldsToUpdate.category_id;
    } else if (
      updateData.category_id === "" ||
      updateData.category_id === null
    ) {
      fieldsToUpdate.category = { disconnect: true };
      delete fieldsToUpdate.category_id;
    }

    // Subcategory
    if (updateData.subcategory_id) {
      fieldsToUpdate.subcategory = {
        connect: { id: updateData.subcategory_id },
      };
      delete fieldsToUpdate.subcategory_id;
    } else if (
      updateData.subcategory_id === "" ||
      updateData.subcategory_id === null
    ) {
      fieldsToUpdate.subcategory = { disconnect: true };
      delete fieldsToUpdate.subcategory_id;
    }

    // Group
    if (updateData.group_id) {
      fieldsToUpdate.group = { connect: { id: updateData.group_id } };
      delete fieldsToUpdate.group_id;
    } else if (updateData.group_id === "" || updateData.group_id === null) {
      fieldsToUpdate.group = { disconnect: true };
      delete fieldsToUpdate.group_id;
    }

    // Store - use connect/disconnect like other relations
    // NOTE: Frontend sends recommended_store IDs, but products.store_id references stores table
    // Skip store connection for now to avoid FK errors
    // Store - Handle Recommended Store Linking (matches createProduct and frontend logic)
    if (updateData.store_id) {
      try {
        // Remove existing recommended store relations first (assuming single store selection from UI)
        await prisma.product_recommended_store.deleteMany({
          where: { product_id: productId },
        });

        // Add new recommended store relation
        await ProductDAO.addRecommendedStore(productId, updateData.store_id);
        console.log(
          "Linked product to recommended store:",
          updateData.store_id,
        );
      } catch (storeError) {
        console.error("Error linking recommended store:", storeError.message);
      }
      // Ensure we don't try to update the 'store' relation on products table directly
      // as that points to 'stores' table, not 'recommended_store'
      delete fieldsToUpdate.store_id;
    } else if (updateData.store_id === "" || updateData.store_id === null) {
      // If expressly cleared, remove relations
      await prisma.product_recommended_store.deleteMany({
        where: { product_id: productId },
      });
      delete fieldsToUpdate.store_id;
    }

    console.log(
      "Filtered fields to update (schema compliant):",
      fieldsToUpdate,
    );

    // Check if product exists
    const existingProduct = await ProductDAO.getProductById(productId);

    if (!existingProduct) {
      console.error("Product not found");
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    // Update the product core fields
    const product = await ProductDAO.updateProduct(productId, fieldsToUpdate);

    // Handle Media Updates
    if (updateData.media && Array.isArray(updateData.media)) {
      try {
        await ProductDAO.updateProductMedia(productId, updateData.media);
        console.log("Product media updated");
      } catch (mediaError) {
        console.error("Error updating media:", mediaError);
      }
    } else if (updateData.images && Array.isArray(updateData.images)) {
      // Fallback if frontend sends 'images' array of strings
      try {
        const mediaItems = updateData.images.map((url) => ({
          media_type: "image",
          url: url,
        }));
        await ProductDAO.updateProductMedia(productId, mediaItems);
        console.log("Product images updated");
      } catch (imageError) {
        console.error("Error updating images:", imageError);
      }
    }

    // Handle Variants Updates
    // Prioritize 'product_variants' from frontend (formatted for create/update) over 'variants' (which might be stale)
    const variantsPayload = updateData.product_variants || updateData.variants;

    if (
      variantsPayload &&
      Array.isArray(variantsPayload) &&
      variantsPayload.length > 0
    ) {
      try {
        // Map payload to DB schema (similar to createProduct)
        const mappedVariants = variantsPayload.map((v) => {
          // If 'variant_name' exists, it's likely from frontend form mapping.
          // If 'title' exists, it might be raw DB object.
          // flexible mapping:
          const variantData = {
            id: v.id, // Important for UPDATE
            title: v.variant_name || v.title,
            sku:
              v.sku ||
              (v.id
                ? undefined
                : `${(fieldsToUpdate.name || "VAR").substring(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`), // Generate SKU only for new
            price: parseFloat(v.variant_price || v.price || 0),
            old_price:
              v.variant_old_price || v.old_price
                ? parseFloat(v.variant_old_price || v.old_price)
                : null,
            discount_percentage:
              v.discount_percentage || v.variant_discount
                ? parseInt(v.discount_percentage || v.variant_discount)
                : 0,
            is_default: v.is_default !== undefined ? !!v.is_default : false,
            active: v.active !== undefined ? !!v.active : true,
            shipping_amount: v.shipping_amount
              ? parseFloat(v.shipping_amount)
              : 0,

            // Bulk Pricing
            is_bulk_enabled:
              v.is_bulk_enabled !== undefined ? !!v.is_bulk_enabled : false,
            bulk_min_quantity: v.bulk_min_quantity
              ? parseInt(v.bulk_min_quantity)
              : 50,
            bulk_discount_percentage: v.bulk_discount_percentage
              ? parseInt(v.bulk_discount_percentage)
              : 0,
            bulk_price: v.bulk_price ? parseFloat(v.bulk_price) : 0,
          };

          // Include inventory if stock is provided
          const stockQuantity = v.variant_stock || v.inventory?.stock_quantity;
          if (stockQuantity !== undefined) {
            variantData.inventory = {
              stock_quantity: parseInt(stockQuantity),
              reserved_quantity: v.inventory?.reserved_quantity || 0,
            };
          }

          // Include attributes if provided - proper handling for update
          if (
            v.attributes &&
            Array.isArray(v.attributes) &&
            v.attributes.length > 0
          ) {
            variantData.attributes = v.attributes.filter(
              (attr) => attr && (attr.attribute_name || attr.attribute_value),
            );
          }

          return variantData;
        });

        console.log("Mapping variants with attributes:", mappedVariants);
        await ProductDAO.updateProductWithVariants(
          productId,
          {},
          mappedVariants,
        );
        console.log("Product variants updated with new data");
      } catch (variantError) {
        console.error("Error updating variants:", variantError);
      }
    }

    // Handle Brand Relation if 'brand_id' or 'brand_name' (brand_id) is passed
    const brandId = updateData.brand_id || updateData.brand_name;
    if (brandId) {
      try {
        // Remove existing brand relations first
        await prisma.product_brand.deleteMany({
          where: { product_id: productId },
        });
        // Add new brand relation
        await ProductDAO.addBrandToProduct(productId, brandId);
        console.log("Linked product to brand:", brandId);
      } catch (brandError) {
        console.error("Error linking brand:", brandError.message);
      }
    }

    // Store is handled via store_id field in products table (already updated above)
    // No need for separate recommended store linking unless using product_recommended_store table

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
