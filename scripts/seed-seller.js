import prisma from "../config/prisma.js";
import { hashPassword } from "../utils/passwordUtils.js";
import crypto from "crypto";

/**
 * Seed a seller user + seller profile and allocate to a division warehouse.
 * Uses Prisma directly (no Supabase auth needed — seller auth uses JWT).
 * Idempotent — can be run multiple times safely.
 */
async function seedSeller() {
    try {
        const sellerEmail = "seller@bigbestmart.com";
        const sellerPassword = "seller1234";
        const sellerName = "Ayush Seller Store";

        console.log("🌱 Starting seller seed...\n");

        // ─── Step 1: Create/update user in Prisma DB ───
        console.log("� Creating seller user in database...");
        const hashedPassword = await hashPassword(sellerPassword);

        // Check if user already exists
        let user = await prisma.users.findUnique({
            where: { email: sellerEmail },
        });

        if (user) {
            console.log("ℹ️  User already exists, updating...");
            user = await prisma.users.update({
                where: { email: sellerEmail },
                data: {
                    role: "SELLER",
                    password: hashedPassword,
                    name: sellerName,
                    is_active: true,
                },
            });
        } else {
            user = await prisma.users.create({
                data: {
                    id: crypto.randomUUID(),
                    email: sellerEmail,
                    password: hashedPassword,
                    role: "SELLER",
                    name: sellerName,
                    is_active: true,
                    created_at: new Date(),
                },
            });
        }

        console.log("✅ User synced — ID:", user.id, "Role:", user.role);

        // ─── Step 2: Create seller profile ───
        console.log("\n🏪 Creating seller profile...");

        const seller = await prisma.sellers.upsert({
            where: { user_id: user.id },
            update: {
                business_name: sellerName,
                business_type: "individual",
                seller_type: "SELLER",
                gstin: "07AABCS1429B1ZT",
                city: "New Delhi",
                state: "Delhi",
                pincode: "110001",
                address: "123, Main Market, Connaught Place",
                is_active: true,
                is_verified: true,
                approved_at: new Date(),
            },
            create: {
                user_id: user.id,
                business_name: sellerName,
                business_type: "individual",
                seller_type: "SELLER",
                gstin: "07AABCS1429B1ZT",
                bank_account_no: "1234567890",
                bank_ifsc: "SBIN0001234",
                bank_name: "State Bank of India",
                city: "New Delhi",
                state: "Delhi",
                pincode: "110001",
                address: "123, Main Market, Connaught Place",
                is_active: true,
                is_verified: true,
                approved_at: new Date(),
            },
        });

        console.log("✅ Seller profile created — ID:", seller.id);

        // ─── Step 3: Find a division warehouse & assign ───
        console.log("\n🏬 Looking for a division warehouse...");

        const divisionWarehouse = await prisma.warehouses.findFirst({
            where: { type: "division" },
            include: { warehouse_pincodes: true },
        });

        if (!divisionWarehouse) {
            console.warn(
                "⚠️  No division warehouse found. Skipping warehouse assignment."
            );
            console.log(
                "   Create a division warehouse first, then re-run this script."
            );
        } else {
            console.log(
                `📍 Found division warehouse: "${divisionWarehouse.name}" (ID: ${divisionWarehouse.id})`
            );

            // Assign seller to warehouse
            await prisma.warehouse_sellers.upsert({
                where: {
                    warehouse_id_seller_id: {
                        warehouse_id: divisionWarehouse.id,
                        seller_id: seller.id,
                    },
                },
                update: { is_active: true },
                create: {
                    warehouse_id: divisionWarehouse.id,
                    seller_id: seller.id,
                    is_active: true,
                },
            });

            console.log(
                `✅ Seller assigned to warehouse "${divisionWarehouse.name}"`
            );

            if (divisionWarehouse.warehouse_pincodes?.length > 0) {
                console.log(
                    `   Serving pincodes: ${divisionWarehouse.warehouse_pincodes.map((p) => p.pincode).join(", ")}`
                );
            }
        }

        // ─── Done ───
        console.log("\n" + "═".repeat(50));
        console.log("🎉 Seller seed completed successfully!");
        console.log("═".repeat(50));
        console.log("\n📝 Seller Login Credentials:");
        console.log(`   Email:    ${sellerEmail}`);
        console.log(`   Password: ${sellerPassword}`);
        console.log(`   Role:     SELLER`);
        console.log(`   Seller ID: ${seller.id}`);
        if (divisionWarehouse) {
            console.log(
                `   Warehouse: ${divisionWarehouse.name} (ID: ${divisionWarehouse.id})`
            );
        }
        console.log("");
    } catch (error) {
        console.error("❌ Error seeding seller:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run if executed directly
let divisionWarehouse; // hoisted for final log
if (import.meta.url === `file://${process.argv[1]}`) {
    seedSeller()
        .then(() => {
            console.log("✅ Done");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ Seed failed:", error);
            process.exit(1);
        });
}

export default seedSeller;
