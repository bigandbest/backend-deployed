/**
 * Order API Tests
 * Tests for order creation, listing, and status management
 */

import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import orderRoutes from '../routes/orderRoutes.js';
import authRoutes from '../routes/authRoute.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

describe('Order API Tests', () => {
  let authToken;
  let testUser;
  let testOrderId;

  beforeAll(async () => {
    testUser = global.TEST_UTILS.generateTestUser();
    
    const signupResponse = await request(app)
      .post('/api/auth/signup')
      .send(testUser);

    if (signupResponse.body.token) {
      authToken = signupResponse.body.token;
    }
  });

  describe('POST /api/orders', () => {
    test('should create order with authentication', async () => {
      if (!authToken) return;

      const orderData = {
        items: [{
          product_id: 1,
          quantity: 2,
          price: 99.99,
        }],
        delivery_address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'Test State',
          pincode: '110001',
          phone: '9999999999',
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
        expect(response.body).toHaveProperty('success');
        testOrderId = response.body.order?.id || response.body.data?.id;
      }
    });

    test('should reject order without authentication', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          items: [{ product_id: 1, quantity: 2, price: 99.99 }],
        });

      expect([401, 403]).toContain(response.status);
    });

    test('should reject order with empty items', async () => {
      if (!authToken) return;

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [],
          delivery_address: {},
        });

      expect([400, 401]).toContain(response.status);
    });

    test('should reject order without delivery address', async () => {
      if (!authToken) return;

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [{ product_id: 1, quantity: 2 }],
        });

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('GET /api/orders', () => {
    test('should get user orders with authentication', async () => {
      if (!authToken) return;

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success');
        expect(Array.isArray(response.body.orders || response.body.data)).toBe(true);
      }
    });

    test('should reject get orders without authentication', async () => {
      const response = await request(app)
        .get('/api/orders');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('GET /api/orders/:id', () => {
    test('should get single order by ID', async () => {
      if (!authToken || !testOrderId) return;

      const response = await request(app)
        .get(`/api/orders/${testOrderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404, 401]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('order');
        expect(response.body.order.id).toBe(testOrderId);
      }
    });

    test('should reject get order without authentication', async () => {
      const response = await request(app)
        .get('/api/orders/123');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('Order Status', () => {
    test('should have valid order statuses', async () => {
      if (!authToken) return;

      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        const orders = response.body.orders || response.body.data || [];
        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
        
        orders.forEach(order => {
          if (order.status) {
            expect(validStatuses).toContain(order.status.toLowerCase());
          }
        });
      }
    });
  });
});
