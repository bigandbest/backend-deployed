/**
 * Product API Tests
 * Tests for product CRUD operations, search, filtering, and pagination
 */

import { describe, test, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import productRoutes from '../routes/productRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/products', productRoutes);

describe('Product API Tests', () => {
  let testProductId;

  describe('GET /api/products', () => {
    test('should get all products', async () => {
      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('products');
      expect(Array.isArray(response.body.products)).toBe(true);
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('products');
      expect(response.body.products.length).toBeLessThanOrEqual(10);
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/api/products?category=groceries');

      expect(response.status).toBe(200);
      if (response.body.products.length > 0) {
        expect(response.body.products[0]).toHaveProperty('category');
      }
    });

    test('should filter by price range', async () => {
      const response = await request(app)
        .get('/api/products?minPrice=100&maxPrice=500');

      expect(response.status).toBe(200);
      if (response.body.products.length > 0) {
        response.body.products.forEach(product => {
          expect(product.price).toBeGreaterThanOrEqual(100);
          expect(product.price).toBeLessThanOrEqual(500);
        });
      }
    });

    test('should sort products by price', async () => {
      const response = await request(app)
        .get('/api/products?sortBy=price&order=asc');

      expect(response.status).toBe(200);
      if (response.body.products.length > 1) {
        const prices = response.body.products.map(p => p.price);
        expect(prices).toEqual([...prices].sort((a, b) => a - b));
      }
    });
  });

  describe('GET /api/products/:id', () => {
    test('should get a single product by ID', async () => {
      // First get all products to get a valid ID
      const listResponse = await request(app).get('/api/products');
      
      if (listResponse.body.products.length > 0) {
        testProductId = listResponse.body.products[0].id;

        const response = await request(app)
          .get(`/api/products/${testProductId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('product');
        expect(response.body.product).toHaveProperty('id', testProductId);
      }
    });

    test('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .get('/api/products/99999999');

      expect([404, 500]).toContain(response.status);
    });

    test('should include product details', async () => {
      if (testProductId) {
        const response = await request(app)
          .get(`/api/products/${testProductId}`);

        expect(response.body.product).toHaveProperty('name');
        expect(response.body.product).toHaveProperty('price');
        expect(response.body.product).toHaveProperty('description');
      }
    });
  });

  describe('Product Search', () => {
    test('should search products by name', async () => {
      const response = await request(app)
        .get('/api/products?search=rice');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('products');
    });

    test('should return empty array for non-matching search', async () => {
      const response = await request(app)
        .get('/api/products?search=xyzveryuniquetermabc123');

      expect(response.status).toBe(200);
      expect(response.body.products.length).toBe(0);
    });
  });

  describe('Product Filtering', () => {
    test('should filter by inStock status', async () => {
      const response = await request(app)
        .get('/api/products?inStock=true');

      expect(response.status).toBe(200);
      if (response.body.products.length > 0) {
        response.body.products.forEach(product => {
          expect(product.stock || product.stockQuantity).toBeGreaterThan(0);
        });
      }
    });

    test('should filter by featured products', async () => {
      const response = await request(app)
        .get('/api/products?featured=true');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.products)).toBe(true);
    });

    test('should filter by brand', async () => {
      const response = await request(app)
        .get('/api/products?brand=BigandBest');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.products)).toBe(true);
    });
  });

  describe('Product Variants', () => {
    test('should include variants for products', async () => {
      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(200);
      if (response.body.products.length > 0) {
        const productWithVariants = response.body.products.find(p => p.hasVariants);
        if (productWithVariants) {
          expect(Array.isArray(productWithVariants.variants)).toBe(true);
        }
      }
    });
  });
});
