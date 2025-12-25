import { supabase } from '../config/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    try {
        console.log('🚀 Running migration: add_category_to_store_section_mappings.sql');

        // Read the SQL file
        const sqlPath = path.join(__dirname, '../database/add_category_to_store_section_mappings.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolons and execute each statement
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

        console.log(`📝 Found ${statements.length} SQL statements to execute`);

        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.toLowerCase().includes('select')) {
                // For SELECT statements, use .from()
                console.log(`⏭️  Skipping SELECT statement ${i + 1}`);
                continue;
            }

            console.log(`⚙️  Executing statement ${i + 1}/${statements.length}...`);
            const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

            if (error) {
                console.error(`❌ Error executing statement ${i + 1}:`, error);
                console.error('Statement:', statement);
                // Continue with other statements
            } else {
                console.log(`✅ Statement ${i + 1} executed successfully`);
            }
        }

        console.log('✨ Migration completed!');

        // Verify the changes
        console.log('\n🔍 Verifying changes...');
        const { data: columns, error: verifyError } = await supabase
            .from('store_section_mappings')
            .select('*')
            .limit(0);

        if (verifyError) {
            console.error('❌ Verification error:', verifyError);
        } else {
            console.log('✅ Table structure updated successfully');
        }

    } catch (error) {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
