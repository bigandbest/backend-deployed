import prisma from '../config/prisma.js';

async function checkSchema() {
    try {
        const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'delivery_charge_milestones';
    `;
        console.log('Columns in delivery_charge_milestones:', JSON.stringify(columns, null, 2));

        const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'wallet_audit_logs';
    `;
        console.log('Wallet Audit Logs table exists:', tables.length > 0);

    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkSchema();
