// controllers/paymentController.js
import Razorpay from "razorpay";
import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config();

// Log environment variable status at module load time
console.log("=== RAZORPAY INITIALIZATION ===");
console.log("Environment:", process.env.NODE_ENV || "development");
console.log("RAZORPAY_KEY_ID exists:", !!process.env.RAZORPAY_KEY_ID);
console.log("RAZORPAY_KEY_ID prefix:", process.env.RAZORPAY_KEY_ID?.substring(0, 12) || "MISSING");
console.log("RAZORPAY_KEY_SECRET exists:", !!process.env.RAZORPAY_KEY_SECRET);
console.log("RAZORPAY_KEY_SECRET length:", process.env.RAZORPAY_KEY_SECRET?.length || 0);
console.log("Key type:", process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "LIVE" : 
                        process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "TEST" : "UNKNOWN");
console.log("================================");

// Validate credentials before initialization
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ CRITICAL: Razorpay credentials are missing!");
  console.error("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "Present" : "MISSING");
  console.error("RAZORPAY_KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET ? "Present" : "MISSING");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

console.log("✅ Razorpay instance created");

export const createRazorpayOrder = async (req, res) => {
  try {
    console.log("\n=== CREATE RAZORPAY ORDER REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request body:", req.body);
    console.log("Credentials status:", {
      key_id_present: !!process.env.RAZORPAY_KEY_ID,
      key_id_prefix: process.env.RAZORPAY_KEY_ID?.substring(0, 12) || "MISSING",
      key_secret_present: !!process.env.RAZORPAY_KEY_SECRET,
      key_secret_length: process.env.RAZORPAY_KEY_SECRET?.length || 0,
      environment: process.env.NODE_ENV || "development",
    });

    const { amount } = req.body;

    if (!amount || isNaN(amount)) {
      console.error("❌ Invalid amount:", amount);
      return res
        .status(400)
        .json({ success: false, error: "Valid amount is required" });
    }

    // Validate credentials before making API call
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("❌ CRITICAL: Razorpay credentials missing at order creation");
      return res.status(500).json({
        success: false,
        error: "Payment gateway authentication failed. Please contact support.",
        details: "Invalid Razorpay credentials configured on the server.",
      });
    }

    const options = {
      amount: amount, // Already in paisa from frontend
      currency: "INR",
      receipt: `receipt_${Math.floor(Math.random() * 1000000)}`,
      payment_capture: 1,
    };

    console.log("Creating Razorpay order with options:", options);
    console.log("Using Razorpay instance with key:", process.env.RAZORPAY_KEY_ID?.substring(0, 12));
    
    const order = await razorpay.orders.create(options);
    
    console.log("✅ Razorpay order created successfully");
    console.log("Order ID:", order.id);
    console.log("Order amount:", order.amount);
    console.log("Order currency:", order.currency);
    console.log("=====================================\n");

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("\n❌ RAZORPAY ORDER CREATION FAILED");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Error stack:", error.stack);
    
    if (error.response) {
      console.error("API Response status:", error.response.status);
      console.error("API Response data:", JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.error) {
      console.error("Razorpay error details:", JSON.stringify(error.error, null, 2));
    }
    
    console.error("Current credentials status:", {
      key_id_present: !!process.env.RAZORPAY_KEY_ID,
      key_id_value: process.env.RAZORPAY_KEY_ID?.substring(0, 12) || "MISSING",
      key_secret_present: !!process.env.RAZORPAY_KEY_SECRET,
    });
    console.error("=====================================\n");
    
    // Check if it's an authentication error
    const isAuthError = error.message?.toLowerCase().includes("authentication") ||
                        error.message?.toLowerCase().includes("invalid") ||
                        error.message?.toLowerCase().includes("key") ||
                        error.statusCode === 401;
    
    return res.status(500).json({
      success: false,
      error: isAuthError ? 
        "Payment gateway authentication failed. Please contact support." : 
        "Razorpay order creation failed",
      details: isAuthError ? 
        "Invalid Razorpay credentials configured on the server." : 
        error.message,
    });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  console.log("\n=== VERIFY RAZORPAY PAYMENT ===");
  console.log("Timestamp:", new Date().toISOString());
  
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  console.log("Payment verification request:", {
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    signature_received: razorpay_signature ? "Present" : "Missing",
    key_secret_present: !!process.env.RAZORPAY_KEY_SECRET,
  });

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  console.log("Signature comparison:", {
    generated_signature: generatedSignature,
    received_signature: razorpay_signature,
    match: generatedSignature === razorpay_signature,
  });

  if (generatedSignature === razorpay_signature) {
    console.log("✅ Payment verified successfully");
    console.log("===============================\n");
    return res.json({ success: true, message: "Payment verified" });
  } else {
    console.error("❌ Payment verification failed - signature mismatch");
    console.error("===============================\n");
    return res.status(400).json({ success: false, error: "Invalid signature" });
  }
};

export const verifyRazorpaySignature = (req, res) => {
  console.log("\n=== VERIFY RAZORPAY SIGNATURE ===");
  console.log("Timestamp:", new Date().toISOString());
  
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  console.log("Signature verification request:", {
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    signature_present: !!razorpay_signature,
  });

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  console.log("Signature validation:", {
    expected: expectedSignature,
    received: razorpay_signature,
    match: expectedSignature === razorpay_signature,
  });

  if (expectedSignature === razorpay_signature) {
    console.log("✅ Signature verified successfully");
    console.log("=================================\n");
    return res.json({ success: true, message: "Payment signature verified" });
  } else {
    console.error("❌ Signature verification failed");
    console.error("=================================\n");
    return res
      .status(400)
      .json({ success: false, message: "Invalid signature" });
  }
};
