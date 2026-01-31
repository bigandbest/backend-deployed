import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function findIdByName(modelName, name) {
    if (!name) return null;
    const result = await prisma[modelName].findFirst({
        where: {
            name: {
                equals: name,
                mode: 'insensitive',
            },
        },
        select: { id: true },
    });
    return result ? result.id : null;
}

const importProducts = async (filePath) => {
    console.log(`Reading file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error('File not found!');
        process.exit(1);
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    console.log(`Found ${data.length} rows to process.`);

    const results = {
        success: 0,
        failed: 0,
        errors: [],
    };

    for (const [index, row] of data.entries()) {
        const rowNumber = index + 2;
        console.log(`Processing row ${rowNumber}: ${row['Product Name']}`);

        try {
            // 1. Validation
            if (!row['Product Name']) throw new Error('Product Name is required');
            // Variant SKU is now optional, will generate if missing

            // 2. Resolve Relations
            const categoryId = await findIdByName('categories', row['Category Name']);
            if (!categoryId && row['Category Name']) throw new Error(`Category '${row['Category Name']}' not found`);

            // Optional relations
            const subcategoryId = row['Subcategory Name'] ? await findIdByName('subcategories', row['Subcategory Name']) : null;
            if (row['Subcategory Name'] && !subcategoryId) console.warn(`  Warning: Subcategory '${row['Subcategory Name']}' not found`);

            const groupId = row['Group Name'] ? await findIdByName('groups', row['Group Name']) : null;
            if (row['Group Name'] && !groupId) console.warn(`  Warning: Group '${row['Group Name']}' not found`);

            const brandId = await findIdByName('brand', row['Brand Name']);
            if (!brandId && row['Brand Name']) throw new Error(`Brand '${row['Brand Name']}' not found`);

            const storeId = await findIdByName('stores', row['Store Name']);
            if (!storeId && row['Store Name']) throw new Error(`Store '${row['Store Name']}' not found`);

            // 3. Transaction
            await prisma.$transaction(async (tx) => {
                // A. Find or Create Product
                let product = await tx.products.findFirst({
                    where: { name: { equals: row['Product Name'], mode: 'insensitive' } }
                });

                if (!product) {
                    product = await tx.products.create({
                        data: {
                            name: row['Product Name'],
                            description: row['Description'],
                            category_id: categoryId,
                            subcategory_id: subcategoryId,
                            group_id: groupId,
                            store_id: storeId,
                            vertical: row['Vertical'] || 'qwik',
                            hsn_or_sac_code: row['HSN Code'] ? String(row['HSN Code']) : undefined,
                            gst_rate: row['GST Rate'] ? parseFloat(row['GST Rate']) : 0,
                            has_variants: true,
                            active: true,
                        },
                    });

                    if (brandId) {
                        await tx.product_brand.create({
                            data: {
                                product_id: product.id,
                                brand_id: brandId,
                            },
                        });
                    }
                    console.log(`  Created Product: ${product.name}`);
                } else {
                    console.log(`  Found Existing Product: ${product.name}`);
                }

                // B. Check/Create Variant
                let sku = row['Variant SKU'] ? row['Variant SKU'].toString() : null;

                if (!sku) {
                    // Generate SKU if missing
                    // Logic: Name(3 chars)-Timestamp-Random
                    const namePartial = row['Product Name'].substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
                    sku = `${namePartial}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    console.log(`  Generated SKU: ${sku}`);
                }

                const existingVariant = await tx.product_variants.findUnique({
                    where: { sku: sku }
                });

                if (existingVariant) {
                    console.warn(`  Variant SKU '${sku}' already exists. Skipping variant creation.`);
                } else {
                    const variant = await tx.product_variants.create({
                        data: {
                            product_id: product.id,
                            sku: sku,
                            title: row['Variant Title'] || 'Default',
                            price: parseFloat(row['Variant Price']) || 0,
                            packaging_details: row['Variant Packaging'],
                            active: true,
                        }
                    });
                    console.log(`  Created Variant: ${variant.sku}`);

                    // C. Inventory - Auto-initialize for ALL active warehouses (0 stock)
                    // We don't take Warehouse ID from Excel anymore.

                    // Note: In transaction 'tx', we might not be able to access outer 'prisma' easily if not careful,
                    // but tx matches prisma client interface.
                    // We need to fetch warehouses first. ideally fetched outside loop for performance, but inside is safer for correctness.
                    const warehouses = await tx.warehouses.findMany({ // Assuming warehouses model exists
                        where: { is_active: true },
                        select: { id: true }
                    });

                    if (warehouses.length > 0) {
                        const inventoryRecords = warehouses.map(wh => ({
                            variant_id: variant.id,
                            warehouse_id: wh.id,
                            stock_qty: 0,
                            reserved_qty: 0
                        }));

                        await tx.inventory.createMany({
                            data: inventoryRecords,
                            skipDuplicates: true
                        });
                        console.log(`  Initialized inventory for ${inventoryRecords.length} warehouses`);
                    }
                }

                // D. Media (Skipped)
            });

            results.success++;
        } catch (error) {
            console.error(`  FAILED: ${error.message}`);
            results.failed++;
            results.errors.push({ row: rowNumber, error: error.message });
        }
    }

    console.log('\n--- Import Summary ---');
    console.log(`Total: ${data.length}`);
    console.log(`Success: ${results.success}`);
    console.log(`Failed: ${results.failed}`);

    if (results.errors.length > 0) {
        console.log('\nErrors:');
        results.errors.forEach(e => console.log(`Row ${e.row}: ${e.error}`));
    }
};

// CLI args
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scripts/import-products.js <path-to-excel-file>');
} else {
    importProducts(args[0])
        .catch(e => console.error(e))
        .finally(async () => {
            await prisma.$disconnect();
        });

}
