import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
let supabaseAuth = null;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "⚠️ Supabase URL or Service Role Key missing in environment keys. Supabase Client will be null.",
  );
} else {
  // Create Supabase client with service role key
  // Service role bypasses Row Level Security (RLS) policies
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: "public",
    },
  });

  // Create Supabase client with anon key for JWT verification
  // This client is used to verify user JWT tokens
  supabaseAuth = createClient(supabaseUrl, supabaseAnonKey || "", {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export { supabase, supabaseAuth };
