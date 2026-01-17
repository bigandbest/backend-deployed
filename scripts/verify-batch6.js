import quickPickDao from '../dao/quick-pick.dao.js';
import quickPickGroupDao from '../dao/quick-pick-group.dao.js';
import quickPickGroupProductDao from '../dao/quickpick-group-product.dao.js';

async function verifyBatch6() {
    console.log('--- Verifying Batch 6 DAOs ---');

    try {
        console.log('1. Testing quickPickDao.list...');
        const quickPicks = await quickPickDao.list();
        console.log(`   Success: Found ${quickPicks.length} quick picks.`);

        console.log('2. Testing quickPickGroupDao.listAll...');
        const groups = await quickPickGroupDao.listAll();
        console.log(`   Success: Found ${groups.length} groups.`);

        if (groups.length > 0) {
            console.log('3. Testing quickPickGroupProductDao.listProductsByGroup...');
            const products = await quickPickGroupProductDao.listProductsByGroup(groups[0].id);
            console.log(`   Success: Found ${products.length} products in group ${groups[0].name}.`);
        }

        console.log('--- Batch 6 DAO Verification Complete ---');
    } catch (error) {
        console.error('!!! Batch 6 Verification Failed !!!');
        console.error(error);
    } finally {
        process.exit(0);
    }
}

verifyBatch6();
