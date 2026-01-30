import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
export const errorRate = new Rate('errors');
export const apiDuration = new Trend('api_duration');

/**
 * Make a checked HTTP request
 */
export function checkedRequest(response, checkName, expectedStatus = 200) {
  const result = check(response, {
    [`${checkName}: status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${checkName}: response time < 1s`]: (r) => r.timings.duration < 1000,
    [`${checkName}: has body`]: (r) => r.body && r.body.length > 0,
  });
  
  errorRate.add(!result);
  apiDuration.add(response.timings.duration);
  
  return result;
}

/**
 * Parse JSON response safely
 */
export function parseJSON(response) {
  try {
    return JSON.parse(response.body);
  } catch (e) {
    console.error('Failed to parse JSON:', e, response.body);
    return null;
  }
}

/**
 * Random integer between min and max
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random element from array
 */
export function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Sleep with random jitter
 */
export function sleepRandom(min, max) {
  sleep(randomInt(min, max));
}

/**
 * Generate random user data
 */
export function generateUserData() {
  const timestamp = Date.now();
  return {
    name: `Test User ${timestamp}`,
    email: `testuser${timestamp}@example.com`,
    phone: `9${randomInt(100000000, 999999999)}`,
    password: 'Test@123456',
  };
}

/**
 * Extract token from response
 */
export function extractToken(response) {
  const data = parseJSON(response);
  return data?.token || data?.data?.token || data?.accessToken;
}

export default {
  checkedRequest,
  parseJSON,
  randomInt,
  randomItem,
  sleepRandom,
  generateUserData,
  extractToken,
  errorRate,
  apiDuration,
};
