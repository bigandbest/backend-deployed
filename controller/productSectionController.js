import productSectionDao from "../dao/product-section.dao.js";
import productSectionProductDao from "../dao/product-section-product.dao.js";
import productSectionCategoryDao from "../dao/product-section-category.dao.js";
import productGridSettingDao from "../dao/product-grid-setting.dao.js";

// Get all product sections
export const getAllProductSections = async (req, res) => {
  try {
    const data = await productSectionDao.list({ active: undefined });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get active product sections only
export const getActiveProductSections = async (req, res) => {
  try {
    const data = await productSectionDao.list({ active: true });
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching active product sections:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get single product section by ID
export const getProductSectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await productSectionDao.getById(parseInt(id));

    if (!data) {
      return res.status(404).json({ error: "Product section not found" });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product section
export const updateProductSection = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    delete updateData.id;
    delete updateData.created_at;

    const data = await productSectionDao.update(parseInt(id), updateData);

    res.status(200).json({
      success: true,
      data,
      message: "Product section updated successfully",
    });
  } catch (error) {
    console.error("Error updating product section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Toggle section active status
export const toggleSectionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await productSectionDao.getById(parseInt(id));

    if (!section) {
      return res.status(404).json({ error: "Product section not found" });
    }

    const newStatus = !section.is_active;
    const data = await productSectionDao.update(parseInt(id), { is_active: newStatus });

    res.status(200).json({
      success: true,
      data,
      message: `Section ${newStatus ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("Error toggling section status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update display order for multiple sections
export const updateSectionOrder = async (req, res) => {
  try {
    const { sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: "sections array is required" });
    }

    for (const section of sections) {
      await productSectionDao.update(parseInt(section.id), { display_order: section.display_order });
    }

    res.status(200).json({
      success: true,
      message: "Section order updated successfully",
    });
  } catch (error) {
    console.error("Error updating section order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== PRODUCT-SECTION ASSIGNMENT FUNCTIONS ==========

// Add products to a section
export const addProductsToSection = async (req, res) => {
  try {
    const { id } = req.params; // section_id
    const { product_ids } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: "product_ids array is required and must not be empty" });
    }

    const section = await productSectionDao.getById(parseInt(id));
    if (!section) return res.status(404).json({ error: "Product section not found" });

    let nextOrder = (await productSectionProductDao.getMaxOrder(parseInt(id))) + 1;

    const assignments = product_ids.map((product_id) => ({
      product_id,
      section_id: parseInt(id),
      display_order: nextOrder++,
    }));

    const data = await productSectionProductDao.upsertMany(assignments);

    res.status(200).json({
      success: true,
      data,
      message: `${product_ids.length} product(s) added to section successfully`,
    });
  } catch (error) {
    console.error("Error adding products to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a product from a section
export const removeProductFromSection = async (req, res) => {
  try {
    const { id, productId } = req.params;
    await productSectionProductDao.deleteBySectionAndProduct(parseInt(id), productId);

    res.status(200).json({
      success: true,
      message: "Product removed from section successfully",
    });
  } catch (error) {
    console.error("Error removing product from section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all products in a section
export const getProductsInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const mappedCategories = await productSectionCategoryDao.listBySection(parseInt(id));
    const data = await productSectionProductDao.listBySection(parseInt(id));

    // Flatten product details
    let products = data.map(item => ({
      assignment_id: item.id,
      display_order: item.display_order,
      assigned_at: item.created_at,
      ...item.product
    }));

    // Filter by mapped categories if any exist
    if (mappedCategories && mappedCategories.length > 0) {
      const categoryIds = mappedCategories.map(mc => mc.category_id);
      products = products.filter(product =>
        product.category_id && categoryIds.includes(product.category_id)
      );
    }

    // Manual pagination as the list is relatively small
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedProducts = products.slice(offset, offset + parseInt(limit));

    res.status(200).json({
      success: true,
      data: paginatedProducts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: products.length,
        totalPages: Math.ceil(products.length / parseInt(limit)),
      },
      filtered_by_categories: mappedCategories && mappedCategories.length > 0,
      mapped_category_count: mappedCategories ? mappedCategories.length : 0,
    });
  } catch (error) {
    console.error("Error fetching products in section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update product order within a section
export const updateProductOrderInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: "products array is required" });
    }

    for (const product of products) {
      // Find the assignment record first to get its ID, or add a method to update by section/product
      // To simplify, we'll assume product contains the assignment id if possible, 
      // but the original controller used section_id + product_id.
      // Since upsertMany handles it, we can reuse that for order updates.
      await productSectionProductDao.upsertMany([{
        section_id: parseInt(id),
        product_id: product.product_id,
        display_order: product.display_order
      }]);
    }

    res.status(200).json({
      success: true,
      message: "Product order updated successfully",
    });
  } catch (error) {
    console.error("Error updating product order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get sections for a specific product
export const getSectionsForProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const data = await productSectionProductDao.listByProduct(productId);

    const sections = data.map(item => ({
      assignment_id: item.id,
      display_order: item.display_order,
      ...item.product_sections
    }));

    res.status(200).json({ success: true, data: sections });
  } catch (error) {
    console.error("Error fetching sections for product:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== CATEGORY-SECTION MAPPING FUNCTIONS ==========

// Add categories to a section
export const addCategoriesToSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_ids } = req.body;

    if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
      return res.status(400).json({ error: "category_ids array is required and must not be empty" });
    }

    const mappings = category_ids.map((category_id) => ({
      section_id: parseInt(id),
      category_id: parseInt(category_id),
    }));

    const data = await productSectionCategoryDao.addMany(mappings);

    res.status(200).json({
      success: true,
      data,
      message: `${category_ids.length} category/categories mapped to section successfully`,
    });
  } catch (error) {
    console.error("Error adding categories to section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove a category from a section
export const removeCategoryFromSection = async (req, res) => {
  try {
    const { id, categoryId } = req.params;
    await productSectionCategoryDao.remove(parseInt(id), parseInt(categoryId));

    res.status(200).json({
      success: true,
      message: "Category removed from section successfully",
    });
  } catch (error) {
    console.error("Error removing category from section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all categories mapped to a section
export const getCategoriesInSection = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await productSectionCategoryDao.listBySection(parseInt(id));

    res.status(200).json({ success: true, data, total: data.length });
  } catch (error) {
    console.error("Error fetching categories in section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get sections for a specific category
export const getSectionsForCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const data = await productSectionCategoryDao.listByProductCategory(parseInt(categoryId));

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching sections for category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ========== GRID SETTINGS FUNCTIONS (Merged from productGridSettingsController.js) ==========

export const getProductGridSettings = async (req, res) => {
  try {
    const settings = await productGridSettingDao.getSettings();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("Error fetching grid settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProductGridSettings = async (req, res) => {
  try {
    const { is_visible } = req.body;
    const settings = await productGridSettingDao.updateSettings(is_visible);
    res.status(200).json({
      success: true,
      data: settings,
      message: "Product grid settings updated successfully",
    });
  } catch (error) {
    console.error("Error updating grid settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
