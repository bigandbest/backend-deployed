import { supabase } from "../config/supabaseClient.js";

async function diagnoseTriggerIssues() {
  try {
    console.log("Diagnosing trigger and updated_at issues...\n");

    // Check 1: Look for products table columns related to timestamps
    console.log("1. Checking products table timestamp columns:");
    const timestampColumns = [
      "updated_at",
      "delivery_updated_at",
      "created_at",
    ];

    for (const columnName of timestampColumns) {
      const { data: columnInfo, error: columnError } = await supabase
        .from("information_schema.columns")
        .select("column_name, data_type, column_default")
        .eq("table_name", "products")
        .eq("column_name", columnName)
        .single();

      if (columnError) {
        console.log(`   ❌ ${columnName}: Missing`);
      } else {
        console.log(`   ✅ ${columnName}: ${columnInfo.data_type}`);
      }
    }

    // Check 2: Look for triggers on products table
    console.log("\n2. Checking triggers on products table:");
    const { data: triggers, error: triggerError } = await supabase
      .from("information_schema.triggers")
      .select("trigger_name, event_manipulation, action_statement")
      .eq("event_object_table", "products");

    if (triggerError) {
      console.log("   ❌ Could not check triggers:", triggerError.message);
    } else if (triggers && triggers.length > 0) {
      console.log("   Found triggers:");
      triggers.forEach((t) => {
        console.log(`   - ${t.trigger_name} (${t.event_manipulation})`);
        console.log(`     Action: ${t.action_statement.substring(0, 100)}...`);
      });
    } else {
      console.log("   No triggers found on products table");
    }

    // Check 3: Test a simple product update to see what fails
    console.log("\n3. Testing simple product query:");
    const { data: sampleProduct, error: productError } = await supabase
      .from("products")
      .select("id, name, updated_at, delivery_updated_at, created_at")
      .limit(1)
      .single();

    if (productError) {
      console.log("   ❌ Product query failed:", productError.message);
      if (productError.message.includes("updated_at")) {
        console.log(
          "   💡 This confirms products table is missing updated_at column"
        );
      }
    } else {
      console.log("   ✅ Product query successful");
      console.log("   Sample product timestamps:", {
        id: sampleProduct.id,
        updated_at: sampleProduct.updated_at,
        delivery_updated_at: sampleProduct.delivery_updated_at,
        created_at: sampleProduct.created_at,
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("DIAGNOSIS SUMMARY:");
    console.log("- The products table likely needs an 'updated_at' column");
    console.log("- There may be triggers expecting this column");
    console.log("- Run the updated migration to add the missing column");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Diagnosis failed:", error);
  }
}

diagnoseTriggerIssues();
