import prisma from './config/prisma.js';

async function clearZones() {
    try {
        console.log('Starting to clear zone data...');

        // Delete all zone_pincodes first (child records)
        const deletedPincodes = await prisma.zone_pincodes.deleteMany({});
        console.log(`✅ Deleted ${deletedPincodes.count} zone pincodes`);

        // Delete all warehouse_zones (references delivery_zones)
        const deletedWarehouseZones = await prisma.warehouse_zones.deleteMany({});
        console.log(`✅ Deleted ${deletedWarehouseZones.count} warehouse zone mappings`);

        // Delete all delivery_zones (parent records)
        const deletedZones = await prisma.delivery_zones.deleteMany({});
        console.log(`✅ Deleted ${deletedZones.count} delivery zones`);

        console.log('\n🎉 All zone-related data cleared successfully!');

    } catch (error) {
        console.error('❌ Error clearing zones:', error);
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

clearZones();
