import prisma from '../config/prisma.js';

async function debugZucchini() {
  const productId = '747d52fa-fc40-4db9-bc80-e978dac2e788';
  const warehouseId = 2;

  const sellerProducts = await prisma.seller_products.findMany({
    where: {
      product_id: productId,
      warehouse_id: warehouseId
    },
    include: {
        sellers: true
    }
  });

  console.log('Seller Products for Zucchini:', JSON.stringify(sellerProducts, null, 2));
}

debugZucchini();
