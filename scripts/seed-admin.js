import prisma from "../config/prisma.js";
import { hashPassword } from "../utils/passwordUtils.js";

/**
 * Seed admin user into database
 * This script is idempotent - can be run multiple times safely
 */
async function seedAdmin() {
  try {
    const adminEmail = "bigandbestmart@gmail.com";
    const adminPassword = "vikas1234";

    console.log("🌱 Starting admin seed...");

    // Check if admin already exists
    const existingAdmin = await prisma.users.findUnique({
      where: { email: adminEmail },
    });

    if (existingAdmin) {
      console.log("✅ Admin user already exists");
      console.log("   Email:", existingAdmin.email);
      console.log("   Role:", existingAdmin.role);
      console.log("   Created:", existingAdmin.created_at);

      // Update to ensure admin has correct role if it was changed
      if (existingAdmin.role !== "ADMIN") {
        console.log("🔄 Updating role to ADMIN...");
        await prisma.users.update({
          where: { id: existingAdmin.id },
          data: { role: "ADMIN" },
        });
        console.log("✅ Admin role updated");
      }

      // Start: Always update password for development/seed consistency
      console.log("🔐 Updating password to ensure consistency...");
      const hashedPassword = await hashPassword(adminPassword);
      await prisma.users.update({
        where: { id: existingAdmin.id },
        data: { password: hashedPassword },
      });
      console.log("✅ Password updated to default");
      // End

      return;
    }

    // Hash password
    console.log("🔐 Hashing password...");
    const hashedPassword = await hashPassword(adminPassword);

    // Create admin user
    console.log("👤 Creating admin user...");
    const admin = await prisma.users.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        role: "ADMIN",
        name: "Big and Best Admin",
        is_active: true,
        created_at: new Date(),
        last_login: null,
      },
    });

    console.log("✅ Admin user created successfully!");
    console.log("   Email:", admin.email);
    console.log("   Role:", admin.role);
    console.log("   ID:", admin.id);
    console.log("\n📝 Login credentials:");
    console.log("   Email:", adminEmail);
    console.log("   Password:", adminPassword);
    console.log("\n⚠️  Please change the admin password after first login!");
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
