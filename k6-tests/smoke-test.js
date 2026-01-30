/**
 * K6 Smoke Test
 * Purpose: Verify basic functionality with minimal load (1 user)
 * Run: k6 run k6-tests/smoke-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, LOAD_STAGES, THRESHOLDS, HEADERS } from './config.js';
import { checkedRequest, parseJSON } from './utils/helpers.js';

export const options = {
  stages: LOAD_STAGES.smoke,
  thresholds: THRESHOLDS,
};

export default function () {
  const baseUrl = BASE_URL;

  // Test 1: Health check
  const healthCheck = http.get(`${baseUrl}/api/test`);
  checkedRequest(healthCheck, 'Health check');
  sleep(1);

  // Test 2: Get products
  const products = http.get(`${baseUrl}/api/products`);
  checkedRequest(products, 'Get products');
  sleep(1);

  // Test 3: Get categories
  const categories = http.get(`${baseUrl}/api/categories`);
  checkedRequest(categories, 'Get categories');
  sleep(1);

  // Test 4: Get brands
  const brands = http.get(`${baseUrl}/api/brands`);
  checkedRequest(brands, 'Get brands');
  sleep(1);

  // Test 5: Search products (if product exists)
  const productsData = parseJSON(products);
  if (productsData?.data?.products?.length > 0) {
    const searchQuery = productsData.data.products[0].name?.substring(0, 5);
    const search = http.get(`${baseUrl}/api/search?query=${searchQuery}`);
    checkedRequest(search, 'Search products');
    sleep(1);
  }
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'k6-tests/results/smoke-test-summary.json': JSON.stringify(data),
  };
}
