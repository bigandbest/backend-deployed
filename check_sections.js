import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStatus() {
    console.log('Checking migration status and mappings...\n');

    // Check if migration was run (column type should be UUID)
    const { data: mappings, error } = await supabase
        .from('section_subcategory_mappings')
        .select('*')
        .limit(5);

    if (error) {
        console.error('❌ Error querying mappings:', error);
        console.log('\n⚠️  This likely means the SQL migration has NOT been run yet.');
        console.log('Please run the SQL in Supabase SQL Editor as shown in walkthrough.md');
    } else {
        console.log('✅ Table is accessible');
        console.log(`Found ${mappings.length} mapping(s):\n`, mappings);

        if (mappings.length === 0) {
            console.log('\n⚠️  No mappings found. Please:');
            console.log('1. Go to Admin Panel → Categories → Section Mappings');
            console.log('2. Select subcategories for Price Zone and Shop By Category');
            console.log('3. Click "Save Mappings"');
        }
    }

    // Check sections
    const { data: sections } = await supabase
        .from('product_sections')
        .select('id, section_key, section_name')
        .in('section_key', ['price_zone', 'shop_by_category']);

    console.log('\n📋 Sections:', sections);

    // Test API endpoint
    console.log('\n🔍 Testing API endpoint...');
    try {
        const response = await fetch('http://localhost:8000/api/categories/section/price_zone/subcategories');
        const data = await response.json();
        console.log('API Response:', data);
    } catch (err) {
        console.error('API Error:', err.message);
    }
}

checkStatus();
