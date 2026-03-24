import prisma from '../config/prisma.js';
import sellerDao from '../dao/seller.dao.js';
import productWarehouseStockDao from '../dao/product-warehouse-stock.dao.js';
import warehousePincodeDao from '../dao/warehouse-pincode.dao.js';
import zonePincodeDao from '../dao/zone-pincode.dao.js';
import deliveryZoneDao from '../dao/delivery-zone.dao.js';

async function simulate() {
  const pincode = '700129';
  const productId = 'e065866a-5c1a-4af5-b638-d809e0c08590'; // test
  const variantId = 'bc6ea113-a6e9-4a36-881d-42bf4a4d1a09'; // Test2
  const quantity = 2;

  console.log('--- Step 1: Fetching Mappings ---');
  const divisionWarehouseResults = await warehousePincodeDao.getByPincode(pincode);
  const zonePincodeResults = await zonePincodeDao.getByPincode(pincode);

  const divisionWarehouse = divisionWarehouseResults && divisionWarehouseResults.length > 0 ? divisionWarehouseResults[0] : null;
  const zonePincode = zonePincodeResults && zonePincodeResults.length > 0 ? zonePincodeResults[0] : null;

  console.log('Division Warehouse:', JSON.stringify(divisionWarehouse, null, 2));
  console.log('Zone Pincode:', JSON.stringify(zonePincode, null, 2));

  let availabilityInfo = null;

  console.log('\n--- Step 2: Checking Seller ---');
  if (divisionWarehouse) {
    const bestSeller = await sellerDao.getFirstAvailableSeller(productId, variantId, divisionWarehouse.warehouse_id, quantity);
    console.log('Best Seller found:', JSON.stringify(bestSeller, null, 2));
    if (bestSeller && bestSeller.is_open !== false) {
      availabilityInfo = { level: 'seller', data: bestSeller };
    }
  }

  if (!availabilityInfo) {
    console.log('\n--- Step 3: Checking Division Warehouse ---');
    if (divisionWarehouse) {
      const divisionStock = await productWarehouseStockDao.getByVariantAndWarehouse(variantId, divisionWarehouse.warehouse_id);
      console.log('Division Stock:', JSON.stringify(divisionStock, null, 2));
      const availableQty = divisionStock ? divisionStock.stock_quantity - (divisionStock.reserved_quantity || 0) : 0;
      if (availableQty >= quantity) {
        availabilityInfo = { level: 'division', data: divisionStock };
      }
    }
  }

  if (!availabilityInfo) {
    console.log('\n--- Step 4: Checking Zonal Warehouse ---');
    if (zonePincode) {
      const zonalWarehouses = await deliveryZoneDao.getZonalWarehouses(zonePincode.zone_id);
      console.log('Zonal Warehouses count:', zonalWarehouses.length);
      for (const zw of zonalWarehouses) {
        const zonalStock = await productWarehouseStockDao.getByVariantAndWarehouse(variantId, zw.id);
        console.log(`Stock in Zonal Warehouse ${zw.id}:`, JSON.stringify(zonalStock, null, 2));
        const availableQty = zonalStock ? zonalStock.stock_quantity - (zonalStock.reserved_quantity || 0) : 0;
        if (availableQty >= quantity) {
          availabilityInfo = { level: 'zonal', data: zonalStock, warehouse: zw };
          break;
        }
      }
    }
  }

  console.log('\n--- Final Result ---');
  console.log(JSON.stringify(availabilityInfo, null, 2));
}

simulate();
