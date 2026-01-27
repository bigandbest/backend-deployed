import UniqueSectionDAO from "../dao/unique-section.dao.js";

/**
 * Unique Section Controller - Routes for unique sections and product mappings
 * Updated to use unique-section.dao.js
 */

// Add Unique Section
export const addUniqueSection = async (req, res) => {
  try {
    const { name, type, description } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Name and type are required" });
    }

    const section = await UniqueSectionDAO.create({ name, type, description });

    res.status(201).json(section);
  } catch (error) {
    console.error("Error adding unique section:", error);
    res.status(500).json({ error: error.message });
  }
};

// Edit Unique Section
export const editUniqueSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, description } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Name and type are required" });
    }

    const section = await UniqueSectionDAO.update(id, {
      name,
      type,
      description,
    });

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    res.json(section);
  } catch (error) {
    console.error("Error editing unique section:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete Unique Section
export const deleteUniqueSection = async (req, res) => {
  try {
    const { id } = req.params;
    await UniqueSectionDAO.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting unique section:", error);
    res.status(500).json({ error: error.message });
  }
};

// View All Unique Sections
export const getAllUniqueSections = async (req, res) => {
  try {
    const sections = await UniqueSectionDAO.getAll();
    res.json(sections);
  } catch (error) {
    console.error("Error fetching unique sections:", error);
    res.status(500).json({ error: error.message });
  }
};

// View a Single Unique Section
export const getSingleUniqueSection = async (req, res) => {
  try {
    const { id } = req.params;
    const section = await UniqueSectionDAO.getById(id);

    if (!section) {
      return res.status(404).json({ error: "Section not found" });
    }

    res.json(section);
  } catch (error) {
    console.error("Error fetching unique section:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get Unique Sections by Type
export const getUniqueSectionsByType = async (req, res) => {
  try {
    const { type } = req.params;
    const sections = await UniqueSectionDAO.getByType(type);
    res.json(sections);
  } catch (error) {
    console.error("Error fetching sections by type:", error);
    res.status(500).json({ error: error.message });
  }
};

// --- Unique Section Product Mapping Logic ---

// Map a single product to a Unique Section using IDs
export const mapProductToUniqueSection = async (req, res) => {
  try {
    const { section_id, product_id } = req.body;

    if (!section_id || !product_id) {
      return res
        .status(400)
        .json({ error: "section_id and product_id are required" });
    }

    // Check if mapping already exists
    const exists = await UniqueSectionDAO.checkProductInSection(
      section_id,
      product_id,
    );
    if (exists) {
      return res
        .status(409)
        .json({ error: "Product is already mapped to this section" });
    }

    const mapping = await UniqueSectionDAO.mapProduct(section_id, product_id);
    res.status(201).json({ message: "Product mapped successfully", mapping });
  } catch (error) {
    console.error("Error mapping product:", error);
    res.status(500).json({ error: error.message });
  }
};

// Remove a product from a Unique Section
export const removeProductFromUniqueSection = async (req, res) => {
  try {
    const { section_id, product_id } = req.body;

    if (!section_id || !product_id) {
      return res
        .status(400)
        .json({ error: "section_id and product_id are required" });
    }

    await UniqueSectionDAO.removeProduct(section_id, product_id);
    res.status(200).json({ message: "Product removed from section" });
  } catch (error) {
    console.error("Error removing product:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all Unique Sections stocking a product
export const getUniqueSectionsForProduct = async (req, res) => {
  try {
    const { product_id } = req.params;
    const sections = await UniqueSectionDAO.getSectionsByProduct(product_id);
    res.json(sections);
  } catch (error) {
    console.error("Error fetching sections for product:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all products from a Unique Section
export const getProductsForUniqueSection = async (req, res) => {
  try {
    const { section_id } = req.params;
    const products = await UniqueSectionDAO.getProductsBySection(section_id);
    res.json(products);
  } catch (error) {
    console.error("Error fetching products for section:", error);
    res.status(500).json({ error: error.message });
  }
};

// Bulk map products by names and Unique Section name
export const bulkMapUniqueSectionByNames = async (req, res) => {
  try {
    const { section_name, product_names } = req.body;

    if (!section_name || !product_names || !Array.isArray(product_names)) {
      return res
        .status(400)
        .json({ error: "section_name and product_names[] are required" });
    }

    // Find section
    const section = await UniqueSectionDAO.findByName(section_name);
    if (!section) {
      return res
        .status(404)
        .json({ error: `Section "${section_name}" not found` });
    }

    // Find products
    const products = await UniqueSectionDAO.findProductsByNames(product_names);
    if (!products || products.length === 0) {
      return res.status(404).json({ error: "No matching products found" });
    }

    // Bulk map products
    const productIds = products.map((p) => p.id);
    const result = await UniqueSectionDAO.bulkMapProducts(
      section.id,
      productIds,
    );

    res.status(201).json({
      message: `Mapped ${products.length} products to "${section_name}"`,
      section_id: section.id,
      mapped_products: products.map((p) => p.name),
      count: result.count,
    });
  } catch (error) {
    console.error("Bulk map error:", error);
    res.status(500).json({ error: error.message });
  }
};
