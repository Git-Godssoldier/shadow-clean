/**
 * Integration tests for Temporal workflows with time manipulation
 */

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { WorkflowFailedError } from '@temporalio/client';
import { ApplicationFailure } from '@temporalio/common';

import {
  taskProcessingWorkflow,
  batchProcessingWorkflow,
  longRunningWorkflow,
  pauseTaskSignal,
  resumeTaskSignal,
  cancelTaskSignal,
  getTaskStatusQuery,
  getProgressQuery
} from '../../src/workflows/task-processing.workflow';

import * as activities from '../../src/activities';
import type { TaskRequest, WorkflowInput } from '../../src/types';

describe('Task Processing Workflow Integration Tests', () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeAll(async () => {
    // Create time-skipping test environment
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  beforeEach(async () => {
    // Create worker for each test
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-task-queue',
      workflowsPath: require.resolve('../../src/workflows/task-processing.workflow'),
      activities: createMockActivities()
    });
  });

  afterEach(async () => {
    worker?.shutdown();
  });

  describe('Basic Task Processing', () => {
    it('should process a simple task successfully', async () => {
      const { client } = testEnv;
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 3, stepDelay: 100 },
        priority: 'normal',
        timeout: '5m',
        metadata: { test: 'true' }
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: taskRequest,
          context: {
            workflowId: `test-workflow-${taskRequest.id}`,
            taskQueue: 'test-task-queue',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: `test-workflow-${taskRequest.id}`,
        taskQueue: 'test-task-queue'
      });

      const result = await worker.runUntil(handle.result());

      expect(result.status).toBe('completed');
      expect(result.result.taskId).toBe(taskRequest.id);
      expect(result.result.status).toBe('completed');
      expect(result.result.result.processedRecords).toBe(3);
    });

    it('should handle validation errors appropriately', async () => {
      const { client } = testEnv;
      const invalidTaskRequest: TaskRequest = {
        id: '',  // Invalid empty ID
        type: '',  // Invalid empty type
        payload: {},
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: invalidTaskRequest,
          context: {
            workflowId: 'test-invalid-workflow',
            taskQueue: 'test-task-queue',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: 'test-invalid-workflow',
        taskQueue: 'test-task-queue'
      });

      await expect(worker.runUntil(handle.result())).rejects.toThrow(WorkflowFailedError);
    });

    it('should retry activities with transient failures', async () => {
      const { client } = testEnv;
      let attemptCount = 0;

      // Create worker with flaky activity
      const flakyWorker = await Worker.create({
        connection: testEnv.nativeConnection,
        taskQueue: 'test-task-queue-flaky',
        workflowsPath: require.resolve('../../src/workflows/task-processing.workflow'),
        activities: {
          ...createMockActivities(),
          processTask: async (input: any) => {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error('Transient failure');
            }
            return { result: { success: true, attempts: attemptCount } };
          }
        }
      });

      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 1 },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: taskRequest,
          context: {
            workflowId: `test-retry-workflow-${taskRequest.id}`,
            taskQueue: 'test-task-queue-flaky',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: `test-retry-workflow-${taskRequest.id}`,
        taskQueue: 'test-task-queue-flaky'
      });

      const result = await flakyWorker.runUntil(handle.result());

      expect(result.status).toBe('completed');
      expect(attemptCount).toBe(3);
      
      await flakyWorker.shutdown();
    });
  });

  describe('Signal and Query Handling', () => {
    it('should pause and resume workflow via signals', async () => {
      const { client } = testEnv;
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 5, stepDelay: 1000 },
        priority: 'normal',
        timeout: '10m',
        metadata: {}
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: taskRequest,
          context: {
            workflowId: `test-pause-workflow-${taskRequest.id}`,
            taskQueue: 'test-task-queue',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: `test-pause-workflow-${taskRequest.id}`,
        taskQueue: 'test-task-queue'
      });

      // Start the workflow
      const workflowPromise = worker.runUntil(handle.result());

      // Wait a bit then pause
      await testEnv.sleep('100ms');
      await handle.signal(pauseTaskSignal);

      // Check status is paused
      const statusAfterPause = await handle.query(getTaskStatusQuery);
      expect(statusAfterPause).toBe('pending');

      // Resume and complete
      await handle.signal(resumeTaskSignal);
      
      const result = await workflowPromise;
      expect(result.status).toBe('completed');
    });

    it('should cancel workflow via signal', async () => {
      const { client } = testEnv;
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 10, stepDelay: 1000 },
        priority: 'normal',
        timeout: '10m',
        metadata: {}
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: taskRequest,
          context: {
            workflowId: `test-cancel-workflow-${taskRequest.id}`,
            taskQueue: 'test-task-queue',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: `test-cancel-workflow-${taskRequest.id}`,
        taskQueue: 'test-task-queue'
      });

      // Start the workflow
      const workflowPromise = worker.runUntil(handle.result());

      // Wait a bit then cancel
      await testEnv.sleep('100ms');
      await handle.signal(cancelTaskSignal, 'User requested cancellation');

      const result = await workflowPromise;
      expect(result.status).toBe('failed');
      expect(result.result.error).toContain('Task cancelled');
    });

    it('should track progress via queries', async () => {
      const { client } = testEnv;
      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: { steps: 3, stepDelay: 100 },
        priority: 'normal',
        timeout: '5m',
        metadata: {}
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: taskRequest,
          context: {
            workflowId: `test-progress-workflow-${taskRequest.id}`,
            taskQueue: 'test-task-queue',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: `test-progress-workflow-${taskRequest.id}`,
        taskQueue: 'test-task-queue'
      });

      // Start the workflow
      const workflowPromise = worker.runUntil(handle.result());

      // Query progress during execution
      await testEnv.sleep('50ms');
      const progress = await handle.query(getProgressQuery);
      
      expect(progress).toHaveProperty('completed');
      expect(progress).toHaveProperty('total');
      expect(progress.total).toBe(5); // 5 steps in workflow
      
      await workflowPromise;
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple tasks in batches', async () => {
      const { client } = testEnv;
      const tasks: TaskRequest[] = Array.from({ length: 7 }, (_, i) => ({
        id: `batch-task-${i}-${Date.now()}`,
        type: 'data_processing',
        payload: { steps: 2, stepDelay: 50 },
        priority: 'normal',
        timeout: '5m',
        metadata: { batchIndex: i.toString() }
      }));

      const batchInput: WorkflowInput<{ tasks: TaskRequest[]; batchSize?: number }> = {
        data: { tasks, batchSize: 3 },
        context: {
          workflowId: 'test-batch-workflow',
          taskQueue: 'test-task-queue',
          namespace: 'default',
          startedAt: new Date(),
          metadata: {}
        }
      };

      const handle = await client.workflow.start(batchProcessingWorkflow, {
        args: [batchInput],
        workflowId: 'test-batch-workflow',
        taskQueue: 'test-task-queue'
      });

      const result = await worker.runUntil(handle.result());

      expect(result.status).toBe('completed');
      expect(result.result).toHaveLength(7);
      
      const successfulTasks = result.result.filter(r => r.status === 'completed');
      expect(successfulTasks).toHaveLength(7);
      
      expect(result.metadata.totalBatches).toBe(3); // 7 tasks in batches of 3
      expect(result.metadata.successCount).toBe(7);
      expect(result.metadata.failureCount).toBe(0);
    });
  });

  describe('Time Manipulation', () => {
    it('should handle long-running workflow with time skipping', async () => {
      const { client } = testEnv;
      
      const longRunningInput: WorkflowInput<{ maxIterations?: number }> = {
        data: { maxIterations: 3 },
        context: {
          workflowId: 'test-long-running',
          taskQueue: 'test-task-queue',
          namespace: 'default',
          startedAt: new Date(),
          metadata: {}
        }
      };

      const handle = await client.workflow.start(longRunningWorkflow, {
        args: [longRunningInput],
        workflowId: 'test-long-running',
        taskQueue: 'test-task-queue'
      });

      // The workflow sleeps for 10 seconds per iteration, but with time skipping
      // this should complete almost instantly
      const startTime = Date.now();
      await worker.runUntil(handle.result());
      const duration = Date.now() - startTime;

      // Should complete in much less than 30 seconds (3 iterations × 10 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it('should test workflow with timers and delays', async () => {
      const { client } = testEnv;
      
      // Create a workflow that uses timers
      const timerWorker = await Worker.create({
        connection: testEnv.nativeConnection,
        taskQueue: 'test-timer-queue',
        workflowsPath: require.resolve('./fixtures/timer-workflow'),
        activities: createMockActivities()
      });

      const handle = await client.workflow.start('timerWorkflow', {
        args: [{ delay: '1h', iterations: 3 }],
        workflowId: 'test-timer-workflow',
        taskQueue: 'test-timer-queue'
      });

      // Skip 3 hours ahead
      await testEnv.sleep('3h');

      const result = await timerWorker.runUntil(handle.result());
      expect(result.completedIterations).toBe(3);
      
      await timerWorker.shutdown();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle activity timeout gracefully', async () => {
      const { client } = testEnv;
      
      // Create worker with slow activity
      const slowWorker = await Worker.create({
        connection: testEnv.nativeConnection,
        taskQueue: 'test-slow-queue',
        workflowsPath: require.resolve('../../src/workflows/task-processing.workflow'),
        activities: {
          ...createMockActivities(),
          processTask: async () => {
            // Simulate activity that takes longer than timeout
            await new Promise(resolve => setTimeout(resolve, 10000));
            return { result: { completed: true } };
          }
        }
      });

      const taskRequest: TaskRequest = {
        id: testUtils.generateTestId(),
        type: 'data_processing',
        payload: {},
        priority: 'normal',
        timeout: '1s', // Very short timeout
        metadata: {}
      };

      const handle = await client.workflow.start(taskProcessingWorkflow, {
        args: [{
          data: taskRequest,
          context: {
            workflowId: `test-timeout-workflow-${taskRequest.id}`,
            taskQueue: 'test-slow-queue',
            namespace: 'default',
            startedAt: new Date(),
            metadata: {}
          }
        }],
        workflowId: `test-timeout-workflow-${taskRequest.id}`,
        taskQueue: 'test-slow-queue'
      });

      await expect(slowWorker.runUntil(handle.result())).rejects.toThrow();
      
      await slowWorker.shutdown();
    });
  });

  // Helper function to create mock activities
  function createMockActivities() {
    return {
      processTask: activities.processTask,
      validateInput: activities.validateInput,
      updateStatus: activities.updateStatus,
      sendNotification: activities.sendNotification,
      generateReport: activities.generateReport,
      cleanupResources: activities.cleanupResources,
      healthCheck: activities.healthCheck
    };
  }
});