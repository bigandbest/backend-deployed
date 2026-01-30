import UserDAO from "../dao/user.dao.js";
import { hashPassword } from "../utils/passwordUtils.js";
import { randomUUID } from "crypto";

async function createBigAndBestAdmin() {
  try {
    const email = "bigandbestmart1@gmail.com";
    const password = "vikas1234"; // Change this to your preferred password
    const name = "Big and Best Admin";

    // Check if admin user already exists
    const existingUser = await UserDAO.getUserByEmail(email);

    if (existingUser) {
      console.log("❌ Admin user already exists with email:", email);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Email:", email);
      console.log("User ID:", existingUser.id);
      console.log("Role:", existingUser.role);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create admin user with a new unique ID
    const adminUser = await UserDAO.createUser({
      id: randomUUID(), // Generate a unique ID to avoid collisions
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: "ADMIN",
      is_active: true,
      created_at: new Date(),
      last_login: new Date(),
    });

    console.log("✅ Big and Best Admin user created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("User ID:", adminUser.id);
    console.log("Role:", adminUser.role);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  Please change the password after first login!");
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
    console.error(error);
    process.exit(1);
  }
}

createBigAndBestAdmin();
