import prisma from '../config/prisma.js';

async function checkStock() {
  const productId = '02a58503-96fc-4ecd-8cfe-4876ca1eb17f';
  const variantId = '5cfe3625-e88f-4eb3-a605-a778f1940e17';
  const warehouseId = 2;

  const stock = await prisma.product_warehouse_stock.findMany({
    where: {
      product_id: productId,
      variant_id: variantId
    }
  });

  console.log('Stock in all warehouses:', JSON.stringify(stock, null, 2));

  const sellers = await prisma.seller_products.findMany({
    where: {
      product_id: productId,
      variant_id: variantId,
      warehouse_id: warehouseId
    },
    include: {
        sellers: true
    }
  });

  console.log('Sellers in warehouse 2:', JSON.stringify(sellers, null, 2));
}

checkStock();
