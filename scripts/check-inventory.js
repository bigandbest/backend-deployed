import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkInventory() {
    try {
        console.log('🔍 Checking product_warehouse_stock table...\n');

        // Check total records
        const total = await prisma.product_warehouse_stock.count();
        console.log(`Total records in product_warehouse_stock: ${total}`);

        // Check active records
        const activeTotal = await prisma.product_warehouse_stock.count({
            where: { is_active: true }
        });
        console.log(`Active records: ${activeTotal}`);

        // Check records for warehouse 1
        const warehouse1Records = await prisma.product_warehouse_stock.count({
            where: { warehouse_id: 1, is_active: true }
        });
        console.log(`Active records for warehouse_id=1: ${warehouse1Records}\n`);

        // Get sample records
        const sampleRecords = await prisma.product_warehouse_stock.findMany({
            take: 5,
            include: {
                products: {
                    select: { id: true, name: true }
                },
                product_variants: {
                    select: { id: true, title: true }
                }
            }
        });

        console.log('Sample records:');
        sampleRecords.forEach((record, idx) => {
            console.log(`\n${idx + 1}. ID: ${record.id}`);
            console.log(`   Product: ${record.products?.name || 'N/A'}`);
            console.log(`   Variant: ${record.product_variants?.title || 'N/A'}`);
            console.log(`   Warehouse ID: ${record.warehouse_id}`);
            console.log(`   Stock: ${record.stock_quantity}`);
            console.log(`   Active: ${record.is_active}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkInventory();
