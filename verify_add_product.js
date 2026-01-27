import axios from "axios";

const API_URL = "http://localhost:8000/api/admin/products";
const BULK_URL = "http://localhost:8000/api/bulk-products/settings";

const testProduct = {
    name: "Test Product - Auto Verification",
    description: "Created via automated verification script",
    price: 100, // Frontend might send this? Controller didn't see explicit price field, it was in nested variants?
    // Controller logic: 
    // const productData = { name ... }
    // It didn't extract 'price' for main product. Prisma schema for 'products' DOES NOT have price.
    // 'price' is on 'product_variants'.
    // So we rely on variants.

    // Required fields based on Controller:
    // name, vertical, etc. defaults are fine.

    category_id: null, // Test without category first or mock UUID if strict

    // Variants
    has_variants: true,
    product_variants: [
        {
            variant_name: "Test Variant 1",
            variant_price: 100,
            variant_stock: 10,
            is_default: true
        }
    ],

    // Media
    images: ["https://via.placeholder.com/150"],

    // Bulk
    enable_bulk_pricing: true,
    bulk_min_quantity: 5,
    bulk_discount_percentage: 10
};

async function verify() {
    console.log("🚀 Starting Verification...");

    try {
        // 1. Create Product
        console.log("1. Creating Product...");
        const createRes = await axios.post(API_URL, testProduct);

        if (createRes.data.success) {
            console.log("✅ Product Created! ID:", createRes.data.productId);
            const productId = createRes.data.productId;

            // 2. Verify Bulk Settings
            if (testProduct.enable_bulk_pricing) {
                console.log("2. Creating Bulk Settings...");
                const basePrice = 100;
                const discount = 10;
                const bulkPrice = basePrice - (basePrice * discount) / 100;

                const bulkRes = await axios.post(`${BULK_URL}/${productId}`, {
                    product_id: productId,
                    min_quantity: testProduct.bulk_min_quantity,
                    discount_percentage: testProduct.bulk_discount_percentage,
                    bulk_price: bulkPrice,
                    is_active: true,
                    is_bulk_enabled: true
                });

                if (bulkRes.status === 200 || bulkRes.status === 201) {
                    console.log("✅ Bulk Settings Created!");
                } else {
                    console.error("❌ Bulk Settings Failed:", bulkRes.data);
                }
            }

            console.log("🎉 Verification Successful!");

        } else {
            console.error("❌ Product Creation Failed:", createRes.data);
        }

    } catch (error) {
        if (error.response) {
            console.error("❌ Request Failed:", error.response.status, error.response.data);
        } else {
            console.error("❌ Error:", error.message);
        }
    }
}

verify();
