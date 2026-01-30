/**
 * K6 Load Test
 * Purpose: Test system under expected normal load
 * Run: k6 run k6-tests/load-test.js
 * Run with custom stages: k6 run -e BASE_URL=http://localhost:8000 k6-tests/load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, LOAD_STAGES, THRESHOLDS, HEADERS } from './config.js';
import { 
  checkedRequest, 
  parseJSON, 
  randomInt, 
  randomItem,
  sleepRandom 
} from './utils/helpers.js';

export const options = {
  stages: LOAD_STAGES.load,
  thresholds: THRESHOLDS,
};

// Simulated user scenarios
const scenarios = [
  'browse_products',
  'search_and_view',
  'category_browse',
  'brand_explore',
];

export default function () {
  const baseUrl = BASE_URL;
  const scenario = randomItem(scenarios);

  switch (scenario) {
    case 'browse_products':
      browseProducts(baseUrl);
      break;
    case 'search_and_view':
      searchAndView(baseUrl);
      break;
    case 'category_browse':
      categoryBrowse(baseUrl);
      break;
    case 'brand_explore':
      brandExplore(baseUrl);
      break;
  }

  sleepRandom(1, 3);
}

function browseProducts(baseUrl) {
  // Get products list
  const page = randomInt(1, 5);
  const limit = randomInt(10, 30);
  const products = http.get(`${baseUrl}/api/products?page=${page}&limit=${limit}`);
  
  if (checkedRequest(products, 'Browse products')) {
    const data = parseJSON(products);
    
    // View a random product detail
    if (data?.data?.products?.length > 0) {
      const product = randomItem(data.data.products);
      const detail = http.get(`${baseUrl}/api/products/${product.id}`);
      checkedRequest(detail, 'Product detail');
    }
  }
  
  sleep(1);
}

function searchAndView(baseUrl) {
  // Simulate search
  const searchTerms = ['rice', 'oil', 'flour', 'sugar', 'dal', 'masala'];
  const query = randomItem(searchTerms);
  
  const search = http.get(`${baseUrl}/api/search?query=${query}`);
  
  if (checkedRequest(search, 'Search products')) {
    const data = parseJSON(search);
    
    // View first result
    if (data?.data?.length > 0) {
      const productId = data.data[0].id;
      const detail = http.get(`${baseUrl}/api/products/${productId}`);
      checkedRequest(detail, 'Product from search');
    }
  }
  
  sleep(1);
}

function categoryBrowse(baseUrl) {
  // Get categories
  const categories = http.get(`${baseUrl}/api/categories`);
  
  if (checkedRequest(categories, 'Get categories')) {
    const data = parseJSON(categories);
    
    // Browse a random category
    if (data?.data?.length > 0) {
      const category = randomItem(data.data);
      const categoryProducts = http.get(`${baseUrl}/api/products?categoryId=${category.id}`);
      checkedRequest(categoryProducts, 'Category products');
    }
  }
  
  sleep(1);
}

function brandExplore(baseUrl) {
  // Get brands
  const brands = http.get(`${baseUrl}/api/brands`);
  
  if (checkedRequest(brands, 'Get brands')) {
    const data = parseJSON(brands);
    
    // Explore a random brand
    if (data?.data?.length > 0) {
      const brand = randomItem(data.data);
      const brandProducts = http.get(`${baseUrl}/api/brand-products/${brand.id}`);
      checkedRequest(brandProducts, 'Brand products');
    }
  }
  
  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'k6-tests/results/load-test-summary.json': JSON.stringify(data),
  };
}
