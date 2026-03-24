import prisma from '../config/prisma.js';

async function listVariants() {
  const productId = 'e065866a-5c1a-4af5-b638-d809e0c08590'; // test
  const variants = await prisma.product_variants.findMany({
    where: { product_id: productId }
  });
  console.log('Variants for test:', JSON.stringify(variants, null, 2));
}

listVariants();
