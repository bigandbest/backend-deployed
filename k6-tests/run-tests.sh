#!/bin/bash

# K6 Load Testing Runner Script
# Usage: ./run-tests.sh [test-type] [base-url]
# Example: ./run-tests.sh smoke http://localhost:8000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
BASE_URL=${2:-"http://localhost:8000"}
TEST_TYPE=${1:-"smoke"}

# Function to check if k6 is installed
check_k6() {
    if ! command -v k6 &> /dev/null; then
        echo -e "${RED}Error: k6 is not installed${NC}"
        echo "Install k6 from: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
    echo -e "${GREEN}✓ k6 found: $(k6 version)${NC}"
}

# Function to check if server is running
check_server() {
    echo "Checking if server is reachable at $BASE_URL..."
    if curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/test" | grep -q "200\|404"; then
        echo -e "${GREEN}✓ Server is reachable${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Server might not be running at $BASE_URL${NC}"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Function to run test
run_test() {
    local test_file="k6-tests/${TEST_TYPE}-test.js"
    
    if [ ! -f "$test_file" ]; then
        echo -e "${RED}Error: Test file '$test_file' not found${NC}"
        echo "Available tests: smoke, load, stress, spike, api-endpoints"
        exit 1
    fi
    
    echo -e "${GREEN}Running ${TEST_TYPE} test...${NC}"
    echo "Base URL: $BASE_URL"
    echo "Test file: $test_file"
    echo "-----------------------------------"
    
    k6 run -e BASE_URL="$BASE_URL" "$test_file"
    
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓ Test completed successfully${NC}"
    else
        echo -e "${RED}✗ Test failed with exit code $exit_code${NC}"
    fi
    
    return $exit_code
}

# Function to display help
show_help() {
    echo "K6 Load Testing Runner"
    echo ""
    echo "Usage: $0 [test-type] [base-url]"
    echo ""
    echo "Test Types:"
    echo "  smoke         - Minimal load test (1 user, 30s)"
    echo "  load          - Normal load test (0-10 users, 9min)"
    echo "  stress        - Stress test (0-50 users, 16min)"
    echo "  spike         - Spike test (0-100 users, 1.5min)"
    echo "  api-endpoints - API endpoints test (5 users, 2min)"
    echo "  all           - Run all tests sequentially"
    echo ""
    echo "Examples:"
    echo "  $0 smoke"
    echo "  $0 load http://localhost:8000"
    echo "  $0 stress https://api.example.com"
    echo "  $0 all"
}

# Main execution
main() {
    # Show help if requested
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi
    
    echo "🚀 K6 Load Testing Suite"
    echo "========================"
    echo ""
    
    check_k6
    check_server
    
    echo ""
    
    # Run all tests if requested
    if [ "$TEST_TYPE" = "all" ]; then
        for test in smoke load stress spike api-endpoints; do
            TEST_TYPE=$test
            echo ""
            echo "========================================"
            run_test
            echo "========================================"
            sleep 2
        done
    else
        run_test
    fi
}

# Run main function
main "$@"
