import { supabase } from "../config/supabaseClient.js";

async function debugProductAPI() {
  try {
    console.log("Debugging product API call...\n");

    const productId = "22f55628-1500-4a10-a0e0-981c2c468228";

    // Test 1: Check if product exists
    console.log("1. Checking if product exists:");
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (productError) {
      console.error("❌ Product query failed:", productError.message);
      console.error("Error code:", productError.code);
      console.error("Error details:", productError.details);
    } else {
      console.log("✅ Product found:", product?.name || "Unknown");
    }

    // Test 2: Check with basic select
    console.log("\n2. Testing basic product query:");
    const { data: basicProduct, error: basicError } = await supabase
      .from("products")
      .select("id, name, price")
      .eq("id", productId);

    if (basicError) {
      console.error("❌ Basic product query failed:", basicError.message);
    } else {
      console.log("✅ Basic product query successful");
      console.log("Results:", basicProduct);
    }

    // Test 3: Check if any products exist at all
    console.log("\n3. Testing if any products exist:");
    const { data: allProducts, error: allError } = await supabase
      .from("products")
      .select("id, name")
      .limit(5);

    if (allError) {
      console.error("❌ Products table query failed:", allError.message);
    } else {
      console.log("✅ Products table accessible");
      console.log(`Found ${allProducts?.length || 0} products`);
      if (allProducts?.length > 0) {
        console.log(
          "Sample products:",
          allProducts.map((p) => `${p.id} - ${p.name}`)
        );
      }
    }
  } catch (error) {
    console.error("Debug script failed:", error);
  }
}

debugProductAPI();
