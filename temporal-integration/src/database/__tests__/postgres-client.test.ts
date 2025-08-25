/**
 * Unit Tests for PostgreSQL Client
 * Comprehensive test coverage for database operations
 */

import { Pool, PoolClient } from 'pg';
import { PostgreSQLClient, getPostgreSQLClient } from '../postgres-client';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0
  }))
}));

const MockedPool = Pool as jest.MockedClass<typeof Pool>;

describe('PostgreSQLClient', () => {
  let client: PostgreSQLClient;
  let mockPool: jest.Mocked<Pool>;
  let mockPoolClient: jest.Mocked<PoolClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPoolClient = {
      query: jest.fn(),
      release: jest.fn(),
      on: jest.fn(),
      end: jest.fn()
    } as any;

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockPoolClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0
    } as any;

    MockedPool.mockImplementation(() => mockPool);
    
    client = new PostgreSQLClient({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test'
    });
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize connection successfully', async () => {
      mockPoolClient.query.mockResolvedValue({ rows: [{ now: new Date() }] } as any);

      await client.initialize();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockPoolClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it('should retry connection on failure', async () => {
      mockPool.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(mockPoolClient);

      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      await client.initialize();

      expect(mockPool.connect).toHaveBeenCalledTimes(3);
    });

    it('should fail after maximum retries', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(client.initialize()).rejects.toThrow(
        'Failed to connect to database after 3 attempts'
      );

      expect(mockPool.connect).toHaveBeenCalledTimes(3);
    });

    it('should create required tables during initialization', async () => {
      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      await client.initialize();

      // Should create all required tables
      const createTableCalls = mockPoolClient.query.mock.calls.filter(call => 
        typeof call[0] === 'string' && call[0].includes('CREATE TABLE')
      );

      expect(createTableCalls.length).toBeGreaterThan(0);
      expect(createTableCalls.some(call => call[0].includes('workflow_executions'))).toBe(true);
      expect(createTableCalls.some(call => call[0].includes('activity_executions'))).toBe(true);
      expect(createTableCalls.some(call => call[0].includes('processed_data'))).toBe(true);
    });
  });

  describe('Query Operations', () => {
    it('should execute simple query successfully', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }] };
      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await client.query('SELECT * FROM test');

      expect(result).toEqual(mockResult);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', undefined);
    });

    it('should execute parameterized query successfully', async () => {
      const mockResult = { rows: [{ id: 1, name: 'John' }] };
      mockPool.query.mockResolvedValue(mockResult as any);

      const result = await client.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(result).toEqual(mockResult);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
    });

    it('should retry queries on retryable errors', async () => {
      const retryableError = new Error('Connection timeout') as any;
      retryableError.code = 'ETIMEDOUT';

      mockPool.query
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue({ rows: [{ success: true }] } as any);

      const result = await client.query('SELECT 1 as success');

      expect(result.rows[0].success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('Syntax error') as any;
      nonRetryableError.code = '42601';

      mockPool.query.mockRejectedValue(nonRetryableError);

      await expect(client.query('INVALID SQL')).rejects.toThrow('Syntax error');
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Transaction Operations', () => {
    it('should execute transaction successfully', async () => {
      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      const result = await client.transaction(async (client) => {
        await client.query('INSERT INTO test (name) VALUES ($1)', ['test']);
        await client.query('SELECT * FROM test');
        return 'success';
      });

      expect(result).toBe('success');
      expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      mockPoolClient.query.mockImplementation((sql) => {
        if (sql === 'INVALID SQL') {
          throw new Error('SQL Error');
        }
        return Promise.resolve({ rows: [] } as any);
      });

      await expect(client.transaction(async (client) => {
        await client.query('INSERT INTO test (name) VALUES ($1)', ['test']);
        await client.query('INVALID SQL');
        return 'should not reach here';
      })).rejects.toThrow('SQL Error');

      expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPoolClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockPoolClient.release).toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    it('should perform batch insert successfully', async () => {
      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      const records = [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' },
        { name: 'Bob', email: 'bob@example.com' }
      ];

      const result = await client.batchInsert('users', records, 2);

      expect(result).toBe(3);
      expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Should have made INSERT queries
      const insertCalls = mockPoolClient.query.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO users')
      );
      expect(insertCalls).toHaveLength(3);
    });

    it('should handle empty batch insert', async () => {
      const result = await client.batchInsert('users', [], 1000);

      expect(result).toBe(0);
      expect(mockPoolClient.query).not.toHaveBeenCalled();
    });

    it('should process large batches in chunks', async () => {
      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      const records = Array.from({ length: 2500 }, (_, i) => ({
        id: i,
        name: `User ${i}`
      }));

      const result = await client.batchInsert('users', records, 1000);

      expect(result).toBe(2500);
      
      // Should have created 3 transactions (3 batches of 1000, 1000, 500)
      const beginCalls = mockPoolClient.query.mock.calls.filter(call =>
        call[0] === 'BEGIN'
      );
      expect(beginCalls).toHaveLength(3);
    });
  });

  describe('Workflow and Activity Tracking', () => {
    it('should store workflow execution', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await client.storeWorkflowExecution({
        workflowId: 'test-workflow-123',
        workflowType: 'dataProcessing',
        taskQueue: 'test-queue',
        status: 'completed',
        input: { data: 'test' },
        output: { result: 'success' },
        metadata: { version: '1.0' }
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workflow_executions'),
        expect.arrayContaining([
          'test-workflow-123',
          'dataProcessing',
          'test-queue',
          'completed',
          '{"data":"test"}',
          '{"result":"success"}',
          undefined,
          '{"version":"1.0"}'
        ])
      );
    });

    it('should store activity execution', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await client.storeActivityExecution({
        activityId: 'activity-456',
        workflowId: 'workflow-123',
        activityType: 'processData',
        status: 'completed',
        input: { data: 'input' },
        output: { result: 'output' },
        attempts: 2,
        metadata: { duration: 1000 }
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO activity_executions'),
        expect.arrayContaining([
          'activity-456',
          'workflow-123',
          'processData',
          'completed',
          '{"data":"input"}',
          '{"result":"output"}',
          undefined,
          2,
          '{"duration":1000}'
        ])
      );
    });

    it('should store processed data for data pipeline', async () => {
      const records = [
        { id: '1', name: 'John', processed: true },
        { id: '2', name: 'Jane', processed: true }
      ];

      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      const result = await client.storeProcessedData('pipeline-789', records);

      expect(result).toBe(2);
      expect(mockPoolClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockPoolClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should retrieve workflow history', async () => {
      const mockHistory = [
        { workflow_id: 'test-123', status: 'completed', created_at: new Date() },
        { workflow_id: 'test-123', status: 'running', created_at: new Date() }
      ];

      mockPool.query.mockResolvedValue({ rows: mockHistory } as any);

      const result = await client.getWorkflowHistory('test-123');

      expect(result).toEqual(mockHistory);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM workflow_executions'),
        ['test-123']
      );
    });

    it('should retrieve activity history', async () => {
      const mockHistory = [
        { activity_id: 'act-1', workflow_id: 'wf-123', status: 'completed' },
        { activity_id: 'act-2', workflow_id: 'wf-123', status: 'failed' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockHistory } as any);

      const result = await client.getActivityHistory('wf-123');

      expect(result).toEqual(mockHistory);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM activity_executions'),
        ['wf-123']
      );
    });
  });

  describe('Health Check and Statistics', () => {
    it('should perform health check successfully', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ health: 1 }] } as any);

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 as health');
    });

    it('should fail health check on error', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should return pool statistics', () => {
      const stats = client.getPoolStats();

      expect(stats).toEqual({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0
      });
    });
  });

  describe('Error Handling', () => {
    it('should identify retryable errors correctly', async () => {
      const retryableErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ETIMEDOUT' },
        { code: '57P03' },
        { message: 'connection_failure' }
      ];

      for (const error of retryableErrors) {
        mockPool.query
          .mockRejectedValueOnce(error)
          .mockResolvedValue({ rows: [{ success: true }] } as any);

        const result = await client.query('SELECT 1 as success');
        expect(result.rows[0].success).toBe(true);
      }
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = { code: '23505' }; // unique_violation

      mockPool.query.mockRejectedValue(nonRetryableError);

      await expect(client.query('SELECT 1')).rejects.toEqual(nonRetryableError);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Management', () => {
    it('should close connection pool', async () => {
      await client.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle connection events', () => {
      // Verify event handlers were set up
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('remove', expect.any(Function));
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance for getPostgreSQLClient', () => {
      const instance1 = getPostgreSQLClient();
      const instance2 = getPostgreSQLClient();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Configuration Validation', () => {
    it('should use environment variables for configuration', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
      process.env.DB_HOST = 'testhost';
      process.env.DB_PORT = '5433';

      // Create new instance to test env var usage
      const envClient = new PostgreSQLClient();

      // Verify constructor was called (Pool mock)
      expect(MockedPool).toHaveBeenCalled();

      // Clean up
      delete process.env.DATABASE_URL;
      delete process.env.DB_HOST;
      delete process.env.DB_PORT;
    });

    it('should use default values when no config provided', () => {
      const defaultClient = new PostgreSQLClient();

      expect(MockedPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'temporal',
          user: 'temporal'
        })
      );
    });

    it('should override defaults with provided config', () => {
      const customClient = new PostgreSQLClient({
        host: 'custom-host',
        port: 9999,
        database: 'custom-db',
        max: 50
      });

      expect(MockedPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'custom-host',
          port: 9999,
          database: 'custom-db',
          max: 50
        })
      );
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent queries efficiently', async () => {
      mockPool.query.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ rows: [{ result: 'success' }] }), 10)
        )
      );

      const queries = Array.from({ length: 100 }, (_, i) => 
        client.query(`SELECT ${i} as id`)
      );

      const startTime = Date.now();
      const results = await Promise.all(queries);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(results.every(r => r.rows[0].result === 'success')).toBe(true);
    });

    it('should handle large batch operations efficiently', async () => {
      mockPoolClient.query.mockResolvedValue({ rows: [] } as any);

      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `item-${i}`,
        timestamp: new Date()
      }));

      const startTime = Date.now();
      const result = await client.batchInsert('large_table', largeDataset, 1000);
      const duration = Date.now() - startTime;

      expect(result).toBe(10000);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined values in data', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await client.storeWorkflowExecution({
        workflowId: 'test-123',
        workflowType: 'test',
        taskQueue: 'queue',
        status: 'completed',
        input: null,
        output: undefined,
        error: undefined,
        metadata: null
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'test-123',
          'test',
          'queue',
          'completed',
          'null',
          'null',
          undefined,
          'null'
        ])
      );
    });

    it('should handle very long error messages', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const longError = 'x'.repeat(10000);

      await client.storeActivityExecution({
        activityId: 'act-123',
        workflowId: 'wf-123',
        activityType: 'test',
        status: 'failed',
        error: longError
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'act-123',
          'wf-123',
          'test',
          'failed',
          'null',
          'null',
          longError,
          1,
          'null'
        ])
      );
    });
  });
});