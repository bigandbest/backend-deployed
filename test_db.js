import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const warehouses = await prisma.warehouses.findMany();
    console.log(JSON.stringify(warehouses.map(w => ({ id: w.id, name: w.name, type: w.type })), null, 2));
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
