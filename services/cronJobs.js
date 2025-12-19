// services/cronJobs.js
// Scheduled tasks for auto-expiry of enquiries, bids, and locked bids

import { supabase } from "../config/supabaseClient.js";
import cron from "node-cron";

/**
 * Run auto-expiry functions
 * This function calls the database functions to expire old enquiries, bids, and locked bids
 */
export const runAutoExpiry = async () => {
  try {
    console.log("[CRON] Running auto-expiry tasks...");

    // Expire old enquiries
    const { data: enquiryData, error: enquiryError } = await supabase.rpc(
      "expire_old_enquiries"
    );

    if (enquiryError) {
      console.error("[CRON] Error expiring enquiries:", enquiryError);
    } else {
      console.log(`[CRON] Expired ${enquiryData || 0} enquiries`);
    }

    // Expire old bids
    const { data: bidData, error: bidError } = await supabase.rpc(
      "expire_old_bids"
    );

    if (bidError) {
      console.error("[CRON] Error expiring bids:", bidError);
    } else {
      console.log(`[CRON] Expired ${bidData || 0} bids`);
    }

    // Release stock from expired locked bids
    const { data: stockData, error: stockError } = await supabase.rpc(
      "release_expired_bid_stock"
    );

    if (stockError) {
      console.error("[CRON] Error releasing expired bid stock:", stockError);
    } else {
      console.log(`[CRON] Released stock from ${stockData || 0} expired locked bids`);
    }

    console.log("[CRON] Auto-expiry tasks completed");
  } catch (error) {
    console.error("[CRON] Unexpected error in runAutoExpiry:", error);
  }
};

/**
 * Initialize cron jobs
 * Call this function in server.js to start scheduled tasks
 * 
 * NOTE: Currently disabled because database functions don't exist yet
 * To enable: Create the required database functions in Supabase first
 */
export const initializeCronJobs = () => {
  console.log("🕐 Cron jobs are currently disabled");
  console.log("⚠️  Database functions (expire_old_enquiries, expire_old_bids, release_expired_bid_stock) need to be created first");
  console.log("💡 To enable: Run the SQL schema script in Supabase, then uncomment the cron.schedule below");

  // DISABLED: Run every 5 minutes
  // Uncomment this after creating the database functions
  // cron.schedule("*/5 * * * *", async () => {
  //   await runAutoExpiry();
  // });
  // console.log("✅ Cron jobs initialized - Running every 5 minutes");
};

/**
 * Manual trigger for testing
 * Can be called via API endpoint for testing purposes
 */
export const manualTriggerExpiry = async (req, res) => {
  try {
    await runAutoExpiry();
    return res.json({
      success: true,
      message: "Auto-expiry tasks executed successfully",
    });
  } catch (error) {
    console.error("Error in manual trigger:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to run auto-expiry tasks",
    });
  }
};
