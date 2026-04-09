import businessPartnerInquiryDao from "../dao/businessPartnerInquiry.dao.js";

// Create a new business partner inquiry (public endpoint)
export const createInquiry = async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      address,
      city,
      state,
      partnership_type,
      message,
    } = req.body;

    // Validation
    if (
      !full_name ||
      !phone ||
      !address ||
      !city ||
      !state ||
      !partnership_type
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Name, phone, address, city, state, and partnership type are required",
      });
    }

    // Phone validation (basic)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone number format (10 digits required)",
      });
    }

    const inquiry = await businessPartnerInquiryDao.create({
      full_name,
      email: email ? String(email) : null,
      phone,
      address,
      city,
      state,
      partnership_type,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Thank you! We will contact you soon.",
      inquiry,
    });
  } catch (err) {
    console.error("Error creating business partner inquiry:", err);
    res.status(500).json({
      success: false,
      error: "Failed to submit inquiry. Please try again.",
    });
  }
};

// Get all inquiries (admin only)
export const getAllInquiries = async (req, res) => {
  try {
    const { status, partnership_type } = req.query;

    const inquiries = await businessPartnerInquiryDao.list({
      status,
      partnership_type,
    });

    res.status(200).json({
      success: true,
      count: inquiries.length,
      inquiries,
    });
  } catch (err) {
    console.error("Error fetching business partner inquiries:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Get inquiry by ID (admin only)
export const getInquiryById = async (req, res) => {
  try {
    const { id } = req.params;

    const inquiry = await businessPartnerInquiryDao.findById(id);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        error: "Inquiry not found",
      });
    }

    res.status(200).json({
      success: true,
      inquiry,
    });
  } catch (err) {
    console.error("Error fetching inquiry:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Update inquiry status (admin only)
export const updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const inquiry = await businessPartnerInquiryDao.update(id, { status });

    res.status(200).json({
      success: true,
      message: "Inquiry status updated successfully",
      inquiry,
    });
  } catch (err) {
    console.error("Error updating inquiry status:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Delete inquiry (admin only)
export const deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;

    await businessPartnerInquiryDao.delete(id);

    res.status(200).json({
      success: true,
      message: "Inquiry deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting inquiry:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// Get inquiry statistics (admin only)
export const getInquiryStats = async (req, res) => {
  try {
    const stats = await businessPartnerInquiryDao.getCountByStatus();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error("Error fetching inquiry stats:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
