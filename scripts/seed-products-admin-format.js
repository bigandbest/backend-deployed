/**
 * seed-products-admin-format.js
 *
 * Reads products from `scripts/product_import_template.xlsx` and seeds them
 * using the EXACT same data structure as the admin product form
 * (AddProduct.jsx → adminProductController.js → ProductDAO.createProduct).
 *
 * Excel Columns Expected:
 *   Product Name | Description | Category Name | Subcategory Name | Group Name |
 *   Brand Name | Store Name | Vertical | HSN Code | GST Rate |
 *   Variant SKU | Variant Title | Variant Price | Variant Old Price | Variant Discount % |
 *   Variant Packaging | Variant Net Quantity | Variant Image URL | Is Default | Stock Quantity
 *
 * Multiple rows with the same "Product Name" are treated as additional variants of that product.
 *
 * Run with:  npm run seed:products:admin
 */

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXCEL_FILE = path.join(__dirname, "product_import_template.xlsx");

// ---------------------------------------------------------------------------
// 1. LOOKUP HELPERS (fuzzy: trim + case-insensitive)
// ---------------------------------------------------------------------------
const cache = { categories: {}, subcategories: {}, groups: {}, brands: {} };

async function findCategory(name) {
    if (!name) return null;
    const key = name.trim().toLowerCase();
    if (cache.categories[key]) return cache.categories[key];
    const all = await prisma.categories.findMany({ where: { active: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === key);
    if (!found) throw new Error(`Category not found: "${name}"`);
    cache.categories[key] = found.id;
    return found.id;
}

async function findSubcategory(name, categoryId) {
    if (!name || !categoryId) return null;
    const key = `${categoryId}|${name.trim().toLowerCase()}`;
    if (cache.subcategories[key]) return cache.subcategories[key];
    const all = await prisma.subcategories.findMany({ where: { category_id: categoryId, active: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!found) throw new Error(`Subcategory not found: "${name}"`);
    cache.subcategories[key] = found.id;
    return found.id;
}

async function findGroup(name, subcategoryId) {
    if (!name || !subcategoryId) return null;
    const key = `${subcategoryId}|${name.trim().toLowerCase()}`;
    if (cache.groups[key]) return cache.groups[key];
    const all = await prisma.groups.findMany({ where: { subcategory_id: subcategoryId, active: true } });
    const found = all.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!found) throw new Error(`Group not found: "${name}"`);
    cache.groups[key] = found.id;
    return found.id;
}

async function findOrCreateBrand(name) {
    if (!name) return null;
    const key = name.trim().toLowerCase();
    if (cache.brands[key]) return cache.brands[key];
    const all = await prisma.brand.findMany();
    let found = all.find((r) => r.name.trim().toLowerCase() === key);
    if (!found) {
        found = await prisma.brand.create({ data: { name: name.trim() } });
        console.log(`  ✅ Created brand: "${name}"`);
    }
    cache.brands[key] = found.id;
    return found.id;
}

// ---------------------------------------------------------------------------
// 2. READ EXCEL
// ---------------------------------------------------------------------------
function readExcel() {
    const wb = XLSX.readFile(EXCEL_FILE);
    const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes("product")) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    console.log(`📄 Read ${rows.length} row(s) from sheet "${sheetName}"\n`);
    return rows;
}

// ---------------------------------------------------------------------------
// 3. GROUP ROWS INTO PRODUCTS
//    Multiple rows sharing the same "Product Name" = same product, extra variants
// ---------------------------------------------------------------------------
function groupRowsIntoProducts(rows) {
    const productMap = new Map();

    rows.forEach((row) => {
        const name = (row["Product Name"] || "").toString().trim();
        if (!name || name.toLowerCase() === "sample product") return; // skip empty/sample rows

        if (!productMap.has(name)) {
            productMap.set(name, {
                name,
                description: (row["Description"] || "").toString().trim(),
                category: (row["Category Name"] || "").toString().trim(),
                subcategory: (row["Subcategory Name"] || "").toString().trim(),
                group: (row["Group Name"] || "").toString().trim(),
                brand: (row["Brand Name"] || "").toString().trim(),
                vertical: (row["Vertical"] || "qwik").toString().trim().toLowerCase() || "qwik",
                hsn_or_sac_code: (row["HSN Code"] || "").toString().trim(),
                gst_rate: parseFloat(row["GST Rate"]) || 0,
                cess_rate: parseFloat(row["Cess Rate"]) || 0,
                return_applicable: row["Return Applicable"] === true || row["Return Applicable"] === "true" || row["Return Applicable"] === 1,
                return_days: parseInt(row["Return Days"]) || 0,
                active: true,
                faq: [],
                media: row["Image URL"] ? [{ url: row["Image URL"].toString().trim(), media_type: "image", is_primary: true, sort_order: 0 }] : [],
                product_variants: [],
            });
        }

        const product = productMap.get(name);

        // Add variant if Variant Title is present
        const variantTitle = (row["Variant Title"] || "").toString().trim();
        const variantPrice = parseFloat(row["Variant Price"]) || 0;

        if (variantTitle && variantPrice > 0) {
            const variantOldPrice = parseFloat(row["Variant Old Price"]) || 0;
            const discountPct = parseFloat(row["Variant Discount %"]) || 0;
            const sku = (row["Variant SKU"] || "").toString().trim();

            product.product_variants.push({
                title: variantTitle,
                sku: sku || null,
                price: variantPrice,
                old_price: variantOldPrice > 0 ? variantOldPrice : null,
                discount_percentage: discountPct,
                packaging_details: (row["Variant Packaging"] || "").toString().trim() || null,
                net_quantity: (row["Variant Net Quantity"] || "").toString().trim() || null,
                photo_url: (row["Variant Image URL"] || "").toString().trim() || null,
                is_default: product.product_variants.length === 0, // first variant = default
                active: true,
                shipping_amount: parseFloat(row["Shipping Amount"]) || 0,
                attributes: [],
                // stock is handled via inventory init
                _initial_stock: parseInt(row["Stock Quantity"]) || 0,
                _warehouse_id: row["Warehouse ID"] ? parseInt(row["Warehouse ID"]) : null,
            });
        }
    });

    return Array.from(productMap.values());
}

// ---------------------------------------------------------------------------
// 4. SEED ONE PRODUCT (mirrors admin createProduct exactly)
// ---------------------------------------------------------------------------
async function seedProduct(productDef) {
    const { name, description, vertical, hsn_or_sac_code, gst_rate, cess_rate,
        return_applicable, return_days, active, faq, category: categoryName,
        subcategory: subcategoryName, group: groupName, brand: brandName,
        media, product_variants } = productDef;

    console.log(`\n📦 Seeding: "${name}"`);

    // Resolve IDs
    const categoryId = await findCategory(categoryName);
    const subcategoryId = subcategoryName ? await findSubcategory(subcategoryName, categoryId) : null;
    const groupId = groupName && subcategoryId ? await findGroup(groupName, subcategoryId) : null;
    const brandId = brandName ? await findOrCreateBrand(brandName) : null;

    const hasVariants = product_variants && product_variants.length > 0;

    const productData = {
        name,
        description,
        hsn_or_sac_code: hsn_or_sac_code || null,
        gst_rate: parseFloat(gst_rate) || 0,
        cess_rate: parseFloat(cess_rate) || 0,
        vertical: vertical || "qwik",
        return_applicable: !!return_applicable,
        return_days: parseInt(return_days) || 0,
        active: active !== undefined ? active : true,
        has_variants: hasVariants,
        faq: faq && faq.length > 0 ? faq : null,
        created_by: "seed",
    };

    // Relations
    if (categoryId) productData.category = { connect: { id: categoryId } };
    if (subcategoryId) productData.subcategory = { connect: { id: subcategoryId } };
    if (groupId) productData.group = { connect: { id: groupId } };

    // Media
    if (media && media.length > 0) {
        productData.media = {
            create: media.map((item, index) => ({
                media_type: item.media_type || "image",
                url: item.url,
                is_primary: item.is_primary !== undefined ? item.is_primary : index === 0,
                sort_order: item.sort_order !== undefined ? item.sort_order : index,
            })),
        };
    }

    // Variants (uses correct Prisma field names: title / price / old_price / discount_percentage)
    if (hasVariants) {
        productData.variants = {
            create: product_variants.map((v) => {
                const variantData = {
                    title: v.title,
                    sku: v.sku || `${name.substring(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    price: parseFloat(v.price || 0),
                    old_price: v.old_price ? parseFloat(v.old_price) : null,
                    discount_percentage: parseInt(v.discount_percentage) || 0,
                    is_default: !!v.is_default,
                    active: v.active !== undefined ? v.active : true,
                    shipping_amount: parseFloat(v.shipping_amount) || 0,
                    packaging_details: v.packaging_details || null,
                    net_quantity: v.net_quantity || null,
                    photo_url: v.photo_url || null,
                    is_bulk_enabled: false,
                    bulk_min_quantity: 50,
                    bulk_discount_percentage: 0,
                    bulk_price: 0,
                };

                if (v.attributes && Array.isArray(v.attributes) && v.attributes.length > 0) {
                    variantData.attributes = {
                        create: v.attributes.map((attr) => ({
                            attribute_name: attr.attribute_name,
                            attribute_value: attr.attribute_value,
                        })),
                    };
                }

                return variantData;
            }),
        };
    }

    // Create product
    const newProduct = await prisma.products.create({ data: productData, include: { variants: true } });
    console.log(`  ✅ Created product: "${newProduct.name}" (id: ${newProduct.id})`);

    // Link Brand
    if (brandId) {
        await prisma.product_brand.create({
            data: { product_id: newProduct.id, brand_id: brandId },
        });
        console.log(`  🔗 Linked brand: "${brandName}"`);
    }

    // Init inventory for each variant in active warehouses
    try {
        const warehouses = await prisma.warehouses.findMany({
            where: { is_active: true },
            select: { id: true },
        });

        if (warehouses.length > 0 && newProduct.variants?.length > 0) {
            const inventoryRecords = [];

            newProduct.variants.forEach((variant, vi) => {
                const rawVariant = product_variants[vi] || {};
                const specificWarehouseId = rawVariant._warehouse_id;
                const stockQty = rawVariant._initial_stock || 0;

                warehouses.forEach((wh) => {
                    inventoryRecords.push({
                        variant_id: variant.id,
                        warehouse_id: wh.id,
                        // Use provided stock for the specified warehouse, else 0
                        stock_qty: specificWarehouseId && wh.id === specificWarehouseId ? stockQty : 0,
                        reserved_qty: 0,
                        bulk_stock_threshold: 0,
                    });
                });
            });

            if (inventoryRecords.length > 0) {
                await prisma.inventory.createMany({ data: inventoryRecords, skipDuplicates: true });
                console.log(`  📊 Initialized ${inventoryRecords.length} inventory rows`);
            }
        }
    } catch (invErr) {
        console.warn(`  ⚠️  Inventory init warning: ${invErr.message}`);
    }

    return newProduct;
}

// ---------------------------------------------------------------------------
// 5. MAIN
// ---------------------------------------------------------------------------
async function main() {
    console.log("🌱 Starting Excel-based product seed (admin format)...\n");

    const rows = readExcel();
    const products = groupRowsIntoProducts(rows);

    if (products.length === 0) {
        console.log("⚠️  No products found in the Excel file. Please add rows to the Products sheet.");
        console.log("   Columns needed: Product Name, Description, Category Name, Subcategory Name,");
        console.log("   Group Name, Brand Name, Vertical, HSN Code, GST Rate, Variant SKU,");
        console.log("   Variant Title, Variant Price, Variant Old Price, Variant Discount %,");
        console.log("   Variant Packaging, Stock Quantity, Warehouse ID");
        await prisma.$disconnect();
        return;
    }

    console.log(`📋 Found ${products.length} product(s) to seed\n`);

    let success = 0;
    let failed = 0;

    for (const productDef of products) {
        try {
            await seedProduct(productDef);
            success++;
        } catch (err) {
            console.error(`  ❌ Failed: "${productDef.name}" → ${err.message}`);
            failed++;
        }
    }

    console.log(`\n✅ Done: ${success} seeded, ${failed} failed.`);
    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});
