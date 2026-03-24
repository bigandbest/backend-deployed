import prisma from '../config/prisma.js';

async function checkAndMoveStock() {
  const productId = '747d52fa-fc40-4db9-bc80-e978dac2e788'; // Zucchini
  const variantId = 'b7a8ae1e-a630-4f5b-9542-a38983cbd67d';
  const divisionId = 2;
  const zonalId = 1;

  // 1. Check zonal stock
  let zonalStock = await prisma.product_warehouse_stock.findFirst({
    where: {
      product_id: productId,
      variant_id: variantId,
      warehouse_id: zonalId
    }
  });

  if (!zonalStock) {
    console.log('Creating zonal stock for testing...');
    zonalStock = await prisma.product_warehouse_stock.create({
      data: {
        product_id: productId,
        variant_id: variantId,
        warehouse_id: zonalId,
        stock_quantity: 100,
        is_active: true
      }
    });
  } else {
    await prisma.product_warehouse_stock.update({
        where: { id: zonalStock.id },
        data: { stock_quantity: 100 }
    });
  }

  // 2. Reduce division stock to 0
  await prisma.product_warehouse_stock.updateMany({
    where: {
      product_id: productId,
      variant_id: variantId,
      warehouse_id: divisionId
    },
    data: {
      stock_quantity: 0
    }
  });

  console.log('Zonal stock set to 100, Division stock reduced to 0 for Zucchini.');
}

checkAndMoveStock();
