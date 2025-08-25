/**
 * Unit Tests for Data Pipeline Activities
 * Comprehensive test coverage for all data processing activities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  downloadFile,
  validateCSV,
  parseCSVData,
  transformData,
  enrichData,
  validateTransformedData,
  storeInDatabase,
  generateReport,
  sendNotification,
  cleanupTempFiles
} from '../data-pipeline.activities';

// Mock axios for testing
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs for testing
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock stream
jest.mock('fs', () => ({
  createReadStream: jest.fn(),
  createWriteStream: jest.fn()
}));

describe('Data Pipeline Activities', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any test files
    try {
      const testFiles = await fs.readdir('/tmp');
      for (const file of testFiles) {
        if (file.startsWith('test-') || file.startsWith('temporal-')) {
          await fs.unlink(path.join('/tmp', file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn()
      };

      (mockedAxios as any).mockResolvedValue({
        data: mockStream,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });

      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.stat.mockResolvedValue({ size: 1024 } as any);

      const result = await downloadFile({
        url: 'https://example.com/test.csv',
        workflowId: 'test-workflow-123'
      });

      expect(result).toContain('/tmp/temporal-pipeline/test-workflow-123/download-');
      expect(mockedAxios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'https://example.com/test.csv',
        responseType: 'stream',
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024
      });
    });

    it('should handle download failure', async () => {
      (mockedAxios as any).mockRejectedValue(new Error('Network error'));

      await expect(downloadFile({
        url: 'https://invalid-url.com/test.csv',
        workflowId: 'test-workflow-123'
      })).rejects.toThrow('Failed to download file: Network error');
    });

    it('should create directory if it does not exist', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      (mockedAxios as any).mockResolvedValue({
        data: { pipe: jest.fn() },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      });
      mockedFs.stat.mockResolvedValue({ size: 1024 } as any);

      await downloadFile({
        url: 'https://example.com/test.csv',
        workflowId: 'test-workflow-123'
      });

      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        path.join('/tmp', 'temporal-pipeline', 'test-workflow-123'),
        { recursive: true }
      );
    });
  });

  describe('validateCSV', () => {
    it('should validate CSV file successfully', async () => {
      mockedFs.stat.mockResolvedValue({ size: 1024 } as any);

      // Mock CSV parsing
      const mockParser = {
        on: jest.fn((event, callback) => {
          if (event === 'readable') {
            // Simulate CSV records
            callback();
          } else if (event === 'end') {
            callback();
          }
        }),
        read: jest.fn()
          .mockReturnValueOnce({ id: '1', name: 'John', email: 'john@example.com' })
          .mockReturnValueOnce({ id: '2', name: 'Jane', email: 'jane@example.com' })
          .mockReturnValue(null)
      };

      jest.doMock('csv-parse', () => ({
        parse: () => mockParser
      }));

      const { parse } = require('csv-parse');
      
      const result = await validateCSV({
        filePath: '/tmp/test.csv',
        expectedFormat: 'csv',
        rules: {
          maxFileSize: 10 * 1024 * 1024,
          requiredColumns: ['id', 'name', 'email'],
          encoding: 'utf-8'
        }
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.recordCount).toBe(2);
    });

    it('should detect missing required columns', async () => {
      mockedFs.stat.mockResolvedValue({ size: 1024 } as any);

      const result = await validateCSV({
        filePath: '/tmp/test.csv',
        expectedFormat: 'csv',
        rules: {
          maxFileSize: 10 * 1024 * 1024,
          requiredColumns: ['id', 'name', 'email', 'phone'],
          encoding: 'utf-8'
        }
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required columns: phone');
    });

    it('should detect file size exceeding limit', async () => {
      mockedFs.stat.mockResolvedValue({ size: 200 * 1024 * 1024 } as any);

      const result = await validateCSV({
        filePath: '/tmp/test.csv',
        expectedFormat: 'csv',
        rules: {
          maxFileSize: 100 * 1024 * 1024,
          requiredColumns: ['id'],
          encoding: 'utf-8'
        }
      });

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('File size');
      expect(result.errors[0]).toContain('exceeds maximum');
    });
  });

  describe('parseCSVData', () => {
    it('should parse CSV data successfully', async () => {
      const mockRecords = [
        { id: '1', name: 'John', email: 'john@example.com' },
        { id: '2', name: 'Jane', email: 'jane@example.com' }
      ];

      // Mock the CSV parsing
      const mockParser = {
        on: jest.fn((event, callback) => {
          if (event === 'readable') {
            callback();
          } else if (event === 'end') {
            callback();
          }
        }),
        read: jest.fn()
          .mockReturnValueOnce(mockRecords[0])
          .mockReturnValueOnce(mockRecords[1])
          .mockReturnValue(null)
      };

      const result = await parseCSVData({
        filePath: '/tmp/test.csv',
        format: 'csv',
        options: {
          delimiter: ',',
          headers: true,
          skipEmptyRows: true
        }
      });

      expect(result.records).toHaveLength(2);
      expect(result.headers).toEqual(['id', 'name', 'email']);
    });

    it('should handle parsing errors', async () => {
      const mockParser = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Invalid CSV format'));
          }
        })
      };

      await expect(parseCSVData({
        filePath: '/tmp/invalid.csv',
        format: 'csv',
        options: {
          delimiter: ',',
          headers: true,
          skipEmptyRows: true
        }
      })).rejects.toThrow('Invalid CSV format');
    });
  });

  describe('transformData', () => {
    it('should transform data with mapping', async () => {
      const inputData = [
        { old_id: '1', full_name: 'John Doe', age: '30' },
        { old_id: '2', full_name: 'Jane Smith', age: '25' }
      ];

      const result = await transformData({
        data: inputData,
        rules: {
          mapping: {
            'old_id': 'id',
            'full_name': 'name',
            'age': 'age'
          }
        },
        options: {
          batchSize: 1000,
          parallel: true,
          errorHandling: 'skip'
        }
      });

      expect(result.successCount).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: '1',
        name: 'John Doe',
        age: '30'
      });
    });

    it('should apply filters correctly', async () => {
      const inputData = [
        { id: '1', name: 'John', department: 'Engineering' },
        { id: '2', name: 'Jane', department: 'Marketing' },
        { id: '3', name: 'Bob', department: 'Engineering' }
      ];

      const result = await transformData({
        data: inputData,
        rules: {
          mapping: {
            'id': 'employee_id',
            'name': 'full_name',
            'department': 'dept'
          },
          filters: [
            { field: 'dept', operator: 'equals', value: 'Engineering' }
          ]
        },
        options: {
          batchSize: 1000,
          parallel: true,
          errorHandling: 'skip'
        }
      });

      expect(result.successCount).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data.every(record => record.dept === 'Engineering')).toBe(true);
    });

    it('should handle transformation errors gracefully', async () => {
      const inputData = [
        { validField: 'value1' },
        null, // This will cause an error
        { validField: 'value2' }
      ];

      const result = await transformData({
        data: inputData,
        rules: {
          mapping: { 'validField': 'newField' }
        },
        options: {
          batchSize: 1000,
          parallel: true,
          errorHandling: 'skip'
        }
      });

      expect(result.successCount).toBe(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('enrichData', () => {
    it('should enrich data successfully', async () => {
      const inputData = [
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' }
      ];

      const result = await enrichData({
        data: inputData,
        config: {
          apiEndpoint: 'https://api.example.com/enrich',
          lookupTable: 'users',
          joinKey: 'id'
        },
        options: {
          cacheResults: true,
          retryFailedEnrichments: true,
          timeout: 30000
        }
      });

      expect(result.enrichedCount).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty('enrichedAt');
      expect(result.data[0]).toHaveProperty('enrichmentSource');
    });

    it('should handle enrichment with retry on failure', async () => {
      const inputData = Array.from({ length: 150 }, (_, i) => ({ id: i.toString() }));

      const result = await enrichData({
        data: inputData,
        config: {
          apiEndpoint: 'https://api.example.com/enrich'
        },
        options: {
          cacheResults: true,
          retryFailedEnrichments: true,
          timeout: 30000
        }
      });

      expect(result.enrichedCount).toBe(150);
      expect(result.data).toHaveLength(150);
    });
  });

  describe('validateTransformedData', () => {
    it('should validate data against schema', async () => {
      const inputData = [
        { id: '1', name: 'John', email: 'john@example.com' },
        { id: '2', name: 'Jane', email: 'jane@example.com' }
      ];

      const result = await validateTransformedData({
        data: inputData,
        schema: {
          required: ['id', 'name', 'email'],
          types: {
            id: 'string',
            name: 'string',
            email: 'string'
          },
          constraints: {}
        }
      });

      expect(result.isValid).toBe(true);
      expect(result.criticalErrors).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', async () => {
      const inputData = [
        { id: '1', name: 'John' }, // Missing email
        { id: '2', name: 'Jane', email: 'jane@example.com' }
      ];

      const result = await validateTransformedData({
        data: inputData,
        schema: {
          required: ['id', 'name', 'email'],
          types: {},
          constraints: {}
        }
      });

      expect(result.isValid).toBe(false);
      expect(result.criticalErrors).toBe(1);
      expect(result.errors[0]).toContain("Missing required field 'email'");
    });

    it('should detect type mismatches', async () => {
      const inputData = [
        { id: 1, name: 'John', age: 'thirty' } // id should be string, age should be number
      ];

      const result = await validateTransformedData({
        data: inputData,
        schema: {
          required: ['id', 'name'],
          types: {
            id: 'string',
            name: 'string',
            age: 'number'
          },
          constraints: {}
        }
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("has type 'number', expected 'string'"))).toBe(true);
    });
  });

  describe('storeInDatabase', () => {
    it('should store data in batches', async () => {
      const inputData = Array.from({ length: 2500 }, (_, i) => ({
        id: i.toString(),
        name: `User ${i}`,
        processed: true
      }));

      const result = await storeInDatabase({
        data: inputData,
        config: {
          database: 'analytics',
          table: 'processed_users',
          format: 'sql',
          partitionKey: 'department'
        },
        options: {
          batchSize: 1000,
          upsert: true,
          transactional: true
        }
      });

      expect(result.recordsInserted).toBe(2500);
      expect(result.recordsUpdated).toBe(0);
      expect(result.location).toBe('analytics.processed_users');
    });

    it('should handle empty data', async () => {
      const result = await storeInDatabase({
        data: [],
        config: {
          database: 'analytics',
          table: 'empty_table',
          format: 'sql'
        },
        options: {
          batchSize: 1000,
          upsert: false,
          transactional: false
        }
      });

      expect(result.recordsInserted).toBe(0);
      expect(result.recordsUpdated).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const result = await generateReport({
        pipelineId: 'test-pipeline-123',
        stats: {
          totalRecords: 1000,
          processedRecords: 950,
          failedRecords: 50,
          duration: 120000,
          errors: ['Validation error on record 101', 'Network timeout on record 502']
        },
        outputLocation: 'analytics.processed_data'
      });

      expect(result.url).toBe('http://localhost:8233/reports/test-pipeline-123');
      expect(result.path).toContain('report-test-pipeline-123.json');
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('should calculate correct success rate', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockImplementation((path, content) => {
        const report = JSON.parse(content as string);
        expect(report.summary.successRate).toBe('95.00%');
        return Promise.resolve();
      });

      await generateReport({
        pipelineId: 'test-pipeline-456',
        stats: {
          totalRecords: 1000,
          processedRecords: 950,
          failedRecords: 50,
          duration: 60000,
          errors: []
        },
        outputLocation: 'analytics.test_data'
      });
    });
  });

  describe('sendNotification', () => {
    it('should send notification to all configured channels', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await sendNotification({
        config: {
          email: 'admin@example.com',
          slack: '#data-pipeline',
          webhook: 'https://webhook.example.com/notify'
        },
        message: {
          title: 'Pipeline Completed',
          body: 'Successfully processed 1000 records',
          details: {
            pipelineId: 'test-123',
            duration: 120000
          }
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith('Email sent to admin@example.com');
      expect(consoleSpy).toHaveBeenCalledWith('Slack message sent to #data-pipeline');
      expect(consoleSpy).toHaveBeenCalledWith('Webhook called: https://webhook.example.com/notify');

      consoleSpy.mockRestore();
    });

    it('should handle missing configuration gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await sendNotification({
        config: {},
        message: {
          title: 'Test Message',
          body: 'Test Body',
          details: {}
        }
      });

      // Should not crash, just not send anything
      expect(consoleSpy).toHaveBeenCalledWith('Sending notification: Test Message');

      consoleSpy.mockRestore();
    });
  });

  describe('cleanupTempFiles', () => {
    it('should cleanup temporary files', async () => {
      const testPaths = [
        '/tmp/test-file-1.csv',
        '/tmp/test-file-2.csv',
        '/tmp/test-dir/test-file-3.csv'
      ];

      mockedFs.unlink.mockResolvedValue(undefined);
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.rmdir.mockResolvedValue(undefined);

      await cleanupTempFiles({ paths: testPaths });

      expect(mockedFs.unlink).toHaveBeenCalledTimes(3);
      testPaths.forEach(path => {
        expect(mockedFs.unlink).toHaveBeenCalledWith(path);
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockedFs.unlink.mockRejectedValue(new Error('File not found'));

      await cleanupTempFiles({ paths: ['/tmp/nonexistent.csv'] });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to delete /tmp/nonexistent.csv:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should remove empty directories', async () => {
      mockedFs.unlink.mockResolvedValue(undefined);
      mockedFs.readdir.mockResolvedValue([]);
      mockedFs.rmdir.mockResolvedValue(undefined);

      await cleanupTempFiles({ paths: ['/tmp/test-dir/file.csv'] });

      expect(mockedFs.rmdir).toHaveBeenCalledWith('/tmp/test-dir');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete pipeline workflow', async () => {
      // This test simulates the entire data pipeline
      const workflowId = 'integration-test-123';
      
      // 1. Download file
      const mockStream = { pipe: jest.fn(), on: jest.fn() };
      (mockedAxios as any).mockResolvedValue({ data: mockStream });
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.stat.mockResolvedValue({ size: 1024 } as any);
      
      const filePath = await downloadFile({
        url: 'https://example.com/test.csv',
        workflowId
      });
      
      expect(filePath).toContain(workflowId);
      
      // 2. Parse data
      const parsedData = await parseCSVData({
        filePath,
        format: 'csv',
        options: { delimiter: ',', headers: true, skipEmptyRows: true }
      });
      
      // 3. Transform data
      const transformedData = await transformData({
        data: [{ old_name: 'John', old_email: 'john@example.com' }],
        rules: {
          mapping: { 'old_name': 'name', 'old_email': 'email' }
        },
        options: { batchSize: 1000, parallel: true, errorHandling: 'skip' }
      });
      
      expect(transformedData.successCount).toBe(1);
      
      // 4. Store data
      const storeResult = await storeInDatabase({
        data: transformedData.data,
        config: { database: 'test', table: 'users', format: 'sql' },
        options: { batchSize: 1000, upsert: true, transactional: true }
      });
      
      expect(storeResult.recordsInserted).toBe(1);
      
      // 5. Generate report
      mockedFs.writeFile.mockResolvedValue(undefined);
      const report = await generateReport({
        pipelineId: workflowId,
        stats: {
          totalRecords: 1,
          processedRecords: 1,
          failedRecords: 0,
          duration: 5000,
          errors: []
        },
        outputLocation: storeResult.location
      });
      
      expect(report.url).toContain(workflowId);
    });
  });
});

// Performance tests
describe('Performance Tests', () => {
  it('should handle large dataset transformation efficiently', async () => {
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      id: i.toString(),
      name: `User ${i}`,
      value: Math.random() * 1000
    }));

    const startTime = Date.now();
    
    const result = await transformData({
      data: largeDataset,
      rules: {
        mapping: {
          'id': 'user_id',
          'name': 'full_name',
          'value': 'score'
        },
        filters: [
          { field: 'score', operator: 'greater_than', value: 500 }
        ]
      },
      options: {
        batchSize: 1000,
        parallel: true,
        errorHandling: 'skip'
      }
    });

    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    expect(result.successCount).toBeGreaterThan(0);
    expect(result.data.every(record => record.score > 500)).toBe(true);
  });

  it('should handle batch storage efficiently', async () => {
    const batchData = Array.from({ length: 5000 }, (_, i) => ({
      id: i.toString(),
      processed: true,
      timestamp: new Date()
    }));

    const startTime = Date.now();
    
    const result = await storeInDatabase({
      data: batchData,
      config: {
        database: 'performance_test',
        table: 'batch_data',
        format: 'sql'
      },
      options: {
        batchSize: 500,
        upsert: false,
        transactional: false
      }
    });

    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    expect(result.recordsInserted).toBe(5000);
  });
});