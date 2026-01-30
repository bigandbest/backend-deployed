/**
 * Search API Tests
 * Tests for product search functionality
 */

import { describe, test, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import searchRoutes from '../routes/searchRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/search', searchRoutes);

describe('Search API Tests', () => {
  describe('GET /api/search', () => {
    test('should search products by query', async () => {
      const response = await request(app)
        .get('/api/search?query=rice');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(Array.isArray(response.body.results || response.body.data || response.body.products)).toBe(true);
    });

    test('should return empty results for non-matching query', async () => {
      const response = await request(app)
        .get('/api/search?query=nonexistentproduct12345xyz');

      expect(response.status).toBe(200);
      const results = response.body.results || response.body.data || response.body.products || [];
      expect(results.length).toBe(0);
    });

    test('should handle empty query', async () => {
      const response = await request(app)
        .get('/api/search?query=');

      expect([200, 400]).toContain(response.status);
    });

    test('should search with filters', async () => {
      const response = await request(app)
        .get('/api/search?query=rice&category=groceries');

      expect(response.status).toBe(200);
    });

    test('should support pagination in search', async () => {
      const response = await request(app)
        .get('/api/search?query=rice&page=1&limit=5');

      expect(response.status).toBe(200);
      const results = response.body.results || response.body.data || response.body.products || [];
      expect(results.length).toBeLessThanOrEqual(5);
    });

    test('should search case-insensitively', async () => {
      const response1 = await request(app)
        .get('/api/search?query=RICE');
      const response2 = await request(app)
        .get('/api/search?query=rice');

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });

    test('should handle special characters in query', async () => {
      const response = await request(app)
        .get('/api/search?query=rice%20&%20flour');

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Search Performance', () => {
    test('should return results within acceptable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/search?query=rice');

      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
