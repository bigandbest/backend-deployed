import UserDAO from "../dao/user.dao.js";
import { hashPassword } from "../utils/passwordUtils.js";

async function createBigAndBestAdmin() {
  try {
    const email = "bigandbestmart@gmail.com";
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

    // Create admin user with the specific ID that was in the token
    const adminUser = await UserDAO.createUser({
      id: "4c8e1186-ebe9-4f17-b90b-7bb3251043bf", // The ID from your existing token
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
