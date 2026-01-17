// controllers/checkCartAvailability.js
import cartAvailabilityDAO from "../dao/cart-availability.dao.js";

export const checkCartAvailability = async (req, res) => {
  try {
    const { items, latitude, longitude } = req.body;

    if (!items || !Array.isArray(items) || !latitude || !longitude) {
      return res.status(400).json({ success: false, error: "Items, latitude, and longitude are required." });
    }
    
    if (items.length === 0) {
        return res.status(200).json({
            success: true,
            deliverableProductIds: [],
            undeliverableProductIds: [],
        });
    }

    const result = await cartAvailabilityDAO.checkDeliveryAvailability(items, latitude, longitude);

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (err) {
    console.error("Delivery check failed:", err.message);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};