// add_sections.js - Script to add missing homepage sections to the database
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sectionsToAdd = [
    {
        section_key: 'dual_deals_left',
        section_name: 'Dual Deals - Best Selling (Left)',
        is_active: true,
        display_order: 20,
        component_name: 'DualDeals',
        description: 'Left panel of Dual Deals section - displays subcategories from mapped category'
    },
    {
        section_key: 'dual_deals_right',
        section_name: 'Dual Deals - Trending (Right)',
        is_active: true,
        display_order: 21,
        component_name: 'DualDeals',
        description: 'Right panel of Dual Deals section - displays subcategories from mapped category'
    },
    {
        section_key: 'discount_corner_left',
        section_name: 'Discount Corner - Left Panel',
        is_active: true,
        display_order: 22,
        component_name: 'DiscountCorner',
        description: 'Left panel of Discount Corner section - displays subcategories from mapped category'
    },
    {
        section_key: 'discount_corner_right',
        section_name: 'Discount Corner - Right Panel',
        is_active: true,
        display_order: 23,
        component_name: 'DiscountCorner',
        description: 'Right panel of Discount Corner section - displays subcategories from mapped category'
    }
];

async function addSections() {
    console.log('Starting to add sections...\n');

    for (const section of sectionsToAdd) {
        try {
            // Check if section already exists
            const { data: existing, error: checkError } = await supabase
                .from('store_sections')
                .select('*')
                .eq('section_key', section.section_key)
                .single();

            if (existing) {
                console.log(`✓ Section '${section.section_key}' already exists (ID: ${existing.id})`);
                continue;
            }

            // Insert new section
            const { data, error } = await supabase
                .from('store_sections')
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

    console.log('\n✅ Section addition complete!');
    console.log('You can now use the admin panel to map categories to these sections.');
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
