import prisma from '../config/prisma.js';

async function forceZonal() {
  const productId = 'e065866a-5c1a-4af5-b638-d809e0c08590'; // test
  const variantId = 'bc6ea113-a6e9-4a36-881d-42bf4a4d1a09'; // Test2

  // 1. Clear seller stock for this product
  await prisma.seller_products.updateMany({
    where: { product_id: productId },
    data: { stock_quantity: 0 }
  });

  // 2. Clear division stock for this product
  await prisma.product_warehouse_stock.updateMany({
    where: { product_id: productId, warehouse_id: 2 },
    data: { stock_quantity: 0 }
  });

  // 3. Ensure zonal stock is high
  await prisma.product_warehouse_stock.updateMany({
    where: { product_id: productId, warehouse_id: 1 },
    data: { stock_quantity: 200 }
  });

  console.log('Forced Zonal fallback for test product.');
}

forceZonal();
