import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const users = await prisma.users.findMany({
            where: { email: 'aayushtest@gmail.com' },
            include: { seller_profile: true }
        });

        console.log('--- User & Seller Info ---');
        console.log(JSON.stringify(users, null, 2));

        if (users.length > 0 && users[0].seller_profile) {
            const sellerId = users[0].seller_profile.id;
            const requests = await prisma.seller_pincode_requests.findMany({
                where: { seller_id: sellerId }
            });
            console.log('\n--- Pincode Requests ---');
            console.log(JSON.stringify(requests, null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
