import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Successfully connected to Prisma Client.');
    // We can't query without a valid DB connection, but this proves the client is generated.
    // const val = await prisma.user.findMany({ take: 10 });
    // console.log(val);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
