module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.{ts,js}',
    '**/*.(test|spec).{ts,js}'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@workflows/(.*)$': '<rootDir>/src/workflows/$1',
    '^@activities/(.*)$': '<rootDir>/src/activities/$1',
    '^@clients/(.*)$': '<rootDir>/src/clients/$1',
    '^@workers/(.*)$': '<rootDir>/src/workers/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@interceptors/(.*)$': '<rootDir>/src/interceptors/$1',
    '^@converters/(.*)$': '<rootDir>/src/converters/$1',
    '^@monitoring/(.*)$': '<rootDir>/src/monitoring/$1'
  },
  testTimeout: 30000,
  maxWorkers: 1, // Temporal tests work better with single worker
  verbose: true,
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  extensionsToTreatAsEsm: ['.ts']
};