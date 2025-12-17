import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vjveipltkwxnndrencbf.supabase.co';
// This is the service role key - it has elevated privileges and bypasses RLS
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdmVpcGx0a3d4bm5kcmVuY2JmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI3MTcwNiwiZXhwIjoyMDcwODQ3NzA2fQ.v0XAEeHHQQmWIQpTIokJRvOjH1dtySeDPtMqUMXMW8g';
// Anon key for JWT verification
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdmVpcGx0a3d4bm5kcmVuY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzE3MDYsImV4cCI6MjA3MDg0NzcwNn0.tYNE_qJEy0VZvPqHCOmLqEKNlYMfQJLqwCPYWOyKJQo';

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

// Create Supabase client with anon key for JWT verification
// This client is used to verify user JWT tokens
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});