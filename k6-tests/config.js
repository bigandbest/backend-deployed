// k6 Test Configuration
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Test stages for different load scenarios
export const LOAD_STAGES = {
  smoke: [
    { duration: '30s', target: 1 }, // 1 user for 30 seconds
  ],
  load: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users over 2 minutes
    { duration: '5m', target: 10 }, // Stay at 10 users for 5 minutes
    { duration: '2m', target: 0 },  // Ramp down to 0 users
  ],
  stress: [
    { duration: '2m', target: 20 },  // Ramp up to 20 users
    { duration: '5m', target: 20 },  // Stay at 20 users
    { duration: '2m', target: 50 },  // Spike to 50 users
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  spike: [
    { duration: '10s', target: 100 }, // Instant spike to 100 users
    { duration: '1m', target: 100 },  // Stay at 100 users
    { duration: '10s', target: 0 },   // Drop to 0
  ],
  soak: [
    { duration: '5m', target: 10 },   // Ramp up
    { duration: '4h', target: 10 },   // Stay at 10 users for 4 hours
    { duration: '5m', target: 0 },    // Ramp down
  ],
};

// Performance thresholds
export const THRESHOLDS = {
  // 95% of requests should complete within 500ms
  'http_req_duration': ['p(95)<500'],
  // Error rate should be less than 1%
  'http_req_failed': ['rate<0.01'],
  // 90% of requests should complete within 300ms
  'http_req_duration{expected_response:true}': ['p(90)<300'],
};

// Common headers
export const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

export default {
  BASE_URL,
  LOAD_STAGES,
  THRESHOLDS,
  HEADERS,
};
