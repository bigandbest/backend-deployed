import prisma from './config/prisma.js';

async function main() {
  try {
    const statuses = await prisma.seller_products.findMany({
      select: { status: true },
      distinct: ['status'],
    });
    console.log('Distinct statuses in seller_products:', JSON.stringify(statuses, null, 2));
    
    // Check for the specific variant in the screenshot if possible
    // The screenshot shows "test" product, "Test2" variant.
    const sample = await prisma.seller_products.findMany({
      where: { 
        stock_quantity: { gt: 0 },
        product_variants: {
          title: { contains: 'Test2', mode: 'insensitive' }
        }
      },
      select: { 
        id: true, 
        status: true, 
        is_active: true, 
        stock_quantity: true, 
        variant_id: true,
        product_variants: { select: { title: true } }
      }
    });
    console.log('Sample seller products matching "Test2":', JSON.stringify(sample, null, 2));

    const allWithStock = await prisma.seller_products.findMany({
      where: { stock_quantity: { gt: 0 } },
      take: 5,
      select: { id: true, status: true, is_active: true, stock_quantity: true, variant_id: true }
    });
    console.log('Other sample seller products with stock:', JSON.stringify(allWithStock, null, 2));

  } catch (err) {
    console.error('Error running diagnostic:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
