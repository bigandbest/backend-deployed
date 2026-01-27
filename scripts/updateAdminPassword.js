import UserDAO from "../dao/user.dao.js";
import { hashPassword } from "../utils/passwordUtils.js";
import prisma from "../config/prisma.js";

async function updateAdminPassword() {
  try {
    const email = "bigandbestmart@gmail.com";
    const newPassword = "vikas1234";

    // Check if admin user exists
    const existingUser = await UserDAO.getUserByEmail(email);

    if (!existingUser) {
      console.log("❌ Admin user not found with email:", email);
      process.exit(1);
    }

    // Hash the new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.users.update({
      where: { id: existingUser.id },
      data: { password: hashedPassword }
    });

    console.log("✅ Admin password updated successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Email:", email);
    console.log("Password:", newPassword);
    console.log("User ID:", existingUser.id);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating admin password:", error.message);
    console.error(error);
    process.exit(1);
  }
}

updateAdminPassword();
