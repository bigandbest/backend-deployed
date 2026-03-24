import prisma from '../config/prisma.js';

async function clearAllStock() {
  const productId = '747d52fa-fc40-4db9-bc80-e978dac2e788'; // Zucchini
  const variantId = 'b7a8ae1e-a630-4f5b-9542-a38983cbd67d';

  // Clear seller stock
  await prisma.seller_products.updateMany({
    where: { product_id: productId },
    data: { stock_quantity: 0 }
  });

  // Clear warehouse stock
  await prisma.product_warehouse_stock.updateMany({
    where: { product_id: productId },
    data: { stock_quantity: 0 }
  });

  console.log('All stock cleared for Zucchini.');
}

clearAllStock();
