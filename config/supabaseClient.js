import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - try multiple approaches for Vercel compatibility
try {
  dotenv.config({ path: path.resolve(__dirname, "../.env") });
} catch (error) {
  console.log("dotenv config failed, using process.env directly");
}

// Ensure we have the required environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase environment variables");
  console.error("SUPABASE_URL:", supabaseUrl ? "present" : "missing");
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY:",
    supabaseKey ? "present" : "missing"
  );
  throw new Error("Missing required Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };
