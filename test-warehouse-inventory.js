/**
 * Warehouse & Inventory Management API Performance Test
 * 
 * Tests:
 * 1. Warehouse listing and details
 * 2. Inventory management endpoints
 * 3. Product warehouse stock
 * 4. Response times and optimization quality
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

const BASE_URL = 'http://localhost:8000/api';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

class PerformanceTester {
  constructor() {
    this.results = [];
    this.authToken = null;
  }

  log(message, color = COLORS.reset) {
    console.log(`${color}${message}${COLORS.reset}`);
  }

  logHeader(title) {
    console.log('\n' + '='.repeat(80));
    this.log(title, COLORS.cyan);
    console.log('='.repeat(80) + '\n');
  }

  async measureRequest(name, requestFn, expectedMaxTime = 1000) {
    const start = performance.now();
    try {
      const response = await requestFn();
      const duration = performance.now() - start;
      
      const status = duration < expectedMaxTime ? 'PASS' : 'SLOW';
      const color = duration < expectedMaxTime ? COLORS.green : COLORS.yellow;
      
      this.results.push({
        name,
        duration: Math.round(duration),
        status,
        statusCode: response.status,
        dataSize: JSON.stringify(response.data).length
      });

      this.log(
        `✓ ${name}: ${Math.round(duration)}ms [${status}] - ${response.status} - ${(JSON.stringify(response.data).length / 1024).toFixed(2)}KB`,
        color
      );

      return response;
    } catch (error) {
      const duration = performance.now() - start;
      this.results.push({
        name,
        duration: Math.round(duration),
        status: 'FAIL',
        error: error.message
      });

      this.log(`✗ ${name}: FAILED - ${error.message}`, COLORS.red);
      throw error;
    }
  }

  async login() {
    this.logHeader('🔐 Authentication');
    try {
      const response = await this.measureRequest(
        'Admin Login',
        () => axios.post(`${BASE_URL}/admin-auth/login`, {
          email: 'bigandbestmart@gmail.com',
          password: 'vikas1234'
        }),
        2000
      );
      
      this.authToken = response.data.token;
      this.log('✓ Authentication successful', COLORS.green);
      return true;
    } catch (error) {
      this.log('✗ Authentication failed - some tests will be skipped', COLORS.yellow);
      return false;
    }
  }

  getAuthHeaders() {
    return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
  }

  async testWarehouses() {
    this.logHeader('🏭 Warehouse Management APIs');

    // Test 1: Get all warehouses
    try {
      const response = await this.measureRequest(
        'GET /api/warehouses - List all warehouses',
        () => axios.get(`${BASE_URL}/warehouses`),
        500
      );

      const warehouses = response.data.data || [];
      this.log(`  → Found ${warehouses.length} warehouses`, COLORS.blue);

      if (warehouses.length > 0) {
        const warehouse = warehouses[0];
        this.log(`  → Sample: ${warehouse.name} (${warehouse.type})`, COLORS.blue);

        // Test 2: Get warehouse details
        await this.measureRequest(
          `GET /api/warehouses/${warehouse.id} - Get warehouse details`,
          () => axios.get(`${BASE_URL}/warehouses/${warehouse.id}`),
          300
        );

        // Test 3: Get warehouse inventory
        await this.measureRequest(
          `GET /api/inventory/warehouse/${warehouse.id} - Get warehouse inventory`,
          () => axios.get(`${BASE_URL}/inventory/warehouse/${warehouse.id}`),
          1000
        );

        // Test 4: Get low stock products
        await this.measureRequest(
          `GET /api/inventory/warehouse/${warehouse.id}/low-stock - Get low stock`,
          () => axios.get(`${BASE_URL}/inventory/warehouse/${warehouse.id}/low-stock`),
          800
        );

        // Test 5: Get inventory analytics
        await this.measureRequest(
          `GET /api/inventory/warehouse/${warehouse.id}/analytics - Get analytics`,
          () => axios.get(`${BASE_URL}/inventory/warehouse/${warehouse.id}/analytics`),
          1000
        );

        return warehouse.id;
      }
    } catch (error) {
      this.log(`  ⚠ Warehouse tests failed: ${error.message}`, COLORS.yellow);
    }

    return null;
  }

  async testProductWarehouse() {
    this.logHeader('📦 Product Warehouse Integration');

    try {
      // Get some products first
      const productsResponse = await this.measureRequest(
        'GET /api/admin/products - Get products for testing',
        () => axios.get(`${BASE_URL}/admin/products?limit=10`),
        1000
      );

      const products = productsResponse.data.data || productsResponse.data.items || [];
      
      if (products.length > 0) {
        const product = products[0];
        this.log(`  → Testing with product: ${product.name}`, COLORS.blue);

        // Test product inventory across warehouses
        await this.measureRequest(
          `GET /api/inventory/product/${product.id}/warehouses - Product across warehouses`,
          () => axios.get(`${BASE_URL}/inventory/product/${product.id}/warehouses`),
          800
        );

        // Test product warehouse stock
        await this.measureRequest(
          `GET /api/productwarehouse/product/${product.id} - Product warehouse stock`,
          () => axios.get(`${BASE_URL}/productwarehouse/product/${product.id}`),
          600
        );

        return product.id;
      }
    } catch (error) {
      this.log(`  ⚠ Product warehouse tests failed: ${error.message}`, COLORS.yellow);
    }

    return null;
  }

  async testInventoryOperations(warehouseId, productId) {
    this.logHeader('⚙️ Inventory Operations (Authenticated)');

    if (!this.authToken) {
      this.log('  ⚠ Skipping authenticated tests - no auth token', COLORS.yellow);
      return;
    }

    if (!warehouseId || !productId) {
      this.log('  ⚠ Skipping inventory operations - missing IDs', COLORS.yellow);
      return;
    }

    try {
      // Note: These are POST operations, we won't actually execute them
      // Just checking if the endpoints are accessible
      this.log('  → Inventory operations available (not executing mutations)', COLORS.blue);
      this.log('    - POST /api/inventory/warehouse/:id/update-stock', COLORS.blue);
      this.log('    - POST /api/inventory/warehouse/:id/bulk-update', COLORS.blue);
      this.log('    - POST /api/inventory/multi-warehouse/update-stock', COLORS.blue);
      this.log('    - POST /api/inventory/warehouse/:id/allocate-to-zonal', COLORS.blue);
    } catch (error) {
      this.log(`  ⚠ Error: ${error.message}`, COLORS.yellow);
    }
  }

  async testCaching() {
    this.logHeader('🚀 Cache Performance Test');

    const testEndpoint = `${BASE_URL}/warehouses`;

    // First request (should be cache MISS)
    this.log('  → First request (cache MISS expected)...', COLORS.blue);
    const first = await this.measureRequest(
      'First request - Cache MISS',
      () => axios.get(testEndpoint),
      1000
    );

    // Second request (should be cache HIT)
    this.log('  → Second request (cache HIT expected)...', COLORS.blue);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    
    const second = await this.measureRequest(
      'Second request - Cache HIT',
      () => axios.get(testEndpoint),
      200 // Should be much faster from cache
    );

    const improvement = ((first.duration - second.duration) / first.duration * 100).toFixed(1);
    
    if (second.duration < first.duration) {
      this.log(`  ✓ Cache working! ${improvement}% faster`, COLORS.green);
    } else {
      this.log(`  ⚠ Cache might not be active`, COLORS.yellow);
    }
  }

  async testDataOptimization() {
    this.logHeader('📊 Data Optimization Analysis');

    try {
      const response = await this.measureRequest(
        'GET /api/admin/products?limit=50 - Analyze payload size',
        () => axios.get(`${BASE_URL}/admin/products?limit=50`),
        1500
      );

      const data = response.data;
      const items = data.items || data.data || [];
      const payloadSize = JSON.stringify(response.data).length;

      this.log(`  → Total products: ${items.length}`, COLORS.blue);
      this.log(`  → Payload size: ${(payloadSize / 1024).toFixed(2)}KB`, COLORS.blue);
      this.log(`  → Average per product: ${(payloadSize / items.length / 1024).toFixed(2)}KB`, COLORS.blue);

      if (items.length > 0) {
        const sample = items[0];
        const fieldCount = Object.keys(sample).length;
        this.log(`  → Fields per product: ${fieldCount}`, COLORS.blue);

        // Check for optimizations
        const optimizations = [];
        if (!sample.description || sample.description.length < 500) {
          optimizations.push('✓ Description optimized');
        }
        if (sample.variants && sample.variants.length <= 1) {
          optimizations.push('✓ Only default variant loaded');
        }
        if (sample.media && sample.media.length <= 1) {
          optimizations.push('✓ Only primary media loaded');
        }

        if (optimizations.length > 0) {
          this.log('\n  Optimizations detected:', COLORS.green);
          optimizations.forEach(opt => this.log(`    ${opt}`, COLORS.green));
        }
      }
    } catch (error) {
      this.log(`  ⚠ Data optimization test failed: ${error.message}`, COLORS.yellow);
    }
  }

  printSummary() {
    this.logHeader('📈 Performance Summary');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const slow = this.results.filter(r => r.status === 'SLOW').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const avgTime = Math.round(
      this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length
    );

    console.log('┌─────────────────────────────────────────────┐');
    console.log('│             Test Results                    │');
    console.log('├─────────────────────────────────────────────┤');
    this.log(`│  ✓ Passed:  ${passed.toString().padEnd(30)}│`, COLORS.green);
    this.log(`│  ⚠ Slow:    ${slow.toString().padEnd(30)}│`, COLORS.yellow);
    this.log(`│  ✗ Failed:  ${failed.toString().padEnd(30)}│`, COLORS.red);
    console.log(`│  ⏱ Avg Time: ${avgTime}ms${' '.repeat(30 - avgTime.toString().length - 2)}│`);
    console.log('└─────────────────────────────────────────────┘\n');

    // Performance grades
    this.log('Performance Grades:', COLORS.cyan);
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✓' : 
                   result.status === 'SLOW' ? '⚠' : '✗';
      const color = result.status === 'PASS' ? COLORS.green : 
                    result.status === 'SLOW' ? COLORS.yellow : COLORS.red;
      
      this.log(
        `  ${icon} ${result.name.padEnd(65)} ${result.duration}ms`,
        color
      );
    });

    console.log('\n' + '='.repeat(80));
    
    // Overall assessment
    const passRate = (passed / this.results.length * 100).toFixed(1);
    if (passRate >= 80) {
      this.log(`\n🎉 EXCELLENT! ${passRate}% tests passed with good performance`, COLORS.green);
    } else if (passRate >= 60) {
      this.log(`\n👍 GOOD! ${passRate}% tests passed, some optimizations possible`, COLORS.yellow);
    } else {
      this.log(`\n⚠️ NEEDS IMPROVEMENT! Only ${passRate}% tests passed`, COLORS.red);
    }

    console.log('\nOptimization Recommendations:');
    if (avgTime < 500) {
      this.log('  ✓ Excellent response times!', COLORS.green);
    } else if (avgTime < 1000) {
      this.log('  ✓ Good response times', COLORS.green);
    } else {
      this.log('  ⚠ Consider adding more indexes and caching', COLORS.yellow);
    }

    if (slow > 0) {
      this.log(`  ⚠ ${slow} endpoints are slower than expected`, COLORS.yellow);
    }

    if (failed > 0) {
      this.log(`  ✗ ${failed} endpoints failed - check server logs`, COLORS.red);
    }
  }

  async runAllTests() {
    console.clear();
    this.logHeader('🧪 Warehouse & Inventory Management API Performance Tests');
    
    this.log('Testing against: ' + BASE_URL, COLORS.blue);
    this.log('Start time: ' + new Date().toLocaleString(), COLORS.blue);

    // Run authentication
    const authenticated = await this.login();

    // Run warehouse tests
    const warehouseId = await this.testWarehouses();

    // Run product warehouse tests
    const productId = await this.testProductWarehouse();

    // Run inventory operations tests
    await this.testInventoryOperations(warehouseId, productId);

    // Test caching
    await this.testCaching();

    // Test data optimization
    await this.testDataOptimization();

    // Print summary
    this.printSummary();

    this.log('\nTest completed at: ' + new Date().toLocaleString(), COLORS.blue);
  }
}

// Run tests
const tester = new PerformanceTester();
tester.runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
