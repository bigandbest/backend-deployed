// add_new_homepage_sections.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sectionsToAdd = [
    {
        section_key: 'top_products',
        section_name: 'Top Products',
        is_active: true,
        display_order: 20,
        component_name: 'TopProducts',
        description: 'Highly rated and best selling products'
    },
    {
        section_key: 'everyday_essentials',
        section_name: 'Everyday Essentials',
        is_active: true,
        display_order: 31,
        component_name: 'EverydayEssentials',
        description: 'Daily essential products for your home'
    }
];

async function addSections() {
    console.log('Starting to add new homepage sections...\n');

    for (const section of sectionsToAdd) {
        try {
            // Check if section already exists
            const { data: existing, error: checkError } = await supabase
                .from('product_sections')
                .select('*')
                .eq('section_key', section.section_key)
                .single();

            if (existing) {
                console.log(`✓ Section '${section.section_key}' already exists (ID: ${existing.id}). Updating...`);

                const { error: updateError } = await supabase
                    .from('product_sections')
                    .update({
                        section_name: section.section_name,
                        component_name: section.component_name,
                        description: section.description,
                        display_order: section.display_order,
                        is_active: section.is_active
                    })
                    .eq('id', existing.id);

                if (updateError) {
                    console.error(`✗ Error updating '${section.section_key}':`, updateError.message);
                } else {
                    console.log(`✓ Successfully updated '${section.section_key}'`);
                }
                continue;
            }

            // Insert new section
            const { data, error } = await supabase
                .from('product_sections')
                .insert([section])
                .select();

            if (error) {
                console.error(`✗ Error adding '${section.section_key}':`, error.message);
            } else {
                console.log(`✓ Successfully added '${section.section_key}' (ID: ${data[0].id})`);
            }
        } catch (err) {
            console.error(`✗ Unexpected error for '${section.section_key}':`, err.message);
        }
    }

    console.log('\n✅ Section addition/update complete!');
}

// Run the script
addSections()
    .then(() => {
        console.log('\nScript finished successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\nScript failed:', error);
        process.exit(1);
    });
