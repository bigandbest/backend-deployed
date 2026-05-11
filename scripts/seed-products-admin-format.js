/**
 * seed-products-admin-format.js
 *
 * Reads products from the Excel file and seeds them into the DB.
 * All categories, subcategories, groups, and brands must already exist —
 * nothing new is created. Rows whose lookups don't match are skipped with a warning.
 *
 * Excel columns used:
 *   Product Name | Category Name | Subcategory Name | Group Name |
 *   Brand Name | Vertical | HSN Code | GST Rate |
 *   Variant SKU | Variant Title | Variant Price | __EMPTY (old price) |
 *   Variant Packaging | Stock Quantity | Warehouse ID
 *
 * Run: node scripts/seed-products-admin-format.js
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXCEL_FILE = path.join(__dirname, "..", "Copy of New Microsoft Excel Worksheet.xlsx");

// ---------------------------------------------------------------------------
// 1. LOOKUP HELPERS — match only, never create
// ---------------------------------------------------------------------------
const cache = {};

async function findCategory(name) {
    if (!name) return null;
    const key = `cat|${name.trim().toLowerCase()}`;
    if (cache[key] !== undefined) return cache[key];
    const all = await prisma.categories.findMany({ where: { active: true }, select: { id: true, name: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    cache[key] = found?.id ?? null;
    return cache[key];
}

async function findSubcategory(name, categoryId) {
    if (!name || !categoryId) return null;
    const key = `sub|${categoryId}|${name.trim().toLowerCase()}`;
    if (cache[key] !== undefined) return cache[key];
    const all = await prisma.subcategories.findMany({ where: { category_id: categoryId, active: true }, select: { id: true, name: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    cache[key] = found?.id ?? null;
    return cache[key];
}

async function findGroup(name, subcategoryId) {
    if (!name || !subcategoryId) return null;
    const key = `grp|${subcategoryId}|${name.trim().toLowerCase()}`;
    if (cache[key] !== undefined) return cache[key];
    const all = await prisma.groups.findMany({ where: { subcategory_id: subcategoryId }, select: { id: true, name: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    cache[key] = found?.id ?? null;
    return cache[key];
}

async function findBrand(name) {
    if (!name) return null;
    const key = `brand|${name.trim().toLowerCase()}`;
    if (cache[key] !== undefined) return cache[key];
    const all = await prisma.brand.findMany({ select: { id: true, name: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    cache[key] = found?.id ?? null;
    return cache[key];
}

// ---------------------------------------------------------------------------
// 2. READ EXCEL
// ---------------------------------------------------------------------------
function readExcel() {
    const wb = XLSX.readFile(EXCEL_FILE);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    console.log(`📄 Read ${rows.length} row(s) from "${sheetName}"\n`);
    return rows;
}

// ---------------------------------------------------------------------------
// 3. GROUP ROWS → PRODUCTS  (same product name = same product, extra variants)
// ---------------------------------------------------------------------------
function groupRowsIntoProducts(rows) {
    const productMap = new Map();

    rows.forEach((row) => {
        const name = (row["Product Name"] || "").toString().trim();
        if (!name) return;

        if (!productMap.has(name)) {
            productMap.set(name, {
                name,
                description: (row["Description"] || "").toString().trim(),
                category:    (row["Category Name"] || "").toString().trim(),
                subcategory: (row["Subcategory Name"] || "").toString().trim(),
                group:       (row["Group Name"] || "").toString().trim(),
                brand:       (row["Brand Name"] || "").toString().trim(),
                vertical:    (row["Vertical"] || "qwik").toString().trim().toLowerCase(),
                hsn_or_sac_code: (row["HSN Code"] || "").toString().trim(),
                gst_rate:    parseFloat(row["GST Rate"]) || 0,
                product_variants: [],
            });
        }

        const product = productMap.get(name);
        const variantTitle = (row["Variant Title"] || "").toString().trim();
        const variantPrice = parseFloat(row["Variant Price"]) || 0;

        if (variantTitle && variantPrice > 0) {
            const oldPrice = parseFloat(row["__EMPTY"]) || 0; // __EMPTY = old price column
            const sku      = (row["Variant SKU"] || "").toString().trim() || null;
            const stockQty = parseInt(row["Stock Quantity"]) || 0;
            const warehouseId = parseInt(row["Warehouse ID"]) || 0;

            product.product_variants.push({
                title:             variantTitle,
                sku,
                price:             variantPrice,
                old_price:         oldPrice > 0 ? oldPrice : null,
                discount_percentage: oldPrice > variantPrice
                    ? Math.round(((oldPrice - variantPrice) / oldPrice) * 100)
                    : 0,
                packaging_details: (row["Variant Packaging"] || "").toString().trim() || null,
                is_default:        product.product_variants.length === 0,
                active:            true,
                shipping_amount:   0,
                _initial_stock:    stockQty,
                _warehouse_id:     warehouseId > 0 ? warehouseId : null,
            });
        }
    });

    return Array.from(productMap.values());
}

// ---------------------------------------------------------------------------
// 4. SEED ONE PRODUCT
// ---------------------------------------------------------------------------
async function seedProduct(productDef) {
    const {
        name, description, vertical, hsn_or_sac_code, gst_rate,
        category: categoryName, subcategory: subcategoryName,
        group: groupName, brand: brandName, product_variants,
    } = productDef;

    // --- Resolve IDs (skip if any required lookup fails) ---
    const categoryId = await findCategory(categoryName);
    if (!categoryId) {
        console.warn(`  ⚠️  Skipping "${name}": category not found → "${categoryName}"`);
        return null;
    }

    const subcategoryId = subcategoryName ? await findSubcategory(subcategoryName, categoryId) : null;
    if (subcategoryName && !subcategoryId) {
        console.warn(`  ⚠️  Skipping "${name}": subcategory not found → "${subcategoryName}"`);
        return null;
    }

    const groupId = groupName && subcategoryId ? await findGroup(groupName, subcategoryId) : null;
    if (groupName && subcategoryId && !groupId) {
        console.warn(`  ⚠️  Skipping "${name}": group not found → "${groupName}"`);
        return null;
    }

    const brandId = brandName ? await findBrand(brandName) : null;
    if (brandName && !brandId) {
        console.warn(`  ⚠️  Brand not found for "${name}" → "${brandName}" (product will be created without brand)`);
    }

    const hasVariants = product_variants.length > 0;
    if (!hasVariants) {
        console.warn(`  ⚠️  Skipping "${name}": no variants found`);
        return null;
    }

    // --- Build product data ---
    const productData = {
        name,
        description: description || "",
        hsn_or_sac_code: hsn_or_sac_code || null,
        gst_rate:    parseFloat(gst_rate)  || 0,
        cess_rate:   0,
        vertical:    vertical || "qwik",
        active:      true,
        has_variants: hasVariants,
        return_applicable: false,
        return_days:  0,
        created_by:  "seed",
        source_type: "WAREHOUSE",
    };

    if (categoryId)   productData.category    = { connect: { id: categoryId } };
    if (subcategoryId) productData.subcategory = { connect: { id: subcategoryId } };
    if (groupId)      productData.group        = { connect: { id: groupId } };

    productData.variants = {
        create: product_variants.map((v) => ({
            title:               v.title,
            sku:                 v.sku || `${name.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            price:               parseFloat(v.price),
            old_price:           v.old_price ? parseFloat(v.old_price) : null,
            discount_percentage: parseInt(v.discount_percentage) || 0,
            is_default:          !!v.is_default,
            active:              true,
            shipping_amount:     0,
            packaging_details:   v.packaging_details || null,
            net_quantity:        null,
            photo_url:           null,
            is_bulk_enabled:     false,
            bulk_min_quantity:   50,
            bulk_discount_percentage: 0,
            bulk_price:          0,
            updated_at:          new Date(),
        })),
    };

    // --- Create product ---
    const newProduct = await prisma.products.create({
        data: productData,
        include: { variants: true },
    });
    console.log(`  ✅ "${newProduct.name}" (id: ${newProduct.id}, variants: ${newProduct.variants.length})`);

    // --- Link brand ---
    if (brandId) {
        await prisma.product_brand.upsert({
            where: { product_id_brand_id: { product_id: newProduct.id, brand_id: brandId } },
            create: { product_id: newProduct.id, brand_id: brandId },
            update: {},
        }).catch(() => {}); // ignore if unique constraint has different name
    }

    // --- Init inventory in all active warehouses (stock = 0 by default) ---
    try {
        const warehouses = await prisma.warehouses.findMany({
            where: { is_active: true },
            select: { id: true },
        });

        if (warehouses.length > 0 && newProduct.variants.length > 0) {
            const records = [];
            newProduct.variants.forEach((variant, vi) => {
                const raw = product_variants[vi] || {};
                warehouses.forEach((wh) => {
                    records.push({
                        variant_id:          variant.id,
                        warehouse_id:        wh.id,
                        stock_qty:           (raw._warehouse_id && wh.id === raw._warehouse_id) ? (raw._initial_stock || 0) : 0,
                        reserved_qty:        0,
                        bulk_stock_threshold: 0,
                        updated_at:          new Date(),
                    });
                });
            });

            if (records.length > 0) {
                await prisma.inventory.createMany({ data: records, skipDuplicates: true });
                console.log(`     📊 Inventory rows created: ${records.length}`);
            }
        }
    } catch (invErr) {
        console.warn(`     ⚠️  Inventory init warning: ${invErr.message}`);
    }

    return newProduct;
}

// ---------------------------------------------------------------------------
// 5. MAIN
// ---------------------------------------------------------------------------
async function main() {
    console.log("🌱 Seeding products from Excel (match-only mode)…\n");

    const rows     = readExcel();
    const products = groupRowsIntoProducts(rows);

    console.log(`📋 Found ${products.length} unique product(s)\n`);

    let success = 0, failed = 0, skipped = 0;

    for (const productDef of products) {
        try {
            const result = await seedProduct(productDef);
            if (result) success++;
            else skipped++;
        } catch (err) {
            console.error(`  ❌ Error on "${productDef.name}": ${err.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Done — ✅ ${success} seeded | ⚠️  ${skipped} skipped | ❌ ${failed} failed`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});
