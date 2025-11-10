import { supabase } from "../config/supabaseClient.js";

async function debugWarehouse6() {
  try {
    console.log("Debugging warehouse 6 products issue...\n");

    // Step 1: Check if warehouse 6 exists
    console.log("1. Checking if warehouse 6 exists:");
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("*")
      .eq("id", 6)
      .single();

    if (warehouseError || !warehouse) {
      console.error("❌ Warehouse 6 not found:", warehouseError?.message);
      return;
    } else {
      console.log("✅ Warehouse 6 exists:", warehouse.name);
    }

    // Step 2: Check if there are any stock records for warehouse 6
    console.log("\n2. Checking stock records for warehouse 6:");
    const { data: stockRecords, error: stockError } = await supabase
      .from("product_warehouse_stock")
      .select("*")
      .eq("warehouse_id", 6)
      .eq("is_active", true);

    if (stockError) {
      console.error("❌ Error fetching stock records:", stockError.message);
      return;
    }

    console.log(
      `✅ Found ${stockRecords?.length || 0} stock records for warehouse 6`
    );

    if (stockRecords && stockRecords.length > 0) {
      console.log("Sample stock record:", stockRecords[0]);
    }

    // Step 3: Try to fetch products with basic info (without join)
    console.log("\n3. Testing basic product_warehouse_stock query:");
    const { data: basicStock, error: basicError } = await supabase
      .from("product_warehouse_stock")
      .select("product_id, stock_quantity, reserved_quantity")
      .eq("warehouse_id", 6)
      .eq("is_active", true)
      .limit(5);

    if (basicError) {
      console.error("❌ Basic stock query failed:", basicError.message);
    } else {
      console.log("✅ Basic stock query successful");
      console.log(
        "Product IDs:",
        basicStock?.map((s) => s.product_id)
      );
    }

    // Step 4: Try the problematic join query
    console.log("\n4. Testing the join query that's failing:");
    const { data: joinedData, error: joinError } = await supabase
      .from("product_warehouse_stock")
      .select(
        `
        product_id,
        stock_quantity,
        reserved_quantity,
        products (
          id,
          name,
          price
        )
      `
      )
      .eq("warehouse_id", 6)
      .eq("is_active", true)
      .limit(3);

    if (joinError) {
      console.error("❌ Join query failed:", joinError.message);
      console.error("Details:", joinError.details);
      console.error("Hint:", joinError.hint);
      console.error("Code:", joinError.code);
    } else {
      console.log("✅ Join query successful");
      console.log(
        "Sample joined data:",
        JSON.stringify(joinedData?.[0], null, 2)
      );
    }

    // Step 5: Check if products exist for the stock records
    if (basicStock && basicStock.length > 0) {
      console.log("\n5. Checking if referenced products exist:");
      const productIds = basicStock.map((s) => s.product_id).slice(0, 3);

      for (const productId of productIds) {
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("id, name")
          .eq("id", productId)
          .single();

        if (productError) {
          console.log(
            `❌ Product ${productId} not found:`,
            productError.message
          );
        } else {
          console.log(`✅ Product ${productId} exists:`, product.name);
        }
      }
    }
  } catch (error) {
    console.error("Debug script failed:", error);
  }
}

debugWarehouse6();
