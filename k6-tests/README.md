# K6 Load Testing Suite

Comprehensive load testing suite for the backend API using k6.

## 📋 Prerequisites

- k6 installed locally (already installed on your system: v1.5.0)
- Backend server running (default: http://localhost:8000)
- Node.js for type definitions (optional)

## 🚀 Quick Start

### 1. Start your backend server
```bash
cd /Users/amitverma/Downloads/Vikas/backend-deployed
npm start
```

### 2. Run tests

**Smoke Test** (minimal load, basic functionality):
```bash
k6 run k6-tests/smoke-test.js
```

**Load Test** (normal expected load):
```bash
k6 run k6-tests/load-test.js
```

**Stress Test** (beyond normal load):
```bash
k6 run k6-tests/stress-test.js
```

**Spike Test** (sudden traffic spikes):
```bash
k6 run k6-tests/spike-test.js
```

**API Endpoints Test** (comprehensive endpoint testing):
```bash
k6 run k6-tests/api-endpoints-test.js
```

## 🔧 Configuration

### Environment Variables

Set the base URL for tests:
```bash
k6 run -e BASE_URL=http://localhost:8000 k6-tests/load-test.js
```

Or for production testing:
```bash
k6 run -e BASE_URL=https://your-production-api.com k6-tests/load-test.js
```

### Custom Test Duration

Override stages in command line:
```bash
k6 run --stage 30s:10,1m:50,30s:0 k6-tests/load-test.js
```

## 📊 Test Types

### 1. Smoke Test (`smoke-test.js`)
- **Purpose**: Verify basic functionality
- **Load**: 1 virtual user
- **Duration**: 30 seconds
- **Use**: Before any major testing to ensure system is working

### 2. Load Test (`load-test.js`)
- **Purpose**: Test under expected normal load
- **Load**: Ramps from 0 to 10 users
- **Duration**: 9 minutes
- **Scenarios**: Browse products, search, category/brand exploration

### 3. Stress Test (`stress-test.js`)
- **Purpose**: Find system breaking points
- **Load**: Ramps from 0 to 50 users with spike
- **Duration**: 16 minutes
- **Features**: Concurrent batch requests

### 4. Spike Test (`spike-test.js`)
- **Purpose**: Test resilience to sudden traffic spikes
- **Load**: Instant spike to 100 users
- **Duration**: 1.5 minutes
- **Use**: Validate system recovery from sudden load

### 5. API Endpoints Test (`api-endpoints-test.js`)
- **Purpose**: Comprehensive API endpoint testing
- **Load**: 5 concurrent users
- **Coverage**: All public APIs organized by groups
- **Features**: Health check, products, categories, brands, search, etc.

## 📈 Understanding Results

### Key Metrics

- **http_req_duration**: Response time for requests
  - p(95) < 500ms: 95% of requests complete within 500ms
  - p(90) < 300ms: 90% of requests complete within 300ms

- **http_req_failed**: Percentage of failed requests
  - Target: < 1% for load tests
  - Target: < 5% for stress tests

- **iterations**: Number of complete test iterations

### Sample Output
```
     ✓ Get products: status is 200
     ✓ Get products: response time < 1s
     
     http_req_duration..............: avg=245ms min=102ms med=231ms max=891ms p(95)=456ms
     http_req_failed................: 0.12% ✓ 2 ✗ 1598
     iterations.....................: 1600 (26.67/s)
```

## 📁 Test Results

Results are automatically saved to:
```
k6-tests/results/
├── smoke-test-summary.json
├── load-test-summary.json
├── stress-test-summary.json
├── spike-test-summary.json
└── api-endpoints-test-summary.json
```

## 🎯 Performance Thresholds

Current thresholds (defined in `config.js`):

- **Load Tests**: 95% of requests < 500ms, error rate < 1%
- **Stress Tests**: 95% of requests < 2000ms, error rate < 5%
- **Spike Tests**: 95% of requests < 3000ms, error rate < 10%

## 🔍 Advanced Usage

### Run with Visual Output
```bash
# HTML output
k6 run --out json=test-results.json k6-tests/load-test.js

# Then use k6-reporter (requires separate installation)
# docker run --rm -v $(pwd):/k6 -w /k6 grafana/k6 run --out json=results.json k6-tests/load-test.js
```

### Cloud Testing (k6 Cloud)
```bash
k6 cloud k6-tests/load-test.js
```

### Run with Custom VUs and Duration
```bash
k6 run --vus 10 --duration 30s k6-tests/smoke-test.js
```

## 🛠️ Customization

### Adding New Tests

1. Create a new test file in `k6-tests/`
2. Import config and helpers:
```javascript
import { BASE_URL, HEADERS } from './config.js';
import { checkedRequest, parseJSON } from './utils/helpers.js';
```

3. Define test options and scenarios
4. Export default function with test logic

### Modifying Load Stages

Edit `k6-tests/config.js` to adjust:
- Number of virtual users
- Ramp-up/ramp-down durations
- Test duration
- Performance thresholds

## 📚 Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [Test Types Guide](https://k6.io/docs/test-types/)

## ⚠️ Important Notes

1. **Authentication**: Current tests focus on public APIs. To test authenticated endpoints:
   - Uncomment authentication code in `api-endpoints-test.js`
   - Provide valid test credentials
   - Update token handling as per your API

2. **Database Impact**: Load tests create real load on your database. Use:
   - Test/staging environment for heavy tests
   - Database connection pooling
   - Monitor database metrics during tests

3. **Rate Limiting**: If your API has rate limiting:
   - Adjust virtual users accordingly
   - Add appropriate sleep times
   - Monitor rate limit errors

4. **Production Testing**: Before testing production:
   - Get approval from stakeholders
   - Start with smoke tests
   - Gradually increase load
   - Monitor system metrics closely

## 🐛 Troubleshooting

### Connection Refused
```
Error: ECONNREFUSED
```
**Solution**: Ensure backend server is running on the correct port

### High Error Rates
**Solution**: Check:
- Database connections
- API rate limits
- Server resources (CPU, memory)
- Network capacity

### Timeout Issues
**Solution**: Increase thresholds or optimize:
- Database queries
- External API calls
- Server configuration

## 📞 Support

For issues or questions about these tests, check:
1. This README
2. k6 documentation
3. Server logs during test execution
4. Results JSON files for detailed metrics
