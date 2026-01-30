# Testing Guide - Vitest, Supertest & k6

Complete testing setup using **Vitest** for unit/integration tests, **Supertest** for API testing, and **k6** for load testing.

## 🧪 Testing Stack

- **Vitest** - Fast unit test framework (Vite-powered)
- **Supertest** - HTTP assertion library for API testing
- **k6** - Modern load testing tool

## 📦 Installation

```bash
# Install all dependencies
npm install

# Vitest, Supertest, and coverage tools are in devDependencies
```

## 🚀 Running Tests

### Vitest Unit & Integration Tests

```bash
# Run all tests
npm test
# or
npm run test:all

# Run tests in watch mode (auto-rerun on changes)
npm run test:watch

# Run tests with UI (browser interface)
npm run test:ui

# Run specific test suites
npm run test:auth          # Authentication tests
npm run test:product       # Product tests
npm run test:cart          # Cart tests
npm run test:order         # Order tests
npm run test:integration   # Integration tests
npm run test:wallet        # Wallet tests

# Run with coverage report
npm run test:coverage
```

### k6 Load Tests

```bash
# Quick smoke test (1 user, 30s)
npm run k6:smoke

# Load test (10 users, 9min)
npm run k6:load

# Stress test (50 users, 16min)
npm run k6:stress

# Spike test (100 users, 1.5min)
npm run k6:spike

# API endpoints test (5 users, 2min)
npm run k6:api

# Run all k6 tests
npm run k6:all
```

## 📁 Project Structure

```
backend-deployed/
├── test/                          # Vitest unit & integration tests
│   ├── setup.test.js             # Test configuration
│   ├── auth.test.js              # Authentication tests
│   ├── product.test.js           # Product tests
│   ├── cart.test.js              # Cart tests
│   ├── order.test.js             # Order tests
│   ├── category-brand.test.js    # Category & brand tests
│   ├── search.test.js            # Search tests
│   ├── inventory.test.js         # Inventory tests
│   ├── integration.test.js       # E2E tests
│   └── wallet.test.js            # Wallet tests
├── k6-tests/                      # k6 load tests
│   ├── config.js                 # Load test configuration
│   ├── smoke-test.js             # Basic functionality
│   ├── load-test.js              # Normal load
│   ├── stress-test.js            # High load
│   ├── spike-test.js             # Sudden spikes
│   ├── api-endpoints-test.js     # API testing
│   ├── run-tests.sh              # Test runner script
│   └── utils/helpers.js          # Test utilities
├── vitest.config.js               # Vitest configuration
└── package.json                   # Scripts & dependencies
```

## ⚙️ Configuration

### Vitest Configuration ([vitest.config.js](vitest.config.js))

```javascript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.test.js'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

### k6 Configuration ([k6-tests/config.js](k6-tests/config.js))

Centralized configuration for load stages, thresholds, and headers.

## 🧪 Test Categories

### 1. Unit Tests (Vitest + Supertest)

**Authentication** ([test/auth.test.js](test/auth.test.js))
- ✅ User signup with validation
- ✅ User login (correct/incorrect credentials)
- ✅ Token generation and validation
- ✅ Logout functionality
- ✅ Error handling

**Products** ([test/product.test.js](test/product.test.js))
- ✅ List products with pagination
- ✅ Filter by category, brand, price
- ✅ Sort products
- ✅ Get product details
- ✅ Product variants
- ✅ Search functionality

**Cart** ([test/cart.test.js](test/cart.test.js))
- ✅ Add items to cart
- ✅ Update quantities
- ✅ Remove items
- ✅ Clear cart
- ✅ Authentication required
- ✅ Validation

**Orders** ([test/order.test.js](test/order.test.js))
- ✅ Create orders
- ✅ Order history
- ✅ Order details
- ✅ Status validation
- ✅ Address validation

### 2. Integration Tests (Vitest + Supertest)

**Complete User Flows** ([test/integration.test.js](test/integration.test.js))
- ✅ Register → Browse → Add to Cart → Checkout → Order
- ✅ Search → Filter → View → Purchase
- ✅ Error handling flows

### 3. Load Tests (k6)

**Smoke Test** - Verify basic functionality
- 1 user for 30 seconds
- Ensures system works

**Load Test** - Normal expected load
- 0→10 users over 9 minutes
- Simulates real user behavior

**Stress Test** - Beyond normal load
- 0→50 users with spikes
- Finds breaking points

**Spike Test** - Sudden traffic surges
- Instant spike to 100 users
- Tests system resilience

## 📊 Test Results

### Vitest Output

```bash
✓ test/auth.test.js (8 tests) 1234ms
✓ test/product.test.js (12 tests) 2345ms
✓ test/cart.test.js (6 tests) 987ms

Test Files  8 passed (8)
     Tests  45 passed (45)
  Start at  10:30:45
  Duration  8.92s
```

### k6 Output

```bash
✓ http_req_duration............: avg=245ms p(95)=456ms
✓ http_req_failed..............: 0.12%
✓ iterations...................: 1600

running (09m00s), 0/10 VUs, 1600 complete
```

## 🎯 Writing Tests

### Vitest Test Template

```javascript
import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

const app = express();
app.use(express.json());

describe('Feature Tests', () => {
  beforeAll(async () => {
    // Setup
  });

  test('should work correctly', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
  });
});
```

### k6 Test Template

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:8000/api/endpoint');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
```

## 📈 Coverage Reports

Generate coverage with:

```bash
npm run test:coverage
```

Coverage files are generated in `/coverage` directory:
- `coverage/index.html` - Open in browser for visual report
- `coverage/lcov.info` - For CI/CD tools

Target coverage:
- Statements: >70%
- Branches: >60%
- Functions: >70%

## 🔍 Debugging Tests

### Vitest Debugging

```bash
# Run single test file
npm run test auth.test.js

# Run with console output
npm run test -- --reporter=verbose

# Run tests matching pattern
npm run test -- --grep="should login"
```

### k6 Debugging

```bash
# Run with verbose HTTP logging
k6 run --http-debug k6-tests/smoke-test.js

# Override base URL
k6 run -e BASE_URL=http://staging-api.com k6-tests/load-test.js
```

## 🚦 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:all
      - run: npm run test:coverage
      - run: npm run k6:smoke
```

## 🛠️ Troubleshooting

### Vitest Issues

**Issue**: Tests timeout
**Solution**: Increase timeout in `vitest.config.js` or specific test

**Issue**: Module import errors
**Solution**: Check `type: "module"` in package.json

### k6 Issues

**Issue**: Connection refused
**Solution**: Ensure server is running on correct port

**Issue**: High error rates
**Solution**: Check server resources, database connections

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [k6 Documentation](https://k6.io/docs/)
- [k6 Test Types](https://k6.io/docs/test-types/)

## 🎨 Best Practices

1. ✅ **Keep tests isolated** - Each test should be independent
2. ✅ **Use descriptive names** - Test names should explain what they test
3. ✅ **Test both success and failure** - Cover happy path and edge cases
4. ✅ **Clean up after tests** - Remove test data when done
5. ✅ **Use fixtures** - Reuse test data with global.TEST_UTILS
6. ✅ **Mock external services** - Don't depend on external APIs
7. ✅ **Run tests before commits** - Catch issues early
8. ✅ **Monitor coverage** - Aim for meaningful coverage
9. ✅ **Load test staging first** - Never surprise production
10. ✅ **Document test scenarios** - Help others understand tests

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start your server (in one terminal)
npm start

# 3. Run unit tests (in another terminal)
npm test

# 4. Run load tests
npm run k6:smoke

# 5. View coverage
npm run test:coverage
open coverage/index.html
```

---

**Happy Testing!** 🧪✨
