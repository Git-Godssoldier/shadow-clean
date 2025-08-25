/**
 * Jest test setup for Temporal.io integration tests
 */

import { MockActivityEnvironment } from '@temporalio/testing';

// Global test configuration
global.console = {
  ...console,
  // Suppress debug logs during tests unless explicitly enabled
  debug: process.env.DEBUG_TESTS ? console.debug : () => {},
  log: process.env.DEBUG_TESTS ? console.log : () => {}
};

// Increase timeout for Temporal tests
jest.setTimeout(30000);

// Global test utilities
declare global {
  var testUtils: {
    createMockActivityEnvironment: () => MockActivityEnvironment;
    sleep: (ms: number) => Promise<void>;
    generateTestId: () => string;
  };
}

global.testUtils = {
  createMockActivityEnvironment: () => new MockActivityEnvironment(),
  
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
};

// Setup and teardown for each test
beforeEach(() => {
  // Reset any global state if needed
});

afterEach(() => {
  // Cleanup after each test
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled promise rejection in tests:', reason);
  // Don't exit process in tests, just log
});

export {};