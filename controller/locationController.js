import axios from 'axios';
import zonePincodeDao from "../dao/zone-pincode.dao.js";
import shippingRateDao from "../dao/shipping-rate.dao.js";
import taxRateDao from "../dao/tax-rate.dao.js";

// Get pincode details and delivery availability
const getPincodeDetails = async (req, res) => {
  try {
    const { pincode } = req.params;

    // Check if pincode exists in any active delivery zone
    const pincodeData = await zonePincodeDao.getByPincode(pincode);

    if (!pincodeData) {
      return res.status(404).json({
        success: false,
        message: "Delivery not available in this area",
      });
    }

    res.json({
      success: true,
      data: {
        pincode: pincodeData.pincode,
        city: pincodeData.city,
        state: pincodeData.state,
        deliveryAvailable: true,
        deliveryTime: "2-3 business days", // Default delivery time
        codAvailable: true, // Default COD availability
      },
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Calculate shipping charges
const calculateShipping = async (req, res) => {
  try {
    const { pincode, weight = 1, orderValue = 0 } = req.body;

    const shippingData = await shippingRateDao.getByPincodeAndWeight(pincode, weight);

    if (!shippingData) {
      return res.status(404).json({
        success: false,
        message: "Shipping not available for this pincode",
      });
    }

    const shippingCharge =
      orderValue >= shippingData.free_shipping_threshold
        ? 0
        : shippingData.shipping_charge;

    res.json({
      success: true,
      data: {
        shippingCharge,
        freeShippingThreshold: shippingData.free_shipping_threshold,
        isFreeShipping: orderValue >= shippingData.free_shipping_threshold,
        expressAvailable: shippingData.express_available,
        expressCharge: shippingData.express_charge,
      },
    });
  } catch (error) {
    console.error("Calculate shipping error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Calculate tax
const calculateTax = async (req, res) => {
  try {
    const { state, amount } = req.body;

    const taxData = await taxRateDao.getByState(state);

    if (!taxData) {
      return res.status(404).json({
        success: false,
        message: "Tax rate not found for this state",
      });
    }

    const taxAmount = (amount * taxData.gst_rate) / 100;

    res.json({
      success: true,
      data: {
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        gstRate: taxData.gst_rate,
        cgstRate: taxData.cgst_rate,
        sgstRate: taxData.sgst_rate,
        igstRate: taxData.igst_rate,
      },
    });
  } catch (error) {
    console.error("Calculate tax error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Proxy search request to OpenStreetMap
const searchLocation = async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q,
        format: 'json',
      },
      headers: {
        'User-Agent': 'BigAndBestMart/1.0 (contact@bigandbestmart.com)',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Nominatim API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch from OpenStreetMap' });
  }
};

export { getPincodeDetails, calculateShipping, calculateTax, searchLocation };
