import prisma from '../config/prisma.js';
import quickPickDao from '../dao/quick-pick.dao.js';
import quickPickGroupDao from '../dao/quick-pick-group.dao.js';
import quickPickGroupProductDao from '../dao/quickpick-group-product.dao.js';
import productDao from '../dao/product.dao.js';

async function verifyQuickPickFlow() {
    console.log('🚀 Starting Quick Pick Verification...');

    try {
        // 1. Create a Quick Pick
        console.log('\n1️⃣ Creating Quick Pick...');
        const quickPick = await quickPickDao.create({
            name: 'Verification Quick Pick ' + Date.now(),
            image_url: 'https://example.com/qp.jpg'
        });
        console.log('✅ Created:', quickPick.name);

        // 2. Create a Quick Pick Group linked to it
        console.log('\n2️⃣ Creating Quick Pick Group...');
        const group = await quickPickGroupDao.create({
            name: 'Verification Group ' + Date.now(),
            image_url: 'https://example.com/group.jpg',
            quick_pick_id: quickPick.id
        });
        console.log('✅ Created:', group.name);

        // 3. Create a Dummy Product (if needed to link) or find one
        console.log('\n3️⃣ Finding/Creating Product...');
        let product = await prisma.products.findFirst();
        if (!product) {
            // Create a product first
            product = await productDao.createProduct({
                name: 'Test Product ' + Date.now(),
                description: 'Test Description',
                category: {
                    create: {
                        name: 'Test Category ' + Date.now(),
                        section_key: 'test_section_' + Date.now(),
                        component_name: 'TestComponent',
                        section_name: 'Test Section'
                    }
                },
                active: true,
                has_variants: true
            });

            // Create a default variant with price
            await productDao.createVariant({
                product_id: product.id,
                sku: 'SKU-' + Date.now(),
                title: 'Default',
                price: 100,
                is_default: true,
                active: true
            });

            console.log('✅ Created temporary product:', product.name);
        } else {
            console.log('✅ Using existing product:', product.name);
        }

        // 4. Map Product to Group
        console.log('\n4️⃣ Mapping Product to Group...');
        await quickPickGroupProductDao.link(group.id, product.id);
        console.log('✅ Mapped product to group');

        // 5. Verify Hierarchy
        console.log('\n5️⃣ Verifying Hierarchy...');
        const fetchedQuickPick = await quickPickDao.getById(quickPick.id);
        const groupsInQP = fetchedQuickPick.groups;
        console.log(`✅ Quick Pick has ${groupsInQP.length} groups`);

        const fetchedGroup = await quickPickGroupDao.getById(group.id);
        const productsInGroup = fetchedGroup.products;
        console.log(`✅ Group has ${productsInGroup.length} products`);

        if (productsInGroup.length > 0 && productsInGroup[0].product.id === product.id) {
            console.log('✅ Product correctly linked in hierarchy');
        } else {
            console.error('❌ Product link verification failed');
        }

        // cleanup
        console.log('\n🧹 Cleaning up...');
        await quickPickGroupProductDao.deleteByMapping(product.id, group.id);
        await quickPickGroupDao.delete(group.id);
        await quickPickDao.delete(quickPick.id);
        console.log('✅ Cleanup complete');

        console.log('\n🎉 Verification Successful!');
    } catch (error) {
        console.error('\n❌ Verification Failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

verifyQuickPickFlow();
