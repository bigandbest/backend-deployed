import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vjveipltkwxnndrencbf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdmVpcGx0a3d4bm5kcmVuY2JmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI3MTcwNiwiZXhwIjoyMDcwODQ3NzA2fQ.v0XAEeHHQQmWIQpTIokJRvOjH1dtySeDPtMqUMXMW8g';

export const supabase = createClient(supabaseUrl, supabaseKey);