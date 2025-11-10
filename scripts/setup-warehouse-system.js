const { supabase } = require("./config/supabaseClient.js");

async function createStockMovementsTable() {
  try {
    console.log("Creating stock_movements table...");

    // Create the table
    const { error: tableError } = await supabase
      .from("stock_movements")
      .select("*")
      .limit(1);

    // If table doesn't exist, create it using raw SQL
    if (tableError && tableError.code === "42P01") {
      console.log("Table does not exist, creating manually...");

      // We'll use a simpler approach - just check if we can create a sample record
      console.log(
        "✅ Please run the SQL migration manually in your Supabase dashboard"
      );
      console.log("SQL file: ./database/stock_movements_table.sql");

      // For now, let's just ensure the table structure exists in our product_warehouse_stock table
      const { data: stockData, error: stockError } = await supabase
        .from("product_warehouse_stock")
        .select("*")
        .limit(1);

      if (stockError) {
        console.log("❌ product_warehouse_stock table issue:", stockError);
      } else {
        console.log("✅ product_warehouse_stock table is ready");
      }
    } else {
      console.log("✅ stock_movements table already exists");
    }

    // Test if warehouses table exists and has central warehouse
    const { data: warehouses, error: warehouseError } = await supabase
      .from("warehouses")
      .select("*")
      .eq("type", "central")
      .limit(1);

    if (warehouseError) {
      console.log("❌ Warehouses table issue:", warehouseError);
    } else if (!warehouses || warehouses.length === 0) {
      console.log("⚠️  No central warehouse found. Creating one...");

      const { data: newWarehouse, error: createError } = await supabase
        .from("warehouses")
        .insert([
          {
            name: "Central Warehouse",
            type: "central",
            location: "Main Distribution Center",
            address: "123 Main St, Warehouse District",
            contact_person: "Warehouse Manager",
            contact_phone: "+1234567890",
            contact_email: "warehouse@bigbest.com",
            is_active: true,
          },
        ])
        .select()
        .single();

      if (createError) {
        console.log("❌ Failed to create central warehouse:", createError);
      } else {
        console.log("✅ Central warehouse created:", newWarehouse);
      }
    } else {
      console.log("✅ Central warehouse exists:", warehouses[0].name);
    }
  } catch (error) {
    console.error("Setup error:", error);
  }

  process.exit(0);
}

createStockMovementsTable();
