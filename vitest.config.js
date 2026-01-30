import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.test.js'],
    include: ['test/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['controller/**/*.js', 'services/**/*.js', 'dao/**/*.js'],
      exclude: [
        'node_modules/**',
        'test/**',
        'k6-tests/**',
        '**/*.test.js',
        '**/*.config.js',
      ],
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
