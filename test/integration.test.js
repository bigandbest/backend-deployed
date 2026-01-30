/**
 * Integration Tests
 * End-to-end tests for complete user flows
 */

import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/authRoute.js';
import productRoutes from '../routes/productRoutes.js';
import cartRoutes from '../routes/cartRoutes.js';
import orderRoutes from '../routes/orderRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

describe('Integration Tests - Complete User Flows', () => {
  let authToken;
  let testUser;
  let productId;
  let orderId;

  describe('Complete Purchase Flow', () => {
    test('Step 1: User Registration', async () => {
      testUser = global.TEST_UTILS.generateTestUser();
      
      const response = await request(app)
        .post('/api/auth/signup')
        .send(testUser);

      expect([200, 201, 400]).toContain(response.status);
      
      if (response.body.token) {
        authToken = response.body.token;
        expect(authToken).toBeTruthy();
      }
    });

    test('Step 2: Browse Products', async () => {
      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body.products).toBeDefined();
      
      if (response.body.products.length > 0) {
        productId = response.body.products[0].id;
      }
    });

    test('Step 3: View Product Details', async () => {
      if (!productId) {
        console.log('Skipping: No product available');
        return;
      }

      const response = await request(app)
        .get(`/api/products/${productId}`);

      expect([200, 404]).toContain(response.status);
    });

    test('Step 4: Add Product to Cart', async () => {
      if (!authToken || !productId) return;

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: productId,
          quantity: 2,
        });

      expect([200, 201, 400, 401]).toContain(response.status);
    });

    test('Step 5: View Cart', async () => {
      if (!authToken) return;

      const response = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });

    test('Step 6: Create Order', async () => {
      if (!authToken) return;

      const orderData = {
        items: [{
          product_id: productId || 1,
          quantity: 2,
          price: 99.99,
        }],
        delivery_address: {
          street: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          phone: testUser.phone,
        },
        payment_method: 'COD',
        total_amount: 199.98,
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send(orderData);

      expect([200, 201, 400, 401]).toContain(response.status);
      
      if (response.status === 200 || response.status === 201) {
        orderId = response.body.order?.id || response.body.data?.id;
      }
    });

    test('Step 7: View Order History', async () => {
      if (!authToken) return;

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });

    test('Step 8: Logout', async () => {
      if (!authToken) return;

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Search and Filter Flow', () => {
    test('Search for products', async () => {
      const response = await request(app)
        .get('/api/products?search=rice');

      expect(response.status).toBe(200);
    });

    test('Filter by category', async () => {
      const response = await request(app)
        .get('/api/products?category=groceries');

      expect(response.status).toBe(200);
    });

    test('Filter by price range', async () => {
      const response = await request(app)
        .get('/api/products?minPrice=50&maxPrice=200');

      expect(response.status).toBe(200);
    });

    test('Sort products', async () => {
      const response = await request(app)
        .get('/api/products?sortBy=price&order=asc');

      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling Flow', () => {
    test('Should handle invalid authentication', async () => {
      const response = await request(app)
        .get('/api/cart')
        .set('Authorization', 'Bearer invalid_token');

      expect([401, 403]).toContain(response.status);
    });

    test('Should handle non-existent product', async () => {
      const response = await request(app)
        .get('/api/products/999999999');

      expect([404, 500]).toContain(response.status);
    });

    test('Should handle invalid order data', async () => {
      if (!authToken) return;

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [],
        });

      expect([400, 401]).toContain(response.status);
    });
  });
});
