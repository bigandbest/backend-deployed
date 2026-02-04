import faqTemplateDao from "../dao/faq-template.dao.js";

/**
 * Create new FAQ Template
 */
export const createFaqTemplate = async (req, res) => {
  try {
    const { title, faqs, category_id } = req.body;

    if (!title || !faqs) {
      return res.status(400).json({
        success: false,
        error: "Title and FAQs are required",
      });
    }

    const template = await faqTemplateDao.createTemplate({
      title,
      faqs,
      category_id: category_id || null,
      is_active: true,
    });

    res.status(201).json({
      success: true,
      message: "FAQ template created successfully",
      template,
    });
  } catch (error) {
    console.error("Error creating FAQ template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create FAQ template",
    });
  }
};

/**
 * Get all FAQ templates
 */
export const getAllFaqTemplates = async (req, res) => {
  try {
    const { category_id, search } = req.query;

    const templates = await faqTemplateDao.getAllTemplates({
      category_id,
      search,
    });

    res.status(200).json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error("Error fetching FAQ templates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch FAQ templates",
    });
  }
};

/**
 * Get single FAQ template
 */
export const getFaqTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await faqTemplateDao.getTemplateById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Template not found",
      });
    }

    res.status(200).json({
      success: true,
      template,
    });
  } catch (error) {
    console.error("Error fetching FAQ template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch FAQ template",
    });
  }
};

/**
 * Update FAQ template
 */
export const updateFaqTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Filter valid fields
    const validFields = ["title", "faqs", "category_id", "is_active"];
    const sanitizedData = {};

    validFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        sanitizedData[field] = updateData[field];
      }
    });

    const template = await faqTemplateDao.updateTemplate(id, sanitizedData);

    res.status(200).json({
      success: true,
      message: "FAQ template updated successfully",
      template,
    });
  } catch (error) {
    console.error("Error updating FAQ template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update FAQ template",
    });
  }
};

/**
 * Delete FAQ template
 */
export const deleteFaqTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    await faqTemplateDao.deleteTemplate(id);

    res.status(200).json({
      success: true,
      message: "FAQ template deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting FAQ template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete FAQ template",
    });
  }
};
