/**
 * K6 Spike Test
 * Purpose: Test system resilience to sudden traffic spikes
 * Run: k6 run k6-tests/spike-test.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, LOAD_STAGES } from './config.js';
import { randomInt } from './utils/helpers.js';

export const options = {
  stages: LOAD_STAGES.spike,
  thresholds: {
    'http_req_duration': ['p(95)<3000'],
    'http_req_failed': ['rate<0.10'], // Allow higher error rate during spike
  },
};

export default function () {
  const baseUrl = BASE_URL;
  
  // Simple high-throughput requests
  const endpoints = [
    `${baseUrl}/api/products?page=${randomInt(1, 5)}`,
    `${baseUrl}/api/categories`,
    `${baseUrl}/api/brands`,
    `${baseUrl}/api/test`,
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const response = http.get(endpoint);
  
  check(response, {
    'status is 200': (r) => r.status === 200,
  });
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'k6-tests/results/spike-test-summary.json': JSON.stringify(data),
  };
}
