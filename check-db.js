import { supabase } from './config/supabaseClient.js';

async function checkPincode() {
    console.log('Checking pincode 201318 in database...\n');

    // Check warehouse_pincodes
    const { data: pincodes, error: pincodeError } = await supabase
        .from('warehouse_pincodes')
        .select(`
            pincode,
            delivery_days,
            is_active,
            warehouses (
                id,
                name,
                type,
                is_active
            )
        `)
        .eq('pincode', '201318');

    if (pincodeError) {
        console.error('Error:', pincodeError);
    } else {
        console.log('Pincode 201318 entries:', JSON.stringify(pincodes, null, 2));
    }

    // Check all warehouses
    const { data: warehouses, error: warehouseError } = await supabase
        .from('warehouses')
        .select('id, name, type, is_active');

    if (warehouseError) {
        console.error('Error:', warehouseError);
    } else {
        console.log('\nAll warehouses:', JSON.stringify(warehouses, null, 2));
    }

    // Check inventory for the product
    const { data: inventory, error: invError } = await supabase
        .from('inventory')
        .select(`
            variant_id,
            warehouse_id,
            stock_qty,
            reserved_qty,
            product_variants (
                product_id
            )
        `)
        .eq('product_variants.product_id', '96baaa1d-52da-424b-950e-c0950c40a2a2');

    if (invError) {
        console.error('Error:', invError);
    } else {
        console.log('\nInventory for product:', JSON.stringify(inventory, null, 2));
    }

    process.exit(0);
}

checkPincode();
