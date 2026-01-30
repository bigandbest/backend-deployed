
import prisma from '../config/prisma.js';

async function verifyModels() {
    console.log('Verifying Prisma Models...');

    if (!prisma) {
        console.error('Prisma client is undefined!');
        process.exit(1);
    }

    const models = Object.keys(prisma);
    console.log('Available keys on prisma instance:', models);

    if (prisma.return_orders) {
        console.log('✅ prisma.return_orders is defined.');
        try {
            const count = await prisma.return_orders.count();
            console.log(`✅ Connection working. Count: ${count}`);
        } catch (err) {
            console.error('❌ Error querying return_orders:', err.message);
        }
    } else {
        console.error('❌ prisma.return_orders is UNDEFINED.');
        // Check for potential casing issues or mapping names
        const likelyCandidates = models.filter(key => key.toLowerCase().includes('return'));
        console.log('Did you mean one of these?', likelyCandidates);
    }

    // Also check order_items relation
    if (prisma.order_items) {
        console.log('✅ prisma.order_items is defined.');
    }

    process.exit(0);
}

verifyModels();
