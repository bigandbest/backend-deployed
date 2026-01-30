// Test configuration and utilities for Vitest
import { beforeAll, afterAll, vi } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Mock console.error to reduce noise
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.join(' ');
  if (!message.includes('Test') && !message.includes('expected')) {
    originalConsoleError.apply(console, args);
  }
};

// Global test utilities
global.TEST_UTILS = {
  generateTestUser: () => ({
    id: `test-user-${Date.now()}-${Math.random()}`,
    name: `Test User ${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: 'Test@123456',
  }),

  generateTestProduct: () => ({
    name: `Test Product ${Date.now()}`,
    description: 'Test product description',
    price: 99.99,
    old_price: 149.99,
    stock: 100,
    category_id: 1,
    image: 'https://example.com/image.jpg',
  }),

  generateTestOrder: (userId, items) => ({
    user_id: userId,
    items: items || [{
      product_id: 1,
      quantity: 2,
      price: 99.99,
    }],
    total_amount: 199.98,
    delivery_address: {
      street: '123 Test St',
      city: 'Test City',
      state: 'Test State',
      pincode: '110001',
    },
  }),
};

export default {};
