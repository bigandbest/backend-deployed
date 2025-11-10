// Check current constraints on products table
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vjveipltkwxnndrencbf.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdmVpcGx0a3d4bm5kcmVuY2JmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI3MTcwNiwiZXhwIjoyMDcwODQ3NzA2fQ.v0XAEeHHQQmWIQpTIokJRvOjH1dtySeDPtMqUMXMW8g";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConstraints() {
  try {
    console.log("🔍 Checking constraints on products table...");

    // Check if warehouse_mapping_type column exists
    const { data: columns, error: columnError } = await supabase.rpc("sql", {
      query: `
                    SELECT column_name, data_type, column_default, is_nullable 
                    FROM information_schema.columns 
                    WHERE table_name = 'products' 
                    AND column_name IN ('warehouse_mapping_type', 'updated_at')
                    ORDER BY column_name;
                `,
    });

    if (columnError) {
      console.error("❌ Error checking columns:", columnError);
    } else {
      console.log("📊 Warehouse-related columns in products table:");
      columns.forEach((col) => {
        console.log(
          `   - ${col.column_name}: ${col.data_type} (default: ${col.column_default}, nullable: ${col.is_nullable})`
        );
      });
    }

    // Check constraints
    const { data: constraints, error: constraintError } = await supabase.rpc(
      "sql",
      {
        query: `
                    SELECT 
                        conname as constraint_name,
                        contype as constraint_type,
                        pg_get_constraintdef(oid) as constraint_definition
                    FROM pg_constraint 
                    WHERE conrelid = 'products'::regclass
                    AND conname LIKE '%warehouse%'
                    ORDER BY conname;
                `,
      }
    );

    if (constraintError) {
      console.error("❌ Error checking constraints:", constraintError);
    } else {
      console.log("\n🔒 Warehouse-related constraints:");
      if (constraints.length === 0) {
        console.log("   - No warehouse-related constraints found");
      } else {
        constraints.forEach((constraint) => {
          console.log(
            `   - ${constraint.constraint_name}: ${constraint.constraint_definition}`
          );
        });
      }
    }
  } catch (error) {
    console.error("❌ Script error:", error);
  }
}

checkConstraints();
