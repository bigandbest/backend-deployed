import prisma from '../config/prisma.js';

async function findStockedProduct() {
  const stock = await prisma.product_warehouse_stock.findFirst({
    where: {
      stock_quantity: {
        gt: 0
      }
    },
    include: {
        products: true,
        product_variants: true,
        warehouses: true
    }
  });

  if (stock) {
    console.log('Stocked Product:', JSON.stringify(stock, null, 2));
  } else {
    console.log('No stocked products found in product_warehouse_stock.');
  }

  // Also check seller_products
  const sellerProduct = await prisma.seller_products.findFirst({
    where: {
        stock_quantity: {
            gt: 0
        },
        status: 'APPROVED'
    },
    include: {
        products: true,
        product_variants: true,
        sellers: true
    }
  });

  if (sellerProduct) {
    console.log('Seller Stocked Product:', JSON.stringify(sellerProduct, null, 2));
  } else {
    console.log('No seller stocked products found.');
  }
}

findStockedProduct();
