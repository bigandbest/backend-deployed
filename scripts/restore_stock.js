import prisma from '../config/prisma.js';

async function restoreStock() {
  const productId = 'e065866a-5c1a-4af5-b638-d809e0c08590'; // test
  const variantId = 'bc6ea113-a6e9-4a36-881d-42bf4a4d1a09';

  // Restore seller stock
  await prisma.seller_products.updateMany({
    where: { product_id: productId, variant_id: variantId, warehouse_id: 2 },
    data: { stock_quantity: 1000 }
  });

  console.log('Seller stock restored for test product.');
}

restoreStock();
