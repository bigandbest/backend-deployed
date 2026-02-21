/**
 * Seed Products from Excel Template
 * 
 * Reads product_import_template.xlsx and inserts products into the database
 * with their categories, subcategories, groups, brands, stores, variants,
 * and warehouse stock records.
 * 
 * Usage: node scripts/seed-products-from-excel.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// ── Column indices mapping ──────────────────────────────────────────────
const COL = {
    PRODUCT_NAME: 0,
    DESCRIPTION: 1,
    CATEGORY_NAME: 2,
    SUBCATEGORY_NAME: 3,
    GROUP_NAME: 4,
    BRAND_NAME: 5,
    STORE_NAME: 6,
    VERTICAL: 7,
    HSN_CODE: 8,
    GST_RATE: 9,
    VARIANT_SKU: 10,
    VARIANT_TITLE: 11,
    VARIANT_PRICE: 12,
    OLD_PRICE: 13,  // unlabeled column in Excel
    VARIANT_PACKAGING: 14,
    STOCK_QUANTITY: 15,
    WAREHOUSE_ID: 16,
};

// ── Helpers ─────────────────────────────────────────────────────────────
function slugify(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateSku(productName, index) {
    const slug = slugify(productName).substring(0, 30);
    return `BBM-${slug}-${index}`;
}

function computeDiscount(price, oldPrice) {
    if (!oldPrice || oldPrice <= price) return 0;
    return Math.round(((oldPrice - price) / oldPrice) * 100);
}

// ── Lookup caches ───────────────────────────────────────────────────────
const cache = {
    categories: {},      // name -> id
    subcategories: {},   // "catId|name" -> id
    groups: {},          // "subcatId|name" -> id
    brands: {},          // name -> id
    stores: {},          // name -> id
};

async function findOrCreateCategory(name) {
    if (cache.categories[name]) return cache.categories[name];

    // Exact match first, then fuzzy (trim + case-insensitive) to handle trailing spaces in DB
    let record = await prisma.categories.findFirst({ where: { name } });
    if (!record) {
        const all = await prisma.categories.findMany();
        record = all.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    }
    if (!record) {
        record = await prisma.categories.create({ data: { name, active: true } });
        console.log(`  ✅ Created category: "${name}"`);
    } else {
        console.log(`  🔗 Found existing category: "${record.name}" (id: ${record.id})`);
    }
    cache.categories[name] = record.id;
    return record.id;
}

async function findOrCreateSubcategory(name, categoryId) {
    const key = `${categoryId}|${name}`;
    if (cache.subcategories[key]) return cache.subcategories[key];

    let record = await prisma.subcategories.findFirst({
        where: { name, category_id: categoryId },
    });
    if (!record) {
        // Fuzzy: check all subcategories under this category
        const all = await prisma.subcategories.findMany({ where: { category_id: categoryId } });
        record = all.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    }
    if (!record) {
        record = await prisma.subcategories.create({
            data: { name, category_id: categoryId, active: true },
        });
        console.log(`  ✅ Created subcategory: "${name}"`);
    } else {
        console.log(`  🔗 Found existing subcategory: "${record.name}" (id: ${record.id})`);
    }
    cache.subcategories[key] = record.id;
    return record.id;
}

async function findOrCreateGroup(name, subcategoryId) {
    const key = `${subcategoryId}|${name}`;
    if (cache.groups[key]) return cache.groups[key];

    let record = await prisma.groups.findFirst({
        where: { name, subcategory_id: subcategoryId },
    });
    if (!record) {
        const all = await prisma.groups.findMany({ where: { subcategory_id: subcategoryId } });
        record = all.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    }
    if (!record) {
        record = await prisma.groups.create({
            data: { name, subcategory_id: subcategoryId, active: true },
        });
        console.log(`  ✅ Created group: "${name}"`);
    } else {
        console.log(`  🔗 Found existing group: "${record.name}" (id: ${record.id})`);
    }
    cache.groups[key] = record.id;
    return record.id;
}

async function findOrCreateBrand(name) {
    if (cache.brands[name]) return cache.brands[name];

    let record = await prisma.brand.findFirst({ where: { name } });
    if (!record) {
        const all = await prisma.brand.findMany();
        record = all.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    }
    if (!record) {
        record = await prisma.brand.create({ data: { name } });
        console.log(`  ✅ Created brand: "${name}"`);
    } else {
        console.log(`  🔗 Found existing brand: "${record.name}" (id: ${record.id})`);
    }
    cache.brands[name] = record.id;
    return record.id;
}

async function findOrCreateStore(name) {
    if (cache.stores[name]) return cache.stores[name];

    let record = await prisma.stores.findFirst({ where: { name } });
    if (!record) {
        const all = await prisma.stores.findMany();
        record = all.find(r => r.name && r.name.trim().toLowerCase() === name.trim().toLowerCase());
    }
    if (!record) {
        record = await prisma.stores.create({ data: { name } });
        console.log(`  ✅ Created store: "${name}"`);
    } else {
        console.log(`  🔗 Found existing store: "${record.name}" (id: ${record.id})`);
    }
    cache.stores[name] = record.id;
    return record.id;
}

// ── Main Seed Function ──────────────────────────────────────────────────
async function seedProducts() {
    const excelPath = path.resolve(__dirname, '..', 'product_import_template.xlsx');
    console.log(`\n📄 Reading Excel file: ${excelPath}\n`);

    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets['Products'];
    if (!sheet) {
        throw new Error('Sheet "Products" not found in the Excel file.');
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const dataRows = rows.slice(1).filter(row => row[COL.PRODUCT_NAME]); // skip header + empty rows

    console.log(`📦 Found ${dataRows.length} product rows to process.\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const productName = String(row[COL.PRODUCT_NAME]).trim();

        try {
            // ── Resolve lookup entities ─────────────────────────────────────
            const categoryName = row[COL.CATEGORY_NAME] ? String(row[COL.CATEGORY_NAME]).trim() : null;
            const subcategoryName = row[COL.SUBCATEGORY_NAME] ? String(row[COL.SUBCATEGORY_NAME]).trim() : null;
            const groupName = row[COL.GROUP_NAME] ? String(row[COL.GROUP_NAME]).trim() : null;
            const brandName = row[COL.BRAND_NAME] ? String(row[COL.BRAND_NAME]).trim() : null;
            const storeName = row[COL.STORE_NAME] ? String(row[COL.STORE_NAME]).trim() : null;

            let categoryId = null, subcategoryId = null, groupId = null, brandId = null, storeId = null;

            if (categoryName) {
                categoryId = await findOrCreateCategory(categoryName);
            }
            if (subcategoryName && categoryId) {
                subcategoryId = await findOrCreateSubcategory(subcategoryName, categoryId);
            }
            if (groupName && subcategoryId) {
                groupId = await findOrCreateGroup(groupName, subcategoryId);
            }
            if (brandName) {
                brandId = await findOrCreateBrand(brandName);
            }
            if (storeName) {
                storeId = await findOrCreateStore(storeName);
            }

            // ── Check if product already exists ──────────────────────────────
            const existing = await prisma.products.findFirst({
                where: {
                    name: productName,
                    ...(categoryId ? { category_id: categoryId } : {}),
                },
            });

            if (existing) {
                skipped++;
                continue;
            }

            // ── Prepare product data ────────────────────────────────────────
            const vertical = row[COL.VERTICAL] ? String(row[COL.VERTICAL]).trim() : 'qwik';
            const hsnCode = row[COL.HSN_CODE] != null ? String(row[COL.HSN_CODE]) : null;
            const gstRate = row[COL.GST_RATE] != null ? Number(row[COL.GST_RATE]) : 0;
            const description = row[COL.DESCRIPTION] ? String(row[COL.DESCRIPTION]).trim() : null;

            // ── Variant data ────────────────────────────────────────────────
            const variantSku = row[COL.VARIANT_SKU] ? String(row[COL.VARIANT_SKU]).trim() : generateSku(productName, i);
            const variantTitle = row[COL.VARIANT_TITLE] ? String(row[COL.VARIANT_TITLE]).trim() : productName;
            const variantPrice = row[COL.VARIANT_PRICE] != null ? Number(row[COL.VARIANT_PRICE]) : 0;
            const oldPrice = row[COL.OLD_PRICE] != null ? Number(row[COL.OLD_PRICE]) : null;
            const variantPackaging = row[COL.VARIANT_PACKAGING] ? String(row[COL.VARIANT_PACKAGING]).trim() : null;
            const stockQty = row[COL.STOCK_QUANTITY] != null ? Number(row[COL.STOCK_QUANTITY]) : 0;
            const warehouseId = row[COL.WAREHOUSE_ID] != null ? Number(row[COL.WAREHOUSE_ID]) : 0;
            const discount = computeDiscount(variantPrice, oldPrice);

            // ── Create product + variant + brand + stock in a transaction ──
            await prisma.$transaction(async (tx) => {
                // 1. Create the product
                const product = await tx.products.create({
                    data: {
                        name: productName,
                        description,
                        category_id: categoryId,
                        subcategory_id: subcategoryId,
                        group_id: groupId,
                        store_id: storeId,
                        vertical,
                        hsn_or_sac_code: hsnCode,
                        gst_rate: gstRate,
                        active: true,
                        has_variants: true,
                        created_by: 'admin',
                    },
                });

                // 2. Create the variant
                const variant = await tx.product_variants.create({
                    data: {
                        product_id: product.id,
                        sku: variantSku,
                        title: variantTitle,
                        price: variantPrice,
                        old_price: oldPrice,
                        discount_percentage: discount,
                        packaging_details: variantPackaging,
                        is_default: true,
                        active: true,
                    },
                });

                // 3. Link brand
                if (brandId) {
                    await tx.product_brand.create({
                        data: {
                            product_id: product.id,
                            brand_id: brandId,
                        },
                    });
                }

                // 4. Create warehouse stock (if warehouse ID > 0)
                if (warehouseId > 0) {
                    await tx.product_warehouse_stock.create({
                        data: {
                            product_id: product.id,
                            variant_id: variant.id,
                            warehouse_id: warehouseId,
                            stock_quantity: stockQty,
                        },
                    });
                }
            });

            created++;
            if ((created + skipped) % 50 === 0) {
                console.log(`  📊 Progress: ${created + skipped}/${dataRows.length} processed (${created} created, ${skipped} skipped)`);
            }

        } catch (err) {
            errors++;
            console.error(`  ❌ Error on row ${i + 2} ("${productName}"):`, err.message);
        }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 SEED SUMMARY');
    console.log('═'.repeat(60));
    console.log(`  ✅ Created:  ${created}`);
    console.log(`  ⏩ Skipped:  ${skipped} (already existed)`);
    console.log(`  ❌ Errors:   ${errors}`);
    console.log(`  📦 Total:    ${dataRows.length}`);
    console.log('═'.repeat(60) + '\n');
}

// ── Entry Point ─────────────────────────────────────────────────────────
seedProducts()
    .catch((err) => {
        console.error('Fatal error during seeding:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
