import prisma from "../config/prisma.js";

/**
 * FAQ Template Data Access Object
 */
class FaqTemplateDAO {
  /**
   * Create a new FAQ template
   * @param {Object} data - Template data
   * @returns {Promise<Object>} Created template
   */
  async createTemplate(data) {
    return await prisma.faq_templates.create({
      data,
    });
  }

  /**
   * Get all active FAQ templates
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} List of templates
   */
  async getAllTemplates(filters = {}) {
    const where = { is_active: true };

    if (filters.category_id) {
      where.category_id = filters.category_id;
    }

    if (filters.search) {
      where.title = {
        contains: filters.search,
        mode: "insensitive",
      };
    }

    return await prisma.faq_templates.findMany({
      where,
      orderBy: { created_at: "desc" },
    });
  }

  /**
   * Get template by ID
   * @param {String} id - Template ID
   * @returns {Promise<Object>} Template or null
   */
  async getTemplateById(id) {
    return await prisma.faq_templates.findUnique({
      where: { id },
    });
  }

  /**
   * Update template
   * @param {String} id - Template ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated template
   */
  async updateTemplate(id, data) {
    return await prisma.faq_templates.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete template (soft delete)
   * @param {String} id - Template ID
   * @returns {Promise<Object>} Deleted template
   */
  async deleteTemplate(id) {
    return await prisma.faq_templates.update({
      where: { id },
      data: { is_active: false },
    });
  }
}

export default new FaqTemplateDAO();
