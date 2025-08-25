/**
 * Unit tests for activities using MockActivityEnvironment
 */

import { MockActivityEnvironment } from '@temporalio/testing';
import { ApplicationFailure } from '@temporalio/common';

import {
  processTask,
  validateInput,
  updateStatus,
  sendNotification,
  generateReport,
  cleanupResources,
  healthCheck
} from '../../src/activities';

import type { TaskRequest, ActivityInput } from '../../src/types';

describe('Activities Unit Tests', () => {
  let env: MockActivityEnvironment;

  beforeEach(() => {
    env = testUtils.createMockActivityEnvironment();
  });

  afterEach(() => {
    env.cancel();
  });

  describe('processTask Activity', () => {
    it('should process data processing task successfully', async () => {
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 5, stepDelay: 10 },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const input: ActivityInput<TaskRequest> = {
        data: taskRequest,
        context: {
          activityId: `test-${taskRequest.id}`,
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'processTask',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const heartbeats: any[] = [];
      env.on('heartbeat', (details) => {
        heartbeats.push(details);
      });

      const result = await env.run(processTask, input);

      expect(result.result.processedRecords).toBe(5);
      expect(result.result.processingTime).toBeGreaterThan(0);
      expect(result.result.checksum).toContain(taskRequest.id);
      expect(heartbeats.length).toBeGreaterThan(0);
      
      // Verify heartbeat progression
      expect(heartbeats[0]).toHaveProperty('step', 1);
      expect(heartbeats[0]).toHaveProperty('totalSteps', 5);
      expect(heartbeats[heartbeats.length - 1]).toHaveProperty('step', 5);
    });

    it('should process file processing task with progress tracking', async () => {
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'file_processing',
        payload: { 
          fileName: 'test-file.dat',
          fileSize: 1024, 
          chunkSize: 256,
          fileFormat: 'binary'
        },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const input: ActivityInput<TaskRequest> = {
        data: taskRequest,
        context: {
          activityId: `test-${taskRequest.id}`,
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'processTask',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const heartbeats: any[] = [];
      env.on('heartbeat', (details) => {
        heartbeats.push(details);
      });

      const result = await env.run(processTask, input);

      expect(result.result.fileName).toBe('test-file.dat');
      expect(result.result.fileSize).toBe(1024);
      expect(result.result.chunksProcessed).toBe(4); // 1024 / 256
      expect(result.metadata.fileFormat).toBe('binary');
      
      // Verify chunk progress
      expect(heartbeats.length).toBe(4);
      expect(heartbeats[0]).toHaveProperty('chunk', 1);
      expect(heartbeats[3]).toHaveProperty('chunk', 4);
    });

    it('should handle API call task with retry logic', async () => {
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'api_call',
        payload: { 
          endpoint: '/api/test',
          simulateFailure: true // Will fail first 2 attempts
        },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const input: ActivityInput<TaskRequest> = {
        data: taskRequest,
        context: {
          activityId: `test-${taskRequest.id}`,
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'processTask',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const heartbeats: any[] = [];
      env.on('heartbeat', (details) => {
        heartbeats.push(details);
      });

      const result = await env.run(processTask, input);

      expect(result.result.endpoint).toBe('/api/test');
      expect(result.result.statusCode).toBe(200);
      expect(result.result.attempt).toBe(3); // Should succeed on 3rd attempt
      expect(result.metadata.retryAttempts).toBe(2);
      
      // Should have 3 heartbeats (one per attempt)
      expect(heartbeats.length).toBe(3);
    });

    it('should handle unknown task type', async () => {
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'unknown_type',
        payload: {},
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const input: ActivityInput<TaskRequest> = {
        data: taskRequest,
        context: {
          activityId: `test-${taskRequest.id}`,
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'processTask',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      await expect(env.run(processTask, input)).rejects.toThrow(ApplicationFailure);
    });

    it('should handle cancellation during processing', async () => {
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 100, stepDelay: 50 }, // Long running task
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const input: ActivityInput<TaskRequest> = {
        data: taskRequest,
        context: {
          activityId: `test-${taskRequest.id}`,
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'processTask',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      // Start the activity
      const activityPromise = env.run(processTask, input);
      
      // Cancel after a short delay
      setTimeout(() => env.cancel(), 100);

      await expect(activityPromise).rejects.toThrow('Data processing cancelled');
    });
  });

  describe('validateInput Activity', () => {
    it('should validate valid task input successfully', async () => {
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 5 },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const result = await env.run(validateInput, taskRequest);

      expect(result.result).toBe(true);
      expect(result.metadata.validationRules).toContain('required_fields');
      expect(result.metadata.validationRules).toContain('type_specific');
    });

    it('should reject task with missing required fields', async () => {
      const invalidTask = {
        id: '', // Missing ID
        type: '',  // Missing type
        payload: {},
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      } as TaskRequest;

      await expect(env.run(validateInput, invalidTask)).rejects.toThrow(ApplicationFailure);
    });

    it('should validate API call task with endpoint', async () => {
      const apiTask: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'api_call',
        payload: { endpoint: '/api/test' },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const result = await env.run(validateInput, apiTask);
      expect(result.result).toBe(true);
    });

    it('should reject API call task without endpoint', async () => {
      const invalidApiTask: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'api_call',
        payload: {}, // Missing endpoint
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      await expect(env.run(validateInput, invalidApiTask)).rejects.toThrow(ApplicationFailure);
    });

    it('should validate notification task with recipient', async () => {
      const notificationTask: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'notification',
        payload: { recipient: 'test@example.com' },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const result = await env.run(validateInput, notificationTask);
      expect(result.result).toBe(true);
    });

    it('should reject notification task without recipient', async () => {
      const invalidNotificationTask: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'notification',
        payload: {}, // Missing recipient
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      await expect(env.run(validateInput, invalidNotificationTask)).rejects.toThrow(ApplicationFailure);
    });
  });

  describe('updateStatus Activity', () => {
    it('should update task status successfully', async () => {
      const input = {
        data: {
          taskId: testUtils.generateTestId(),
          status: 'completed' as const,
          result: { success: true }
        },
        context: {
          activityId: 'test-update-status',
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'updateStatus',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const result = await env.run(updateStatus, input);

      expect(result.result).toBe(true);
      expect(result.metadata.updateMethod).toBe('direct');
      expect(result.metadata.updatedAt).toBeDefined();
    });

    it('should handle database simulation error with retry', async () => {
      // Mock Math.random to force database error (5% chance normally)
      const originalRandom = Math.random;
      Math.random = () => 0.01; // Force database error

      const input = {
        data: {
          taskId: testUtils.generateTestId(),
          status: 'completed' as const
        },
        context: {
          activityId: 'test-update-status-error',
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'updateStatus',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      await expect(env.run(updateStatus, input)).rejects.toThrow(ApplicationFailure);

      // Restore Math.random
      Math.random = originalRandom;
    });
  });

  describe('sendNotification Activity', () => {
    it('should send notification successfully', async () => {
      const input = {
        data: {
          recipient: 'test@example.com',
          message: 'Task completed successfully',
          taskId: testUtils.generateTestId()
        },
        context: {
          activityId: 'test-notification',
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'sendNotification',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const result = await env.run(sendNotification, input);

      expect(result.result).toContain('notif-');
      expect(result.metadata.channel).toBe('email');
      expect(result.metadata.deliveryStatus).toBe('queued');
      expect(result.metadata.sentAt).toBeDefined();
    });
  });

  describe('generateReport Activity', () => {
    it('should generate report with progress tracking', async () => {
      const input = {
        data: {
          taskId: testUtils.generateTestId(),
          type: 'data_processing',
          result: { processedRecords: 100 },
          metadata: { startTime: new Date().toISOString() }
        },
        context: {
          activityId: 'test-report',
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'generateReport',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const heartbeats: any[] = [];
      env.on('heartbeat', (details) => {
        heartbeats.push(details);
      });

      const result = await env.run(generateReport, input);

      expect(result.result).toContain('/reports/');
      expect(result.result).toContain('.json');
      expect(result.metadata.format).toBe('json');
      expect(result.metadata.size).toBeGreaterThan(0);
      
      // Should have 4 heartbeats for 4 report generation steps
      expect(heartbeats.length).toBe(4);
      expect(heartbeats[0].step).toBe('collect_data');
      expect(heartbeats[3].step).toBe('save_report');
    });
  });

  describe('cleanupResources Activity', () => {
    it('should cleanup resources successfully', async () => {
      const input = {
        data: {
          taskId: testUtils.generateTestId(),
          reason: 'task_completion'
        },
        context: {
          activityId: 'test-cleanup',
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'cleanupResources',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      const heartbeats: any[] = [];
      env.on('heartbeat', (details) => {
        heartbeats.push(details);
      });

      const result = await env.run(cleanupResources, input);

      expect(result.result).toBe(true);
      expect(result.metadata.reason).toBe('task_completion');
      expect(result.metadata.stepsCompleted).toBe(4);
      
      // Should have 4 heartbeats for cleanup steps
      expect(heartbeats.length).toBe(4);
    });

    it('should handle cancellation during cleanup', async () => {
      const input = {
        data: {
          taskId: testUtils.generateTestId(),
          reason: 'task_failure'
        },
        context: {
          activityId: 'test-cleanup-cancel',
          workflowId: 'test-workflow',
          attemptNumber: 1,
          info: {
            taskQueue: 'test-queue',
            activityType: 'cleanupResources',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      };

      // Start cleanup and cancel mid-way
      const cleanupPromise = env.run(cleanupResources, input);
      setTimeout(() => env.cancel(), 50);

      const result = await cleanupPromise;
      
      // Should complete even if cancelled (with partial cleanup)
      expect(result.result).toBe(true);
    });
  });

  describe('healthCheck Activity', () => {
    it('should perform health check successfully', async () => {
      const result = await env.run(healthCheck);

      expect(result.result.status).toMatch(/healthy|degraded/);
      expect(result.result.timestamp).toBeDefined();
      expect(result.result.services).toHaveProperty('database');
      expect(result.result.services).toHaveProperty('cache');
      expect(result.result.services).toHaveProperty('queue');
      expect(result.result.services).toHaveProperty('storage');
      expect(result.metadata.servicesChecked).toBe(4);
    });
  });
});