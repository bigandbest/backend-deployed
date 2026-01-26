import prisma from "../config/prisma.js";
import { hashPassword } from "../utils/passwordUtils.js";

/**
 * Seed admin user into database
 * This script is idempotent - can be run multiple times safely
 */
import { supabase } from "../config/supabaseClient.js";

/**
 * Seed admin user into database and Supabase Auth
 * this ensures the user can actually login
 */
async function seedAdmin() {
  try {
    const adminEmail = "bigandbestmart@gmail.com";
    const adminPassword = "vikas1234";

    console.log("🌱 Starting admin seed...");

    let userId = null;

    // 1. Ensure user exists in Supabase Auth
    console.log("🔐 Key: Checking Supabase Auth...");
    if (!supabase) {
      throw new Error("Supabase client not initialized (missing env vars)");
    }

    // Check for common configuration error
    if (process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.SUPABASE_ANON_KEY) {
      console.error("\n❌ CONFIGURATION ERROR: SUPABASE_SERVICE_ROLE_KEY matches SUPABASE_ANON_KEY.");
      console.error("   You must set the real Service Role Key (secret) in .env to create users programmatically.");
      console.error("   Please update backend-deployed/.env and run this script again.\n");
      throw new Error("Invalid Service Role Key");
    }

    // Try to create user
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { name: 'Big and Best Admin', role: 'ADMIN' }
    });

    if (createData?.user) {
      console.log("✅ Created user in Supabase Auth");
      userId = createData.user.id;
    } else if (createError && createError.message?.includes("already registered")) {
      console.log("ℹ️ User already in Supabase Auth, fetching ID...");
      // Fetch user List (fallback for getting ID)
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;

      const found = users?.find(u => u.email === adminEmail);
      if (found) {
        userId = found.id;
        console.log("✅ Found existing Supabase Auth ID:", userId);
        // Optional: Update password
        await supabase.auth.admin.updateUserById(userId, {
          password: adminPassword,
          user_metadata: { role: 'ADMIN' }
        });
        console.log("🔄 Updated Supabase Auth password");
      } else {
        throw new Error("User reported as registered but not found in list");
      }
    } else {
      throw createError || new Error("Unknown error creating Supabase user");
    }

    if (!userId) throw new Error("Failed to resolve User ID");

    // 2. Sync with Prisma Database
    console.log("👤 Syncing with Database...");

    // Check if email exists with DIFFERENT ID (clean up zombie record)
    const existingByEmail = await prisma.users.findUnique({
      where: { email: adminEmail }
    });

    if (existingByEmail && existingByEmail.id !== userId) {
      console.warn("⚠️ Found database record with mismatching ID (Zombie record). Deleting...");
      await prisma.users.delete({ where: { id: existingByEmail.id } });
    }

    // Hash password for DB storage
    console.log(" 🔐 Hashing password for DB...");
    const hashedPassword = await hashPassword(adminPassword);

    // Upsert user with Correct ID
    const admin = await prisma.users.upsert({
      where: { id: userId },
      update: {
        role: "ADMIN",
        password: hashedPassword,
        email: adminEmail, // ensure email consistent
        name: "Big and Best Admin",
        is_active: true
      },
      create: {
        id: userId,
        email: adminEmail,
        password: hashedPassword,
        role: "ADMIN",
        name: "Big and Best Admin",
        is_active: true,
        created_at: new Date()
      }
    });

    console.log("✅ Admin user synced successfully!");
    console.log("   ID:", admin.id);
    console.log("   Email:", admin.email);
    console.log("   Role:", admin.role);
    console.log("\n📝 Login credentials:");
    console.log("   Email:", adminEmail);
    console.log("   Password:", adminPassword);

  } catch (error) {
    console.error("❌ Error seeding admin:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then(() => {
      console.log("\n✅ Seed completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Seed failed:", error);
      process.exit(1);
    });
}

export default seedAdmin;
