import { supabase } from "../config/supabaseClient.js";

// Get pincode details and delivery availability
const getPincodeDetails = async (req, res) => {
  try {
    const { pincode } = req.params;

    // Check if pincode exists in any active delivery zone
    const { data, error } = await supabase
      .from("zone_pincodes")
      .select(
        `
        pincode,
        city,
        state,
        is_active,
        delivery_zones!inner(
          name,
          is_active,
          is_nationwide
        )
      `
      )
      .eq("pincode", pincode)
      .eq("is_active", true)
      .eq("delivery_zones.is_active", true);

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery not available in this area",
      });
    }

    // Use the first matching zone (in case pincode is in multiple zones)
    const pincodeData = data[0];

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

    const { data: shippingData, error } = await supabase
      .from("shipping_rates")
      .select("*")
      .eq("pincode", pincode)
      .gte("weight_to", weight)
      .lte("weight_from", weight)
      .single();

    if (error || !shippingData) {
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

    const { data: taxData, error } = await supabase
      .from("tax_rates")
      .select("*")
      .eq("state", state)
      .single();

    if (error || !taxData) {
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
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export { getPincodeDetails, calculateShipping, calculateTax };
