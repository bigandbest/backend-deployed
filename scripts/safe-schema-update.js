import prisma from '../config/prisma.js';

async function safeUpdate() {
    console.log('🛡️  Running safe schema update...');

    try {
        // Check if columns exist and add them if they don't
        const columns = [
            'handling_charge',
            'surge_charge',
            'platform_charge'
        ];

        for (const col of columns) {
            try {
                await prisma.$executeRawUnsafe(`
          DO $$ 
          BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='${col}') THEN 
              ALTER TABLE "orders" ADD COLUMN "${col}" DECIMAL DEFAULT 0; 
              RAISE NOTICE 'Added column %', '${col}';
            ELSE
              RAISE NOTICE 'Column % already exists', '${col}';
            END IF; 
          END 
          $$;
        `);
                console.log(`✅ Verified/Added column: ${col}`);
            } catch (colError) {
                console.error(`❌ Error adding column ${col}:`, colError.message);
            }
        }

        console.log('✅ Safe update completed.');
    } catch (err) {
        console.error('❌ Update failed:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

safeUpdate();
