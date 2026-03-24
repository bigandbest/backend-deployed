import prisma from '../config/prisma.js';

async function fetchTestData() {
  const products = await prisma.products.findMany({
    take: 1,
    include: {
      variants: true,
      product_warehouse_stock: true
    }
  });

  console.log(JSON.stringify(products, null, 2));
}

fetchTestData();
