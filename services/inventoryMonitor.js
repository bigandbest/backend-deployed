/**
 * Warehouse Inventory Monitor - Cron Job
 * Automatically monitors and transfers inventory from zonal to division warehouses
 * when stock falls below threshold
 */

import cron from "node-cron";
import fetch from "node-fetch";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000/api";

/**
 * Monitor and auto-transfer low stock items
 */
const monitorInventory = async () => {
  try {
    console.log(`[${new Date().toISOString()}] Starting inventory monitor...`);

    const response = await fetch(
      `${API_BASE_URL}/product-availability/monitor-transfer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log(
        `[${new Date().toISOString()}] Inventory monitor completed successfully`
      );
      console.log(`  - Total low stock products: ${result.total_low_stock}`);
      console.log(`  - Transfers completed: ${result.transfers.length}`);
      console.log(`  - Errors: ${result.errors.length}`);

      if (result.transfers.length > 0) {
        console.log("\n  Transfers:");
        result.transfers.forEach((transfer) => {
          console.log(
            `    - ${transfer.warehouse_name}: ${transfer.product_id} (${transfer.previous_stock} → ${transfer.new_stock})`
          );
        });
      }

      if (result.errors.length > 0) {
        console.error("\n  Errors:");
        result.errors.forEach((error) => {
          console.error(
            `    - Product ${error.product_id} in warehouse ${error.warehouse_id}: ${error.error}`
          );
        });
      }
    } else {
      console.error(
        `[${new Date().toISOString()}] Inventory monitor failed:`,
        result.error
      );
    }
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error in inventory monitor:`,
      error.message
    );
  }
};

/**
 * Setup cron jobs
 */
export const setupInventoryCronJobs = () => {
  // Run every hour
  cron.schedule("0 * * * *", () => {
    console.log(
      `\n[${new Date().toISOString()}] ⏰ Hourly inventory monitor triggered`
    );
    monitorInventory();
  });

  // Run every 6 hours (more conservative)
  // cron.schedule('0 */6 * * *', () => {
  //   console.log(`\n[${new Date().toISOString()}] ⏰ 6-hourly inventory monitor triggered`);
  //   monitorInventory();
  // });

  // Run daily at 2 AM
  cron.schedule("0 2 * * *", () => {
    console.log(
      `\n[${new Date().toISOString()}] ⏰ Daily inventory monitor triggered`
    );
    monitorInventory();
  });

  console.log("✅ Inventory monitoring cron jobs scheduled:");
  console.log("   - Hourly: 0 * * * * (every hour)");
  console.log("   - Daily: 0 2 * * * (2 AM every day)");

  // Run immediately on startup
  console.log("\n🚀 Running initial inventory check...");
  monitorInventory();
};

/**
 * Manual trigger for testing
 */
export const manualInventoryCheck = async () => {
  console.log("\n🔧 Manual inventory check triggered");
  await monitorInventory();
};

// If running this file directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Starting Warehouse Inventory Monitor...\n");
  setupInventoryCronJobs();

  // Keep the process running
  process.on("SIGINT", () => {
    console.log("\n\n👋 Shutting down inventory monitor...");
    process.exit(0);
  });
}

export default {
  setupInventoryCronJobs,
  manualInventoryCheck,
  monitorInventory,
};
