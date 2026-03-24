import prisma from '../config/prisma.js';

async function reduceSellerStock() {
  const productId = '747d52fa-fc40-4db9-bc80-e978dac2e788'; // Zucchini
  const sellerId = '5ae2e028-552d-4e9a-9220-00d41d98af79';
  const warehouseId = 2;

  await prisma.seller_products.updateMany({
    where: {
      product_id: productId,
      seller_id: sellerId,
      warehouse_id: warehouseId
    },
    data: {
      stock_quantity: 0
    }
  });

  console.log('Seller stock reduced to 0 for Zucchini.');
}

reduceSellerStock();
