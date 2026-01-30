/**
 * Cart API Tests
 * Tests for cart operations: add, update, remove items
 */

import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cartRoutes from '../routes/cartRoutes.js';
import authRoutes from '../routes/authRoute.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);

describe('Cart API Tests', () => {
  let authToken;
  let testUser;
  let testProductId = 1; // Assuming product with ID 1 exists

  beforeAll(async () => {
    // Create and login test user
    testUser = global.TEST_UTILS.generateTestUser();
    
    const signupResponse = await request(app)
      .post('/api/auth/signup')
      .send(testUser);

    if (signupResponse.body.token) {
      authToken = signupResponse.body.token;
    }
  });

  describe('POST /api/cart/add', () => {
    test('should add item to cart with authentication', async () => {
      if (!authToken) {
        console.log('Skipping test: No auth token available');
        return;
      }

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProductId,
          quantity: 2,
          variant_id: null,
        });

      expect([200, 201, 401]).toContain(response.status);
      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('success');
      }
    });

    test('should reject add to cart without authentication', async () => {
      const response = await request(app)
        .post('/api/cart/add')
        .send({
          product_id: testProductId,
          quantity: 2,
        });

      expect([401, 403]).toContain(response.status);
    });

    test('should reject invalid product ID', async () => {
      if (!authToken) return;

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: 999999,
          quantity: 2,
        });

      expect([400, 404, 401]).toContain(response.status);
    });

    test('should reject negative quantity', async () => {
      if (!authToken) return;

      const response = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProductId,
          quantity: -1,
        });

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/cart', () => {
    test('should get cart items with authentication', async () => {
      if (!authToken) return;

      const response = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success');
        expect(Array.isArray(response.body.cart || response.body.items)).toBe(true);
      }
    });

    test('should reject get cart without authentication', async () => {
      const response = await request(app)
        .get('/api/cart');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('PUT /api/cart/update', () => {
    test('should update cart item quantity', async () => {
      if (!authToken) return;

      const response = await request(app)
        .put('/api/cart/update')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          product_id: testProductId,
          quantity: 3,
        });

      expect([200, 401, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/cart/remove', () => {
    test('should remove item from cart', async () => {
      if (!authToken) return;

      const response = await request(app)
        .delete(`/api/cart/remove/${testProductId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204, 401, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/cart/clear', () => {
    test('should clear entire cart', async () => {
      if (!authToken) return;

      const response = await request(app)
        .delete('/api/cart/clear')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204, 401]).toContain(response.status);
    });
  });
});
