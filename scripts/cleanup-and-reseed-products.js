/**
 * cleanup-and-reseed-products.js
 *
 * 1. Deletes ALL orders and products (complete cleanup)
 * 2. Preserves: categories, brands, warehouses, stores, banners, pincodes, branches
 * 3. Seeds EXACTLY 284 products from Excel (grouped by product name for variants)
 * 4. Each parent product can have MULTIPLE variants from same product name rows
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
// 1. CLEANUP — Delete orders AND products (complete reset)
// ---------------------------------------------------------------------------
async function cleanupEverything() {
  console.log("🗑️  Complete cleanup: Deleting all orders and products...\n");

  try {
    // Delete orders first (they reference product_variants)
    const subitemCount = await prisma.sub_order_items.deleteMany({});
    console.log(`  ✅ Deleted ${subitemCount.count} sub_order_items`);

    const itemCount = await prisma.order_items.deleteMany({});
    console.log(`  ✅ Deleted ${itemCount.count} order_items`);

    const orderCount = await prisma.orders.deleteMany({});
    console.log(`  ✅ Deleted ${orderCount.count} orders`);

    // Now delete products and relationships
    const pbCount = await prisma.product_brand.deleteMany({});
    console.log(`  ✅ Deleted ${pbCount.count} product_brand associations`);

    const prsCount = await prisma.product_recommended_store.deleteMany({});
    console.log(`  ✅ Deleted ${prsCount.count} product_recommended_store records`);

    const invCount = await prisma.inventory.deleteMany({});
    console.log(`  ✅ Deleted ${invCount.count} inventory records`);

    const varCount = await prisma.product_variants.deleteMany({});
    console.log(`  ✅ Deleted ${varCount.count} product variants`);

    const prodCount = await prisma.products.deleteMany({});
    console.log(`  ✅ Deleted ${prodCount.count} products\n`);

    console.log(`✅ Preserved: categories, brands, warehouses, stores, banners, pincodes, branches\n`);

    return { orders: orderCount.count, products: prodCount.count };
  } catch (err) {
    console.error(`❌ Cleanup error: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 2. LOOKUP HELPERS
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
// 3. READ EXCEL
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
// 4. GROUP ROWS → PRODUCTS
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
      const oldPrice = parseFloat(row["__EMPTY"]) || 0;
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
// 5. SEED ONE PRODUCT (with WAREHOUSE source_type)
// ---------------------------------------------------------------------------
async function seedProduct(productDef) {
  const {
    name, description, vertical, hsn_or_sac_code, gst_rate,
    category: categoryName, subcategory: subcategoryName,
    group: groupName, brand: brandName, product_variants,
  } = productDef;

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

  // Build product with WAREHOUSE source_type
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
    source_type: "WAREHOUSE",  // ← Default warehouse type
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

  const newProduct = await prisma.products.create({
    data: productData,
    include: { variants: true },
  });
  console.log(`  ✅ "${newProduct.name}" (id: ${newProduct.id}, variants: ${newProduct.variants.length})`);

  if (brandId) {
    await prisma.product_brand.upsert({
      where: { product_id_brand_id: { product_id: newProduct.id, brand_id: brandId } },
      create: { product_id: newProduct.id, brand_id: brandId },
      update: {},
    }).catch(() => {});
  }

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
// 6. MAIN
// ---------------------------------------------------------------------------
async function main() {
  try {
    // Step 1: Complete cleanup (orders + products)
    const cleaned = await cleanupEverything();

    // Step 2: Seed from Excel
    console.log("🌱 Seeding products from Excel...\n");
    const rows     = readExcel();
    const products = groupRowsIntoProducts(rows);

    console.log(`📋 Excel rows: ${rows.length}`);
    console.log(`📋 Grouped into: ${products.length} unique parent product(s)\n`);

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

    // Verify no duplicates were created
    const finalCount = await prisma.products.count();
    const variantCount = await prisma.product_variants.count();

    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Deleted orders: ${cleaned.orders}`);
    console.log(`  Deleted products: ${cleaned.products}`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Seeded: ✅ ${success} parent products`);
    console.log(`  Skipped: ⚠️  ${skipped}`);
    console.log(`  Failed: ❌ ${failed}`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Total parent products in DB: ${finalCount}`);
    console.log(`  Total variants across all products: ${variantCount}`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (finalCount <= 284) {
      console.log(`  ✅ SUCCESS: Product count is within Excel row count (284)`);
    } else {
      console.log(`  ⚠️  WARNING: Product count (${finalCount}) exceeds Excel rows (284)`);
    }
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
