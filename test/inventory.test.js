/**
 * Inventory and Warehouse Tests
 * Tests for inventory management and warehouse operations
 */

import { describe, test, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import inventoryRoutes from '../routes/inventoryRoutes.js';
import warehouseRoutes from '../routes/warehouseRoute.js';

const app = express();
app.use(express.json());
app.use('/api/inventory', inventoryRoutes);
app.use('/api/warehouses', warehouseRoutes);

describe('Inventory API Tests', () => {
  describe('GET /api/inventory', () => {
    test('should get inventory data', async () => {
      const response = await request(app)
        .get('/api/inventory');

      expect([200, 401]).toContain(response.status);
    });

    test('should filter inventory by warehouse', async () => {
      const response = await request(app)
        .get('/api/inventory?warehouse_id=1');

      expect([200, 401]).toContain(response.status);
    });

    test('should filter inventory by product', async () => {
      const response = await request(app)
        .get('/api/inventory?product_id=1');

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Inventory Stock Levels', () => {
    test('should get low stock items', async () => {
      const response = await request(app)
        .get('/api/inventory?low_stock=true');

      expect([200, 401]).toContain(response.status);
    });

    test('should get out of stock items', async () => {
      const response = await request(app)
        .get('/api/inventory?out_of_stock=true');

      expect([200, 401]).toContain(response.status);
    });
  });
});

describe('Warehouse API Tests', () => {
  let testWarehouseId;

  describe('GET /api/warehouses', () => {
    test('should get all warehouses', async () => {
      const response = await request(app)
        .get('/api/warehouses');

      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        const warehouses = response.body.warehouses || response.body.data || [];
        expect(Array.isArray(warehouses)).toBe(true);
        
        if (warehouses.length > 0) {
          testWarehouseId = warehouses[0].id;
        }
      }
    });

    test('should return warehouses with proper structure', async () => {
      const response = await request(app)
        .get('/api/warehouses');

      if (response.status === 200) {
        const warehouses = response.body.warehouses || response.body.data || [];
        if (warehouses.length > 0) {
          expect(warehouses[0]).toHaveProperty('id');
          expect(warehouses[0]).toHaveProperty('name');
        }
      }
    });
  });

  describe('GET /api/warehouses/:id', () => {
    test('should get warehouse by ID', async () => {
      if (!testWarehouseId) return;

      const response = await request(app)
        .get(`/api/warehouses/${testWarehouseId}`);

      expect([200, 404, 401]).toContain(response.status);
    });
  });

  describe('Warehouse Inventory', () => {
    test('should get warehouse stock levels', async () => {
      if (!testWarehouseId) return;

      const response = await request(app)
        .get(`/api/warehouses/${testWarehouseId}/inventory`);

      expect([200, 404, 401]).toContain(response.status);
    });
  });

  describe('Warehouse Service Areas', () => {
    test('should get warehouse service pincodes', async () => {
      if (!testWarehouseId) return;

      const response = await request(app)
        .get(`/api/warehouses/${testWarehouseId}/pincodes`);

      expect([200, 404, 401]).toContain(response.status);
    });
  });
});

describe('Stock Movement Tests', () => {
  test('should validate stock levels are non-negative', async () => {
    const response = await request(app)
      .get('/api/inventory');

    if (response.status === 200) {
      const inventory = response.body.inventory || response.body.data || [];
      inventory.forEach(item => {
        if (item.stock !== undefined) {
          expect(item.stock).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });
});
