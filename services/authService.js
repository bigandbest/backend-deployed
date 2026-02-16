import UserDAO from "../dao/user.dao.js";
import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from "../utils/passwordUtils.js";
import { generateToken, generateRefreshToken } from "../utils/jwtUtils.js";

class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email
   * @param {string} userData.password - Plain text password
   * @param {string} userData.name - User name
   * @param {string} userData.phone - User phone (optional)
   * @param {string} userData.role - User role (default: USER)
   * @returns {Promise<Object>} Created user and tokens
   */
  async signup({ email, password, name, phone, role = "USER" }) {
    // Validate email
    if (!email || !email.includes("@")) {
      throw new Error("Valid email is required");
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(", "));
    }

    // Check if user already exists
    const existingUser = await UserDAO.getUserByEmail(email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const userData = {
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      phone,
      role,
      is_active: true,
      created_at: new Date(),
      last_login: new Date(),
    };

    const user = await UserDAO.createUser(userData);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Generate tokens
    const token = this.generateToken(user);
    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
    });

    return {
      user: userWithoutPassword,
      token,
      refreshToken,
    };
  }

  /**
   * Authenticate a user
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @returns {Promise<Object>} User and tokens
   */
  async login(email, password) {
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    // Get user with password
    const user = await UserDAO.getUserByEmailWithPassword(email.toLowerCase());

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Check if user is active
    if (!user.is_active) {
      throw new Error("Account is deactivated. Please contact support.");
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    // Update last login
    await UserDAO.updateUser(user.id, { last_login: new Date() });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Generate tokens
    const token = this.generateToken(user);
    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
    });

    return {
      user: userWithoutPassword,
      token,
      refreshToken,
    };
  }

  /**
   * Login or Signup with OTP
   * @param {string} phone - User phone number
   * @returns {Promise<Object>} User and tokens
   */
  async loginOrSignupWithOTP(phone) {
    // Check if user exists
    let user = await UserDAO.getUserByPhone(phone);

    if (!user) {
      // Create new user if not exists
      // Generate a random password since they are using OTP
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await hashPassword(randomPassword);

      // Generate unique email based on phone if not provided
      const email = `${phone.replace(/\+/g, "")}@bigbestmart.com`;

      const userData = {
        email,
        password: hashedPassword,
        name: "User", // Default name
        phone,
        role: "USER",
        is_active: true,
        created_at: new Date(),
        last_login: new Date(),
      };

      try {
        user = await UserDAO.createUser(userData);
      } catch (error) {
        // If email exists (edge case where phone didn't match but generated email did?? Unlikely with phone-based email)
        // Or if phone constraint failed
        throw error;
      }
    } else {
      // Update last login
      await UserDAO.updateUser(user.id, { last_login: new Date() });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Generate tokens
    const token = this.generateToken(user);
    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email,
    });

    return {
      user: userWithoutPassword,
      token,
      refreshToken,
    };
  }

  /**
   * Generate JWT token for user
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return generateToken(payload, "7d");
  }

  /**
   * Verify user password
   * @param {string} plainPassword - Plain text password
   * @param {string} hashedPassword - Hashed password
   * @returns {Promise<boolean>} True if passwords match
   */
  async verifyPassword(plainPassword, hashedPassword) {
    return await comparePassword(plainPassword, hashedPassword);
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Get user with password
    const user = await UserDAO.getUserById(userId);
    if (!user || !user.password) {
      throw new Error("User not found");
    }

    // Verify current password
    const isPasswordValid = await comparePassword(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Validate new password
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.errors.join(", "));
    }

    // Hash and update password
    const hashedPassword = await hashPassword(newPassword);
    await UserDAO.updatePassword(userId, hashedPassword);
  }

  /**
   * Get user by ID (without password)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User object
   */
  async getUserById(userId) {
    const user = await UserDAO.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

export default new AuthService();
