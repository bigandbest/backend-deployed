import UserDAO from "../dao/user.dao.js";
import { hashPassword } from "../utils/passwordUtils.js";

async function createAdminUser() {
  try {
    const email = "admin@example.com";
    const password = "admin123";
    const name = "Admin User";

    // Check if admin user already exists
    const existingUser = await UserDAO.getUserByEmail(email);

    if (existingUser) {
      console.log("❌ Admin user already exists with email:", email);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Email:", email);
      console.log("Password: admin123");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create admin user
    const adminUser = await UserDAO.createUser({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: "ADMIN",
      is_active: true,
      created_at: new Date(),
      last_login: new Date(),
    });

    console.log("✅ Admin user created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("Role:", adminUser.role);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  Please change the password after first login!");
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
    console.error(error);
    process.exit(1);
  }
}

createAdminUser();
