import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vjveipltkwxnndrencbf.supabase.co';
// This is the service role key - it has elevated privileges and bypasses RLS
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdmVpcGx0a3d4bm5kcmVuY2JmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI3MTcwNiwiZXhwIjoyMDcwODQ3NzA2fQ.v0XAEeHHQQmWIQpTIokJRvOjH1dtySeDPtMqUMXMW8g';

// Create Supabase client with service role key
// Service role bypasses Row Level Security (RLS) policies
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  }
});