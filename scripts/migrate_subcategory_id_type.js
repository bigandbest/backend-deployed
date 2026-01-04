import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log('Starting migration to fix subcategory_id column type...');

    try {
        // Step 1: Truncate existing mappings
        console.log('Step 1: Clearing existing mappings...');
        const { error: truncateError } = await supabase
            .from('section_subcategory_mappings')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

        if (truncateError) {
            console.error('Error truncating table:', truncateError);
            throw truncateError;
        }
        console.log('✓ Existing mappings cleared');

        // Step 2: Alter column type using raw SQL
        console.log('Step 2: Altering column type to UUID...');
        const { error: alterError } = await supabase.rpc('exec_sql', {
            sql: `ALTER TABLE section_subcategory_mappings ALTER COLUMN subcategory_id TYPE UUID USING subcategory_id::text::uuid;`
        });

        if (alterError) {
            console.error('Error altering column (trying alternative method):', alterError);
            // Alternative: Drop and recreate the column
            console.log('Trying alternative method: Drop and recreate column...');
            const { error: dropError } = await supabase.rpc('exec_sql', {
                sql: `
          ALTER TABLE section_subcategory_mappings DROP COLUMN subcategory_id;
          ALTER TABLE section_subcategory_mappings ADD COLUMN subcategory_id UUID NOT NULL;
        `
            });

            if (dropError) {
                console.error('Alternative method also failed:', dropError);
                console.log('\n⚠️  MANUAL ACTION REQUIRED:');
                console.log('Please run the following SQL manually in Supabase SQL Editor:');
                console.log('---');
                const sqlContent = fs.readFileSync(path.join(__dirname, '../database/fix_subcategory_id_type.sql'), 'utf8');
                console.log(sqlContent);
                console.log('---');
                process.exit(1);
            }
        }
        console.log('✓ Column type altered to UUID');

        console.log('\n✅ Migration completed successfully!');
        console.log('You can now save section mappings from the admin panel.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
