/**
 * K6 API Endpoints Test
 * Purpose: Test individual API endpoints with proper authentication
 * Run: k6 run k6-tests/api-endpoints-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, HEADERS } from './config.js';
import { checkedRequest, parseJSON, generateUserData, extractToken } from './utils/helpers.js';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000'],
    'http_req_failed': ['rate<0.01'],
    'group_duration{group:::Public APIs}': ['avg<500'],
  },
};

export default function () {
  const baseUrl = BASE_URL;
  let authToken = null;

  // Public API Tests
  group('Public APIs', () => {
    // Health check
    group('Health Check', () => {
      const res = http.get(`${baseUrl}/api/test`);
      checkedRequest(res, 'API health check');
    });
    sleep(0.5);

    // Products
    group('Products', () => {
      const res = http.get(`${baseUrl}/api/products?page=1&limit=10`);
      if (checkedRequest(res, 'Get products')) {
        const data = parseJSON(res);
        
        // Test product detail if products exist
        if (data?.data?.products?.length > 0) {
          const productId = data.data.products[0].id;
          const detailRes = http.get(`${baseUrl}/api/products/${productId}`);
          checkedRequest(detailRes, 'Get product detail');
        }
      }
    });
    sleep(0.5);

    // Categories
    group('Categories', () => {
      const res = http.get(`${baseUrl}/api/categories`);
      checkedRequest(res, 'Get categories');
    });
    sleep(0.5);

    // Brands
    group('Brands', () => {
      const res = http.get(`${baseUrl}/api/brands`);
      checkedRequest(res, 'Get brands');
    });
    sleep(0.5);

    // Daily Deals
    group('Daily Deals', () => {
      const res = http.get(`${baseUrl}/api/daily-deals`);
      checkedRequest(res, 'Get daily deals');
    });
    sleep(0.5);

    // Search
    group('Search', () => {
      const res = http.get(`${baseUrl}/api/search?query=rice`);
      checkedRequest(res, 'Search products');
    });
    sleep(0.5);

    // Locations
    group('Locations', () => {
      const res = http.get(`${baseUrl}/api/locations`);
      checkedRequest(res, 'Get locations');
    });
    sleep(0.5);
  });

  // Note: Authentication tests require valid credentials
  // Uncomment and modify when testing with real accounts
  
  /*
  group('Authentication', () => {
    group('Register', () => {
      const userData = generateUserData();
      const res = http.post(
        `${baseUrl}/api/auth/register`,
        JSON.stringify(userData),
        { headers: HEADERS }
      );
      
      if (res.status === 201 || res.status === 200) {
        authToken = extractToken(res);
      }
    });
    sleep(1);

    group('Login', () => {
      const credentials = {
        email: 'testuser@example.com',
        password: 'Test@123456',
      };
      
      const res = http.post(
        `${baseUrl}/api/auth/login`,
        JSON.stringify(credentials),
        { headers: HEADERS }
      );
      
      if (res.status === 200) {
        authToken = extractToken(res);
      }
    });
  });

  // Authenticated API Tests
  if (authToken) {
    const authHeaders = {
      ...HEADERS,
      'Authorization': `Bearer ${authToken}`,
    };

    group('Authenticated APIs', () => {
      group('Profile', () => {
        const res = http.get(`${baseUrl}/api/profile`, { headers: authHeaders });
        checkedRequest(res, 'Get profile');
      });
      sleep(0.5);

      group('Cart', () => {
        const res = http.get(`${baseUrl}/api/cart`, { headers: authHeaders });
        checkedRequest(res, 'Get cart');
      });
      sleep(0.5);

      group('Wishlist', () => {
        const res = http.get(`${baseUrl}/api/wishlist`, { headers: authHeaders });
        checkedRequest(res, 'Get wishlist');
      });
      sleep(0.5);
    });
  }
  */

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'k6-tests/results/api-endpoints-test-summary.json': JSON.stringify(data),
  };
}
