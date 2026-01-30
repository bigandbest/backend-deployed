# K6 Load Testing Setup - Quick Reference

## ✅ What's Installed

- **k6 CLI**: v1.5.0 (already installed on your system)
- **Test Suite**: Complete k6 testing framework in `k6-tests/` directory
- **TypeScript Support**: @types/k6 for IDE autocomplete

## 📁 Structure

```
backend-deployed/
└── k6-tests/
    ├── config.js                  # Test configuration & thresholds
    ├── smoke-test.js              # Basic functionality test
    ├── load-test.js               # Normal load test
    ├── stress-test.js             # Stress test
    ├── spike-test.js              # Sudden spike test
    ├── api-endpoints-test.js      # Comprehensive API test
    ├── run-tests.sh               # Test runner script
    ├── README.md                  # Detailed documentation
    ├── utils/
    │   └── helpers.js             # Reusable test utilities
    └── results/                   # Test results (auto-generated)
```

## 🚀 Running Tests

### Option 1: Using npm scripts (Recommended)
```bash
npm run k6:smoke      # Quick smoke test
npm run k6:load       # Load test
npm run k6:stress     # Stress test
npm run k6:spike      # Spike test
npm run k6:api        # API endpoints test
npm run k6:all        # Run all tests
```

### Option 2: Using k6 directly
```bash
k6 run k6-tests/smoke-test.js
k6 run k6-tests/load-test.js
k6 run k6-tests/stress-test.js
```

### Option 3: Using the runner script
```bash
./k6-tests/run-tests.sh smoke
./k6-tests/run-tests.sh load
./k6-tests/run-tests.sh all
```

## 🎯 Test Types Overview

| Test | Duration | Users | Purpose |
|------|----------|-------|---------|
| **Smoke** | 30s | 1 | Verify basic functionality |
| **Load** | 9m | 0→10 | Test expected normal load |
| **Stress** | 16m | 0→50 | Find breaking points |
| **Spike** | 1.5m | 0→100 | Test sudden traffic spikes |
| **API** | 2m | 5 | Test all API endpoints |

## 📊 Quick Start Example

1. **Start your backend**:
   ```bash
   npm start
   # or
   npm run dev
   ```

2. **Run a smoke test** (in another terminal):
   ```bash
   cd /Users/amitverma/Downloads/Vikas/backend-deployed
   npm run k6:smoke
   ```

3. **View results**:
   - Terminal output shows real-time metrics
   - Detailed JSON reports saved in `k6-tests/results/`

## 🔧 Configuration

### Change Base URL
```bash
# For local testing (default)
k6 run k6-tests/smoke-test.js

# For staging
k6 run -e BASE_URL=https://staging-api.example.com k6-tests/smoke-test.js

# For production
k6 run -e BASE_URL=https://api.example.com k6-tests/smoke-test.js
```

### Customize Load
```bash
# 20 users for 1 minute
k6 run --vus 20 --duration 1m k6-tests/load-test.js

# Custom stages
k6 run --stage 30s:5,1m:20,30s:0 k6-tests/load-test.js
```

## 📈 Understanding Results

### Key Metrics to Watch

✅ **http_req_duration**: Response time
- **Target**: p(95) < 500ms for load tests
- Lower is better

✅ **http_req_failed**: Error rate
- **Target**: < 1% for load tests
- Shows reliability

✅ **iterations**: Number of complete test runs
- Higher means more throughput

### Sample Good Result
```
✓ http_req_duration............: avg=245ms p(95)=456ms ✅
✓ http_req_failed..............: 0.12% ✅
✓ iterations...................: 1600
```

### Sample Bad Result
```
✗ http_req_duration............: avg=2.3s p(95)=4.1s ❌
✗ http_req_failed..............: 15.2% ❌
  iterations...................: 342
```

## 🎨 Test Scenarios

Each test simulates real user behavior:

- **Browse products**: List → View details
- **Search & view**: Search → Click result
- **Category browse**: Categories → Filter by category
- **Brand explore**: Brands → View brand products

## ⚙️ Advanced Options

### Generate HTML Report
```bash
k6 run --out json=results.json k6-tests/load-test.js
```

### Run with Verbose Output
```bash
k6 run --http-debug k6-tests/smoke-test.js
```

### Set Thresholds from CLI
```bash
k6 run --threshold "http_req_duration=p(95)<200" k6-tests/load-test.js
```

## 🐛 Troubleshooting

### "Connection Refused"
**Problem**: Backend server not running
**Solution**: Start server with `npm start`

### High Error Rates
**Problem**: Server can't handle load
**Solution**: 
- Check database connections
- Optimize slow queries
- Increase server resources
- Check for rate limiting

### Tests Timing Out
**Problem**: Requests taking too long
**Solution**:
- Reduce concurrent users
- Optimize API endpoints
- Check external service dependencies

## 📚 Next Steps

1. ✅ **Run smoke test** to verify setup
2. ✅ **Run load test** to understand baseline performance
3. ✅ **Identify bottlenecks** from metrics
4. ✅ **Optimize** slow endpoints
5. ✅ **Re-test** to verify improvements
6. ✅ **Run stress test** to find limits
7. ✅ **Set up monitoring** for production

## 🔗 Resources

- [K6 Documentation](https://k6.io/docs/)
- [Detailed README](./k6-tests/README.md)
- [Test Configuration](./k6-tests/config.js)

## 💡 Tips

1. **Start small**: Run smoke test first
2. **Use staging**: Test on non-production environment first
3. **Monitor resources**: Watch CPU, memory, database during tests
4. **Test regularly**: Make it part of CI/CD
5. **Realistic data**: Use production-like data for accuracy

## 🎯 Common Commands Cheat Sheet

```bash
# Quick tests
npm run k6:smoke                    # 30 seconds
npm run k6:load                     # 9 minutes
npm run k6:stress                   # 16 minutes

# Custom runs
k6 run --vus 10 --duration 30s k6-tests/smoke-test.js
k6 run -e BASE_URL=http://localhost:8000 k6-tests/load-test.js

# Results
cat k6-tests/results/smoke-test-summary.json | jq .

# Help
./k6-tests/run-tests.sh --help
k6 run --help
```

---

**Ready to start?** Run `npm run k6:smoke` and watch your API perform! 🚀
