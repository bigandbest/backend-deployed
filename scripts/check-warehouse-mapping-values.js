// Check current warehouse_mapping_type values in database
import { createClient } from "@supabase/supabase-js";


const supabase = createClient(supabaseUrl, supabaseKey);

async function checkWarehouseMappingValues() {
  try {
    console.log("🔍 Checking current warehouse_mapping_type values...");

    // Get all distinct warehouse_mapping_type values
    const { data: values, error } = await supabase
      .from("products")
      .select("warehouse_mapping_type")
      .not("warehouse_mapping_type", "is", null);

    if (error) {
      console.error("❌ Error fetching values:", error);
      return;
    }

    // Get unique values
    const uniqueValues = [
      ...new Set(values.map((row) => row.warehouse_mapping_type)),
    ];

    console.log("📊 Found warehouse_mapping_type values:");
    uniqueValues.forEach((value) => {
      console.log(`   - "${value}"`);
    });

    // Count occurrences
    console.log("\n📈 Value counts:");
    uniqueValues.forEach((value) => {
      const count = values.filter(
        (row) => row.warehouse_mapping_type === value
      ).length;
      console.log(`   - "${value}": ${count} products`);
    });

    // Check if any values are not in allowed constraint
    const allowedValues = ["nationwide", "zonal", "custom"];
    const invalidValues = uniqueValues.filter(
      (value) => !allowedValues.includes(value)
    );

    if (invalidValues.length > 0) {
      console.log("\n⚠️  Invalid values found (not in constraint):");
      invalidValues.forEach((value) => {
        const count = values.filter(
          (row) => row.warehouse_mapping_type === value
        ).length;
        console.log(`   - "${value}": ${count} products`);
      });

      console.log("\n💡 Suggested constraint update:");
      const allValues = [...allowedValues, ...invalidValues];
      console.log(
        `CHECK (warehouse_mapping_type IN (${allValues
          .map((v) => `'${v}'`)
          .join(", ")}))`
      );
    } else {
      console.log("\n✅ All values are valid for current constraint");
    }
  } catch (error) {
    console.error("❌ Script error:", error);
  }
}

checkWarehouseMappingValues();
