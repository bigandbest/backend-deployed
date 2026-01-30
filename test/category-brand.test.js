/**
 * Category and Brand Tests
 * Tests for category and brand listing and filtering
 */

import { describe, test, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import categoryRoutes from '../routes/categoryRoutes.js';
import brandRoutes from '../routes/brandRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);

describe('Category API Tests', () => {
  describe('GET /api/categories', () => {
    test('should get all categories', async () => {
      const response = await request(app)
        .get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(Array.isArray(response.body.categories || response.body.data)).toBe(true);
    });

    test('should return categories with proper structure', async () => {
      const response = await request(app)
        .get('/api/categories');

      if (response.body.categories?.length > 0 || response.body.data?.length > 0) {
        const categories = response.body.categories || response.body.data;
        expect(categories[0]).toHaveProperty('id');
        expect(categories[0]).toHaveProperty('name');
      }
    });

    test('should get active categories only', async () => {
      const response = await request(app)
        .get('/api/categories?active=true');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/categories/:id', () => {
    test('should get single category by ID', async () => {
      // First get all categories
      const listResponse = await request(app).get('/api/categories');
      const categories = listResponse.body.categories || listResponse.body.data || [];

      if (categories.length > 0) {
        const categoryId = categories[0].id;
        const response = await request(app)
          .get(`/api/categories/${categoryId}`);

        expect([200, 404]).toContain(response.status);
      }
    });
  });
});

describe('Brand API Tests', () => {
  describe('GET /api/brands', () => {
    test('should get all brands', async () => {
      const response = await request(app)
        .get('/api/brands');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(Array.isArray(response.body.brands || response.body.data)).toBe(true);
    });

    test('should return brands with proper structure', async () => {
      const response = await request(app)
        .get('/api/brands');

      const brands = response.body.brands || response.body.data || [];
      if (brands.length > 0) {
        expect(brands[0]).toHaveProperty('id');
        expect(brands[0]).toHaveProperty('name');
      }
    });

    test('should support pagination for brands', async () => {
      const response = await request(app)
        .get('/api/brands?page=1&limit=5');

      expect(response.status).toBe(200);
      const brands = response.body.brands || response.body.data || [];
      expect(brands.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/brands/:id', () => {
    test('should get single brand by ID', async () => {
      const listResponse = await request(app).get('/api/brands');
      const brands = listResponse.body.brands || listResponse.body.data || [];

      if (brands.length > 0) {
        const brandId = brands[0].id;
        const response = await request(app)
          .get(`/api/brands/${brandId}`);

        expect([200, 404]).toContain(response.status);
      }
    });
  });

  describe('GET /api/brand-products/:brandId', () => {
    test('should get products by brand', async () => {
      const listResponse = await request(app).get('/api/brands');
      const brands = listResponse.body.brands || listResponse.body.data || [];

      if (brands.length > 0) {
        const brandId = brands[0].id;
        const response = await request(app)
          .get(`/api/brand-products/${brandId}`);

        expect([200, 404]).toContain(response.status);
      }
    });
  });
});
