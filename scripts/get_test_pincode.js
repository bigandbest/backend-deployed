import prisma from '../config/prisma.js';

async function fetchTestPincode() {
  const pincode = await prisma.warehouse_pincodes.findFirst({
    take: 1
  });

  console.log(JSON.stringify(pincode, null, 2));
}

fetchTestPincode();
