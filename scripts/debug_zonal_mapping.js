import prisma from '../config/prisma.js';

async function debugZonalMapping() {
  const pincode = '700129';
  const productId = 'e065866a-5c1a-4af5-b638-d809e0c08590'; // test

  // 1. Find zone for pincode
  const zonePincodes = await prisma.zone_pincodes.findMany({
    where: { pincode, is_active: true }
  });
  console.log('Zones for pincode:', JSON.stringify(zonePincodes, null, 2));

  if (zonePincodes.length > 0) {
    for (const zp of zonePincodes) {
      // 2. Find zonal warehouses for this zone
      const warehouseZones = await prisma.warehouse_zones.findMany({
        where: { zone_id: zp.zone_id, is_active: true },
        include: { warehouses: true }
      });
      console.log(`Zonal Warehouses for Zone ${zp.zone_id}:`, JSON.stringify(warehouseZones, null, 2));

      for (const wz of warehouseZones) {
        // 3. Check stock for product in these warehouses
        const stock = await prisma.product_warehouse_stock.findMany({
          where: { product_id: productId, warehouse_id: wz.warehouse_id }
        });
        console.log(`Stock in Zonal Warehouse ${wz.warehouse_id}:`, JSON.stringify(stock, null, 2));
      }
    }
  }
}

debugZonalMapping();
