// Script to check enquiries in the database
import { supabase } from "../config/supabaseClient.js";

async function checkEnquiries() {
  console.log("🔍 Checking enquiries in database...\n");

  try {
    // Get all enquiries
    const { data: enquiries, error, count } = await supabase
      .from("product_enquiries")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("❌ Error fetching enquiries:", error);
      return;
    }

    console.log(`📊 Total enquiries in database: ${count || 0}\n`);

    if (!enquiries || enquiries.length === 0) {
      console.log("⚠️  No enquiries found in the database.");
      console.log("\nTo create a test enquiry, you can:");
      console.log("1. Use the frontend to create an enquiry");
      console.log("2. Or run the following SQL in Supabase:");
      console.log(`
INSERT INTO product_enquiries (user_id, product_id, quantity, message, status)
VALUES (
  '5f4028fb-952b-4b67-883d-71fa64af600b',
  (SELECT id FROM products LIMIT 1),
  10,
  'Test enquiry message',
  'OPEN'
);
      `);
      return;
    }

    console.log("📋 Recent enquiries:\n");
    enquiries.forEach((enquiry, index) => {
      console.log(`${index + 1}. Enquiry ID: ${enquiry.id}`);
      console.log(`   User ID: ${enquiry.user_id}`);
      console.log(`   Product ID: ${enquiry.product_id}`);
      console.log(`   Quantity: ${enquiry.quantity}`);
      console.log(`   Status: ${enquiry.status}`);
      console.log(`   Created: ${enquiry.created_at}`);
      console.log("");
    });

    console.log("\n✅ To view an enquiry, use one of the IDs above.");
    console.log(`   Example: http://localhost:8000/api/enquiries/${enquiries[0].id}?user_id=${enquiries[0].user_id}`);
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

checkEnquiries();
