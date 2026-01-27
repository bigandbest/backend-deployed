import prisma from "../config/prisma.js";

/**
 * Unique Section DAO - Data access layer for unique sections and product mappings
 */
class UniqueSectionDAO {
  /**
   * Create a new unique section
   * @param {Object} sectionData - Section data
   * @returns {Promise<Object>} Created section
   */
  async create(sectionData) {
    return await prisma.unique_sections.create({
      data: {
        ...sectionData,
        created_at: new Date(),
      },
    });
  }

  /**
   * Update unique section
   * @param {string} id - Section ID
   * @param {Object} sectionData - Updated section data
   * @returns {Promise<Object>} Updated section
   */
  async update(id, sectionData) {
    return await prisma.unique_sections.update({
      where: { id },
      data: {
        ...sectionData,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Delete unique section
   * @param {string} id - Section ID
   * @returns {Promise<Object>} Deleted section
   */
  async delete(id) {
    return await prisma.unique_sections.delete({
      where: { id },
    });
  }

  /**
   * Get all unique sections
   * @returns {Promise<Array>} All sections
   */
  async getAll() {
    return await prisma.unique_sections.findMany({
      orderBy: { created_at: "desc" },
    });
  }

  /**
   * Get unique section by ID
   * @param {string} id - Section ID
   * @returns {Promise<Object>} Section
   */
  async getById(id) {
    return await prisma.unique_sections.findUnique({
      where: { id },
    });
  }

  /**
   * Get unique sections by type
   * @param {string} type - Section type
   * @returns {Promise<Array>} Sections matching type
   */
  async getByType(type) {
    return await prisma.unique_sections.findMany({
      where: { type },
      orderBy: { created_at: "desc" },
    });
  }

  /**
   * Map a product to a unique section
   * @param {string} sectionId - Section ID
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Created mapping
   */
  async mapProduct(sectionId, productId) {
    return await prisma.unique_section_products.create({
      data: {
        section_id: sectionId,
        product_id: productId,
        created_at: new Date(),
      },
    });
  }

  /**
   * Remove product from unique section
   * @param {string} sectionId - Section ID
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Deletion result
   */
  async removeProduct(sectionId, productId) {
    return await prisma.unique_section_products.deleteMany({
      where: {
        section_id: sectionId,
        product_id: productId,
      },
    });
  }

  /**
   * Get all products for a unique section
   * @param {string} sectionId - Section ID
   * @returns {Promise<Array>} Products in section
   */
  async getProductsBySection(sectionId) {
    return await prisma.unique_section_products.findMany({
      where: { section_id: sectionId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            images: true,
            rating: true,
          },
        },
      },
    });
  }

  /**
   * Get all unique sections containing a product
   * @param {string} productId - Product ID
   * @returns {Promise<Array>} Sections containing the product
   */
  async getSectionsByProduct(productId) {
    return await prisma.unique_section_products.findMany({
      where: { product_id: productId },
      include: {
        section: true,
      },
    });
  }

  /**
   * Find unique section by name
   * @param {string} name - Section name
   * @returns {Promise<Object>} Section
   */
  async findByName(name) {
    return await prisma.unique_sections.findFirst({
      where: { name },
    });
  }

  /**
   * Find products by names
   * @param {Array<string>} names - Product names
   * @returns {Promise<Array>} Products
   */
  async findProductsByNames(names) {
    return await prisma.products.findMany({
      where: {
        name: {
          in: names,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
  }

  /**
   * Bulk map products to a section
   * @param {string} sectionId - Section ID
   * @param {Array<string>} productIds - Array of product IDs
   * @returns {Promise<Object>} Bulk creation result
   */
  async bulkMapProducts(sectionId, productIds) {
    const mappings = productIds.map((productId) => ({
      section_id: sectionId,
      product_id: productId,
      created_at: new Date(),
    }));

    return await prisma.unique_section_products.createMany({
      data: mappings,
      skipDuplicates: true,
    });
  }

  /**
   * Check if product is already in section
   * @param {string} sectionId - Section ID
   * @param {string} productId - Product ID
   * @returns {Promise<boolean>} True if exists
   */
  async checkProductInSection(sectionId, productId) {
    const count = await prisma.unique_section_products.count({
      where: {
        section_id: sectionId,
        product_id: productId,
      },
    });
    return count > 0;
  }
}

export default new UniqueSectionDAO();
