/**
 * clear-all-products.js
 * 
 * Safely removes ALL products and product-related data from the database,
 * while preserving categories, brands, stores, sections, and all other data.
 * 
 * Uses raw SQL TRUNCATE ... CASCADE to handle all FK dependencies automatically.
 * 
 * Run with: node scripts/clear-all-products.js
 */

import prisma from "../config/prisma.js";

async function clearAllProducts() {
    console.log("🗑️  Starting product cleanup using raw SQL...\n");

    try {
        // Use $executeRawUnsafe to run TRUNCATE with CASCADE.
        // This automatically handles all FK-dependent tables.
        // We list all product-related tables; CASCADE ensures child tables are handled.
        await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        return_order_items,
        order_items,
        cart_items,
        wishlist_items,
        product_warehouse_stock,
        product_variants,
        product_brand,
        product_media,
        product_reviews,
        product_enquiries,
        product_recommended_store,
        product_section_products,
        quickpick_group_product,
        store_section_mappings,
        daily_deals_product,
        products
      RESTART IDENTITY CASCADE;
    `);

        console.log("✅ All products and related data deleted successfully.");
        console.log("   The following data is preserved:");
        console.log("   - categories, subcategories, groups");
        console.log("   - brands, stores");
        console.log("   - product_sections, product_section_categories");
        console.log("   - orders, users, and all other data");
        console.log("");
    } catch (error) {
        console.error("\n❌ Error during product cleanup:", error.message);

        // If return_order_items doesn't exist, try without it
        if (error.message.includes("return_order_items")) {
            console.log("   Retrying without return_order_items table...\n");
            try {
                await prisma.$executeRawUnsafe(`
          TRUNCATE TABLE
            order_items,
            cart_items,
            wishlist_items,
            product_warehouse_stock,
            product_variants,
            product_brand,
            product_media,
            product_reviews,
            product_enquiries,
            product_recommended_store,
            product_section_products,
            quickpick_group_product,
            store_section_mappings,
            daily_deals_product,
            products
          RESTART IDENTITY CASCADE;
        `);
                console.log("✅ All products and related data deleted successfully.\n");
            } catch (retryError) {
                console.error("❌ Retry failed:", retryError.message);
                process.exit(1);
            }
        } else {
            process.exit(1);
        }
    } finally {
        await prisma.$disconnect();
    }
}

clearAllProducts();
