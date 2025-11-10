import { supabase } from "../config/supabaseClient.js";

async function diagnoseDatabaseIssues() {
  try {
    console.log("Diagnosing database warehouse-related issues...\n");

    // Check 1: Verify products table structure
    console.log("1. Checking products table columns:");
    const requiredColumns = [
      "warehouse_mapping_type",
      "assigned_warehouse_ids",
      "warehouse_notes",
    ];

    for (const columnName of requiredColumns) {
      const { data, error } = await supabase
        .rpc("check_column_exists", {
          table_name: "products",
          column_name: columnName,
        })
        .catch(() => ({ data: null, error: "Function not available" }));

      if (error) {
        // Alternative method: try to select from information_schema
        const { data: columnInfo, error: columnError } = await supabase
          .from("information_schema.columns")
          .select("column_name, data_type, column_default")
          .eq("table_name", "products")
          .eq("column_name", columnName)
          .single();

        if (columnError) {
          console.log(`   ❌ ${columnName}: Cannot verify (likely missing)`);
        } else {
          console.log(`   ✅ ${columnName}: ${columnInfo.data_type}`);
        }
      }
    }

    // Check 2: Test a simple product query to see what fails
    console.log("\n2. Testing basic product query:");
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, name, warehouse_mapping_type, assigned_warehouse_ids")
      .limit(1);

    if (productError) {
      console.log("   ❌ Product query failed:", productError.message);
      console.log("   Details:", productError.details);
    } else {
      console.log("   ✅ Product query successful");
      if (products && products.length > 0) {
        console.log("   Sample product:", products[0]);
      }
    }

    // Check 3: Check foreign key constraints
    console.log("\n3. Checking foreign key constraints:");
    const { data: constraints, error: constraintError } = await supabase
      .from("information_schema.table_constraints")
      .select("constraint_name, constraint_type")
      .eq("table_name", "product_warehouse_stock")
      .eq("constraint_type", "FOREIGN KEY");

    if (constraintError) {
      console.log(
        "   ❌ Could not check constraints:",
        constraintError.message
      );
    } else {
      console.log("   Foreign key constraints found:");
      constraints?.forEach((c) => console.log(`   - ${c.constraint_name}`));
    }

    // Check 4: Test product update (what's actually failing)
    console.log("\n4. Testing product update simulation:");
    try {
      // This should fail if columns are missing
      const testUpdate = {
        warehouse_mapping_type: "nationwide",
        assigned_warehouse_ids: [1, 2, 3],
        warehouse_notes: "Test note",
      };

      console.log("   Test payload:", testUpdate);
      console.log("   (Not executing - just showing what would fail)");
    } catch (error) {
      console.log("   ❌ Update would fail:", error.message);
    }

    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY:");
    console.log(
      "- Run the migration SQL in Supabase dashboard to fix missing columns"
    );
    console.log("- The migration is in: add-missing-foreign-keys.sql");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Diagnosis failed:", error);
  }
}

diagnoseDatabaseIssues();
