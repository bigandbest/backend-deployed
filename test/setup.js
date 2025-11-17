// backend-deployed/test/setup.js
require("dotenv").config({ path: ".env.test" });

// Mock console.error to reduce noise during tests
const originalConsoleError = console.error;
console.error = (...args) => {
  // Only show console.error for actual test failures, not expected errors
  const message = args.join(" ");
  if (!message.includes("Test") && !message.includes("expected")) {
    originalConsoleError.apply(console, args);
  }
};

// Set longer timeout for database operations
jest.setTimeout(30000);

// Global test configuration
global.TEST_CONFIG = {
  supabase_url: process.env.SUPABASE_URL || "http://localhost:54321",
  supabase_anon_key: process.env.SUPABASE_ANON_KEY || "test_key",
  jwt_secret: process.env.JWT_SECRET || "test_secret",
  razorpay_key_id: "rzp_test_1234567890",
  razorpay_key_secret: "test_secret",
};

// Override environment variables for testing
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = global.TEST_CONFIG.supabase_url;
process.env.SUPABASE_ANON_KEY = global.TEST_CONFIG.supabase_anon_key;
process.env.JWT_SECRET = global.TEST_CONFIG.jwt_secret;
process.env.RAZORPAY_KEY_ID = global.TEST_CONFIG.razorpay_key_id;
process.env.RAZORPAY_KEY_SECRET = global.TEST_CONFIG.razorpay_key_secret;
