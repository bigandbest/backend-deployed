import { supabase } from "./config/supabaseClient.js";

const storeId = "488a5ec3-b5bf-43de-a9f9-e6047a81ee90";

async function checkRecommendedStore() {
  console.log("Checking recommended_store table for ID:", storeId);

  const { data, error } = await supabase
    .from("recommended_store")
    .select("id, name")
    .eq("id", storeId)
    .single();

  if (error) {
    console.error("Error asking 'recommended_store':", error.message);
  } else {
    console.log("Success recommended_store:", data);
  }
}

checkRecommendedStore();
