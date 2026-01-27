import generalEnquiryDao from "../dao/general-enquiry.dao.js";

// Get enquiries count
export const getEnquiriesCount = async (req, res) => {
  try {
    const { status } = req.query;

    const filters = {
      ...(status && { status }),
      OR: [
        { type: null },
        { type: { not: "custom_printing" } }
      ]
    };

    const count = await generalEnquiryDao.count(filters);

    res.status(200).json({
      success: true,
      count: count || 0,
    });
  } catch (err) {
    console.error("Unexpected error in getEnquiriesCount:", err);
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred",
    });
  }
};