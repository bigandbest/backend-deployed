import prisma from '../config/prisma.js';

/**
 * Fix the foreign key constraint on zone_pincodes to enable CASCADE delete
 * This ensures when a delivery zone is deleted, all associated pincodes are automatically deleted
 */
async function fixZoneForeignKey() {
    try {
        console.log('🔧 Fixing zone_pincodes foreign key constraint...');

        // Drop existing constraint
        console.log('Dropping existing constraint...');
        await prisma.$executeRaw`
      ALTER TABLE zone_pincodes 
      DROP CONSTRAINT IF EXISTS zone_pincodes_zone_id_fkey
    `;

        // Recreate with ON DELETE CASCADE
        console.log('Creating new constraint with CASCADE delete...');
        await prisma.$executeRaw`
      ALTER TABLE zone_pincodes 
      ADD CONSTRAINT zone_pincodes_zone_id_fkey 
      FOREIGN KEY (zone_id) 
      REFERENCES delivery_zones(id) 
      ON DELETE CASCADE
    `;

        // Verify the constraint
        console.log('Verifying constraint...');
        const result = await prisma.$queryRaw`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'zone_pincodes' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'zone_id'
    `;

        console.log('✅ Constraint verification:', result);

        if (result.length > 0 && result[0].delete_rule === 'CASCADE') {
            console.log('✅ Foreign key constraint fixed successfully!');
            console.log('   Delete rule: CASCADE');
        } else {
            console.log('⚠️  Constraint created but verification failed');
            console.log('   Result:', result);
        }

    } catch (error) {
        console.error('❌ Error fixing foreign key constraint:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the fix
fixZoneForeignKey()
    .then(() => {
        console.log('✅ Migration completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    });
