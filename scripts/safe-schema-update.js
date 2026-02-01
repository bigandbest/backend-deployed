import prisma from '../config/prisma.js';

async function safeUpdate() {
    console.log('🚀 Starting safe schema update...');

    try {
        // 1. Add discount column to delivery_charge_milestones if it doesn't exist
        console.log('📦 Adding discount column to delivery_charge_milestones...');
        await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='delivery_charge_milestones' AND column_name='discount') THEN
          ALTER TABLE "delivery_charge_milestones" ADD COLUMN "discount" DECIMAL DEFAULT 0.00;
        END IF;
      END $$;
    `);
        console.log('✅ discount column checked/added.');

        // 2. Create wallet_audit_logs table if it doesn't exist
        console.log('📦 Creating wallet_audit_logs table...');
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "wallet_audit_logs" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "wallet_id" UUID NOT NULL,
        "admin_id" UUID NOT NULL,
        "action" VARCHAR NOT NULL,
        "old_data" JSONB,
        "new_data" JSONB,
        "description" TEXT,
        "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "wallet_audit_logs_pkey" PRIMARY KEY ("id")
      );
    `);

        // Add foreign keys if they don't exist
        await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                       WHERE constraint_name='wallet_audit_logs_wallet_id_fkey') THEN
          ALTER TABLE "wallet_audit_logs" ADD CONSTRAINT "wallet_audit_logs_wallet_id_fkey" 
          FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                       WHERE constraint_name='wallet_audit_logs_admin_id_fkey') THEN
          ALTER TABLE "wallet_audit_logs" ADD CONSTRAINT "wallet_audit_logs_admin_id_fkey" 
          FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
        console.log('✅ wallet_audit_logs table checked/created.');

        console.log('🎉 Safe update completed successfully!');
    } catch (error) {
        console.error('❌ Error during safe update:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

safeUpdate();
