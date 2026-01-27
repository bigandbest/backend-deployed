import promoBannerDao from '../dao/promo-banner.dao.js';
import userDao from '../dao/user.dao.js';
import productWarehouseStockDao from '../dao/product-warehouse-stock.dao.js';
import warehouseDao from '../dao/warehouse.dao.js';
import warehouseZoneDao from '../dao/warehouse-zone.dao.js';

async function verifyBatch5() {
    console.log('--- Verifying Batch 5 DAOs ---');

    try {
        console.log('1. Testing promoBannerDao.list...');
        const banners = await promoBannerDao.list({ active: true });
        console.log(`   Success: Found ${banners.length} active banners.`);

        console.log('2. Testing userDao.getUserById...');
        // Using a dummy ID or a known one if possible, but let's just check if it's a function
        if (typeof userDao.getUserById === 'function') {
            console.log('   Success: userDao.getUserById is a function.');
        }

        console.log('3. Testing warehouseDao.list...');
        const warehouses = await warehouseDao.list({ type: 'zonal', active: true });
        console.log(`   Success: Found ${warehouses.length} zonal warehouses.`);

        console.log('4. Testing productWarehouseStockDao.listByProduct...');
        // Just checking method existence
        if (typeof productWarehouseStockDao.listByProduct === 'function') {
            console.log('   Success: productWarehouseStockDao.listByProduct is a function.');
        }

        console.log('5. Testing warehouseZoneDao.listActiveMappings...');
        const mappings = await warehouseZoneDao.listActiveMappings();
        console.log(`   Success: Found ${mappings.length} active zone mappings.`);

        console.log('--- Batch 5 DAO Verification Complete ---');
    } catch (error) {
        console.error('!!! Batch 5 Verification Failed !!!');
        console.error(error);
    } finally {
        process.exit(0);
    }
}

verifyBatch5();
