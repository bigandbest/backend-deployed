// controllers/checkCartAvailability.js
import cartAvailabilityDAO from "../dao/cart-availability.dao.js";

export const checkCartAvailability = async (req, res) => {
  try {
    const { items, latitude, longitude, pincode } = req.body;

    // Validate required parameters
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, error: "Items array is required." });
    }

    if (!pincode) {
      return res.status(400).json({ success: false, error: "Pincode is required." });
    }

    if (items.length === 0) {
      return res.status(200).json({
        success: true,
        all_available: true,
        pincode,
        items: []
      });
    }

    const result = await cartAvailabilityDAO.checkDeliveryAvailability(items, latitude, longitude, pincode);

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (err) {
    console.error("Delivery check failed:", err.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};