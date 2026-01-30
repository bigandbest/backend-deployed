/**
 * K6 Stress Test
 * Purpose: Test system beyond normal load to find breaking points
 * Run: k6 run k6-tests/stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, LOAD_STAGES, HEADERS } from './config.js';
import { 
  checkedRequest, 
  parseJSON, 
  randomInt, 
  randomItem,
  sleepRandom 
} from './utils/helpers.js';

export const options = {
  stages: LOAD_STAGES.stress,
  thresholds: {
    // More relaxed thresholds for stress testing
    'http_req_duration': ['p(95)<2000'],
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  const baseUrl = BASE_URL;

  // Concurrent requests simulation
  const batch = [
    ['GET', `${baseUrl}/api/products?page=${randomInt(1, 10)}`],
    ['GET', `${baseUrl}/api/categories`],
    ['GET', `${baseUrl}/api/brands`],
    ['GET', `${baseUrl}/api/daily-deals`],
  ];

  const responses = http.batch(batch);
  
  responses.forEach((response, index) => {
    check(response, {
      [`Batch request ${index}: status 200`]: (r) => r.status === 200,
    });
  });

  sleepRandom(0, 1);
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'k6-tests/results/stress-test-summary.json': JSON.stringify(data),
  };
}
