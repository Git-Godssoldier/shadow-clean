/**
 * End-to-End Tests for Live Temporal Application
 * Comprehensive testing of all Temporal.io integration features
 */

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Connection, Client } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { v4 as uuid } from 'uuid';

import * as workflows from '../../src/workflows';
import * as activities from '../../src/activities';
import { 
  TemporalClient,
  OptimizedClientFactory,
  ConnectionPoolManager 
} from '../../src/clients';
import { 
  ProductionWorkerFactory,
  WorkerConfigFactory,
  ResourceMonitor,
  WorkerHealthMonitor 
} from '../../src/workers';
import { 
  ScheduleManager,
  TimerManager,
  SchedulingService 
} from '../../src/schedules';
import { 
  AdvancedWorkflowController 
} from '../../src/controllers/workflow-controller';
import { 
  MonitoringManager,
  MetricsCollector,
  AlertManager,
  HealthMonitor 
} from '../../src/monitoring';
import { 
  PerformanceOrchestrator,
  PerformanceCacheManager 
} from '../../src/performance';
import { ConfigurationManager } from '../../src/config';

describe('Live Temporal Application E2E Tests', () => {
  let testEnv: TestWorkflowEnvironment;
  let connection: Connection;
  let client: Client;
  let worker: Worker;
  let temporalClient: TemporalClient;
  let workflowController: AdvancedWorkflowController;
  let scheduleManager: ScheduleManager;
  let monitoringManager: MonitoringManager;
  let performanceOrchestrator: PerformanceOrchestrator;

  // Test configuration
  const TEST_NAMESPACE = 'test-namespace';
  const TEST_TASK_QUEUE = 'test-task-queue';
  const TEST_TIMEOUT = 60000; // 1 minute

  beforeAll(async () => {
    // Initialize test environment with time skipping for faster tests
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    
    // Initialize configuration
    const configManager = ConfigurationManager.getInstance();
    configManager.applyWorkloadOptimization('balanced');
    
    // Initialize monitoring
    monitoringManager = MonitoringManager.initialize({
      enableMetrics: true,
      enableAlerts: true,
      enableHealthChecks: true,
      metricsIntervalMs: 5000,
      alertCheckIntervalMs: 10000
    });
    monitoringManager.start();
    
    // Initialize performance optimization
    performanceOrchestrator = PerformanceOrchestrator.getInstance();
    performanceOrchestrator.initialize({
      enableCaching: true,
      enableAdaptiveOptimization: true,
      optimizationIntervalMs: 30000,
      cacheConfig: {
        'workflow-results': { maxSize: 100, ttlMs: 60000 },
        'activity-results': { maxSize: 200, ttlMs: 30000 }
      }
    });
    
    // Create connection
    connection = testEnv.nativeConnection;
    
    // Initialize client factory
    await OptimizedClientFactory.initialize({
      namespace: TEST_NAMESPACE,
      connectionPool: {
        maxConnections: 5,
        healthCheckIntervalMs: 30000,
        connectionTimeoutMs: 10000
      }
    });
    
    // Create client
    client = new Client({
      connection,
      namespace: TEST_NAMESPACE
    });
    
    // Create Temporal client wrapper
    temporalClient = new TemporalClient(client);
    
    // Initialize workflow controller
    workflowController = new AdvancedWorkflowController({
      client,
      namespace: TEST_NAMESPACE,
      defaultTimeout: '30s',
      retryAttempts: 3
    });
    
    // Initialize schedule manager
    scheduleManager = await ScheduleManager.create(client);
    
    // Create optimized worker
    const workerConfig = WorkerConfigFactory.createOptimizedConfig(
      'development',
      'balanced',
      {
        taskQueue: TEST_TASK_QUEUE,
        namespace: TEST_NAMESPACE
      }
    );
    
    worker = await Worker.create({
      connection,
      namespace: TEST_NAMESPACE,
      taskQueue: TEST_TASK_QUEUE,
      workflowsPath: require.resolve('../../src/workflows'),
      activities,
      ...workerConfig
    });
    
    console.log('Test environment initialized successfully');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup
    await worker?.shutdown();
    await workflowController?.cleanup();
    await scheduleManager?.cleanup();
    monitoringManager?.stop();
    performanceOrchestrator?.shutdown();
    await OptimizedClientFactory.shutdown();
    await testEnv?.teardown();
    
    console.log('Test environment cleaned up');
  });

  // ============================================================================
  // Basic Workflow Tests
  // ============================================================================

  describe('Basic Workflow Execution', () => {
    it('should execute a simple task processing workflow', async () => {
      const workflowId = `test-simple-${uuid()}`;
      const taskRequest = {
        id: `task-${uuid()}`,
        type: 'data_processing' as const,
        payload: { steps: 3, stepDelay: 100 },
        priority: 'normal' as const,
        timeout: '5m',
        metadata: { test: true }
      };

      const handle = await temporalClient.startWorkflow(
        'taskProcessingWorkflow',
        [{
          data: taskRequest,
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      const result = await worker.runUntil(handle.result());
      
      expect(result.status).toBe('completed');
      expect(result.result.taskId).toBe(taskRequest.id);
      expect(result.result.status).toBe('completed');
    });

    it('should handle workflow failures with retry', async () => {
      const workflowId = `test-failure-${uuid()}`;
      const invalidTask = {
        id: '', // Invalid empty ID
        type: '' as any, // Invalid empty type
        payload: {},
        priority: 'normal' as const,
        timeout: '5m',
        metadata: {}
      };

      const handle = await temporalClient.startWorkflow(
        'taskProcessingWorkflow',
        [{
          data: invalidTask,
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      await expect(worker.runUntil(handle.result())).rejects.toThrow();
    });
  });

  // ============================================================================
  // Signal and Query Tests
  // ============================================================================

  describe('Dynamic Workflow Control', () => {
    it('should pause and resume workflow via signals', async () => {
      const workflowId = `test-signals-${uuid()}`;
      
      const handle = await temporalClient.startWorkflow(
        'advancedControlWorkflow',
        [{
          data: {
            tasks: Array.from({ length: 5 }, (_, i) => ({
              id: `task-${i}`,
              type: 'data_processing' as const,
              payload: { steps: 2 },
              priority: 'normal' as const,
              timeout: '5m',
              metadata: {}
            }))
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      // Start workflow execution
      const resultPromise = worker.runUntil(handle.result());

      // Pause workflow
      await workflowController.pauseWorkflow(workflowId);
      
      // Check if paused
      const isPaused = await workflowController.isWorkflowPaused(workflowId);
      expect(isPaused).toBe(true);

      // Resume workflow
      await workflowController.resumeWorkflow(workflowId);

      // Wait for completion
      const result = await resultPromise;
      expect(result.status).toBe('completed');
    });

    it('should query workflow state and progress', async () => {
      const workflowId = `test-queries-${uuid()}`;
      
      const handle = await temporalClient.startWorkflow(
        'advancedControlWorkflow',
        [{
          data: {
            tasks: Array.from({ length: 3 }, (_, i) => ({
              id: `task-${i}`,
              type: 'data_processing' as const,
              payload: { steps: 1 },
              priority: 'normal' as const,
              timeout: '5m',
              metadata: {}
            }))
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      // Start workflow execution
      const resultPromise = worker.runUntil(handle.result());

      // Query workflow state
      const state = await workflowController.getWorkflowState(workflowId);
      expect(state.status).toBeDefined();
      expect(state.pendingTasks).toBeDefined();

      // Query progress
      const progress = await workflowController.getProgress(workflowId);
      expect(progress.total).toBeGreaterThan(0);

      // Wait for completion
      await resultPromise;
    });

    it('should update workflow configuration dynamically', async () => {
      const workflowId = `test-updates-${uuid()}`;
      
      const handle = await temporalClient.startWorkflow(
        'advancedControlWorkflow',
        [{
          data: {
            tasks: [{
              id: 'task-1',
              type: 'data_processing' as const,
              payload: { steps: 1 },
              priority: 'normal' as const,
              timeout: '5m',
              metadata: {}
            }]
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      // Update configuration
      await workflowController.updateConfiguration(workflowId, {
        priority: 'high',
        timeout: '10m',
        notifyOnCompletion: true
      }, { waitForResult: true });

      // Add new task
      const newTaskId = await workflowController.addTask(workflowId, {
        id: 'task-2',
        type: 'data_processing',
        payload: { steps: 2 },
        priority: 'high',
        timeout: '5m',
        metadata: {}
      }, { waitForResult: true });

      expect(newTaskId).toBe('task-2');

      // Complete workflow
      await worker.runUntil(handle.result());
    });
  });

  // ============================================================================
  // Schedule and Timer Tests
  // ============================================================================

  describe('Scheduling and Timers', () => {
    it('should create and execute a scheduled workflow', async () => {
      const scheduleId = `test-schedule-${uuid()}`;
      
      const schedule = await scheduleManager.createSchedule(scheduleId, {
        workflowType: 'taskProcessingWorkflow',
        taskQueue: TEST_TASK_QUEUE,
        cronExpression: '*/5 * * * * *', // Every 5 seconds
        workflowArgs: [{
          data: {
            id: 'scheduled-task',
            type: 'data_processing',
            payload: { steps: 1 },
            priority: 'normal',
            timeout: '5m',
            metadata: {}
          },
          context: {
            workflowId: `scheduled-${uuid()}`,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        description: 'Test schedule'
      });

      // Get schedule info
      const info = await scheduleManager.getScheduleInfo(scheduleId);
      expect(info.schedule.spec.cronExpressions).toContain('*/5 * * * * *');

      // Trigger schedule manually
      await scheduleManager.triggerSchedule(scheduleId);

      // Pause and resume
      await scheduleManager.pauseSchedule(scheduleId);
      await scheduleManager.resumeSchedule(scheduleId);

      // Cleanup
      await scheduleManager.deleteSchedule(scheduleId);
    });

    it('should execute interval-based scheduled workflow', async () => {
      const workflowId = `test-interval-${uuid()}`;
      
      const handle = await temporalClient.startWorkflow(
        'intervalScheduledWorkflow',
        [{
          data: {
            intervalMs: 1000, // 1 second
            taskTemplate: {
              id: 'interval-task',
              type: 'data_processing',
              payload: { steps: 1 },
              priority: 'normal',
              timeout: '5m',
              metadata: {}
            },
            maxExecutions: 3,
            jitterMs: 100
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      // Use time skipping to speed up test
      await testEnv.sleep('5s');
      
      const result = await worker.runUntil(handle.result());
      
      expect(result.status).toBe('completed');
      expect(result.executionsCompleted).toBe(3);
    });
  });

  // ============================================================================
  // Performance and Monitoring Tests
  // ============================================================================

  describe('Performance Optimization and Monitoring', () => {
    it('should track workflow metrics', async () => {
      const workflowId = `test-metrics-${uuid()}`;
      
      // Reset metrics
      const metricsCollector = MetricsCollector.getInstance();
      metricsCollector.reset();

      const handle = await temporalClient.startWorkflow(
        'taskProcessingWorkflow',
        [{
          data: {
            id: 'metrics-task',
            type: 'data_processing',
            payload: { steps: 2 },
            priority: 'normal',
            timeout: '5m',
            metadata: {}
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      await worker.runUntil(handle.result());

      // Check metrics
      const metrics = metricsCollector.getMetrics();
      expect(metrics.workflows.started).toBeGreaterThan(0);
      expect(metrics.workflows.completed).toBeGreaterThan(0);
      expect(metrics.activities.started).toBeGreaterThan(0);
      expect(metrics.activities.completed).toBeGreaterThan(0);
    });

    it('should cache workflow results', async () => {
      const cacheManager = PerformanceCacheManager.getInstance();
      cacheManager.initializeCache('test-cache', { maxSize: 10, ttlMs: 60000 });

      // Set cache value
      cacheManager.set('test-cache', 'test-key', { data: 'test-value' });

      // Get cache value
      const cached = cacheManager.get('test-cache', 'test-key');
      expect(cached).toEqual({ data: 'test-value' });

      // Check cache stats
      const stats = cacheManager.getCacheStats();
      expect(stats['test-cache'].hits).toBeGreaterThan(0);
    });

    it('should monitor system health', async () => {
      const healthMonitor = HealthMonitor.getInstance();
      
      // Add health check
      healthMonitor.addHealthCheck('test-check', async () => {
        return true; // Healthy
      });

      // Run health checks
      const health = await healthMonitor.runHealthChecks();
      
      expect(health.status).toBe('healthy');
      expect(health.checks['test-check']).toBe(true);
      expect(health.metrics.successRate).toBe(100);
    });
  });

  // ============================================================================
  // Batch Processing Tests
  // ============================================================================

  describe('Batch Processing', () => {
    it('should process tasks in batches', async () => {
      const workflowId = `test-batch-${uuid()}`;
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-task-${i}`,
        type: 'data_processing' as const,
        payload: { steps: 1 },
        priority: 'normal' as const,
        timeout: '5m',
        metadata: { batchIndex: i }
      }));

      const handle = await temporalClient.startWorkflow(
        'batchProcessingWorkflow',
        [{
          data: { tasks, batchSize: 3 },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      const result = await worker.runUntil(handle.result());
      
      expect(result.status).toBe('completed');
      expect(result.result).toHaveLength(10);
      expect(result.metadata.totalBatches).toBe(4); // 10 tasks in batches of 3
      expect(result.metadata.successCount).toBe(10);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling and Recovery', () => {
    it('should handle activity failures with retry', async () => {
      const workflowId = `test-retry-${uuid()}`;
      
      // Create a task that will fail initially
      const handle = await temporalClient.startWorkflow(
        'taskProcessingWorkflow',
        [{
          data: {
            id: 'retry-task',
            type: 'api_call',
            payload: { 
              endpoint: '/api/test',
              simulateFailure: true // Will fail first 2 attempts
            },
            priority: 'normal',
            timeout: '5m',
            metadata: {}
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      const result = await worker.runUntil(handle.result());
      
      // Should succeed after retries
      expect(result.status).toBe('completed');
    });

    it('should handle workflow cancellation', async () => {
      const workflowId = `test-cancel-${uuid()}`;
      
      const handle = await temporalClient.startWorkflow(
        'longRunningWorkflow',
        [{
          data: { maxIterations: 100 }, // Long running
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      // Start workflow
      const resultPromise = worker.runUntil(handle.result());

      // Cancel after a short time
      await testEnv.sleep('1s');
      await workflowController.cancelWorkflow(workflowId, 'Test cancellation');

      // Should handle cancellation gracefully
      await expect(resultPromise).resolves.toBeDefined();
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Full Integration Scenarios', () => {
    it('should execute complex workflow with monitoring and optimization', async () => {
      const workflowId = `test-integration-${uuid()}`;
      
      // Start monitoring
      const metricsCollector = MetricsCollector.getInstance();
      metricsCollector.startCollection(1000);

      // Create workflow with multiple features
      const handle = await temporalClient.startWorkflow(
        'advancedControlWorkflow',
        [{
          data: {
            tasks: Array.from({ length: 5 }, (_, i) => ({
              id: `complex-task-${i}`,
              type: i % 2 === 0 ? 'data_processing' : 'api_call',
              payload: { 
                steps: 2,
                complexity: 'high'
              },
              priority: i === 0 ? 'high' : 'normal',
              timeout: '5m',
              metadata: { index: i }
            })),
            configuration: {
              validateTasks: true,
              notifyOnCompletion: true,
              generateReport: true,
              priority: 'high'
            },
            schedule: {
              checkIntervalMs: 1000,
              batchSize: 2
            }
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {
              testType: 'integration',
              features: ['monitoring', 'optimization', 'scheduling']
            }
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      // Add dynamic task while running
      await testEnv.sleep('500ms');
      await workflowController.addTask(workflowId, {
        id: 'dynamic-task',
        type: 'notification',
        payload: { recipient: 'test@example.com' },
        priority: 'high',
        timeout: '2m',
        metadata: { addedDynamically: true }
      });

      // Query state mid-execution
      const midState = await workflowController.getWorkflowState(workflowId);
      expect(midState.status).toBe('running');

      // Complete workflow
      const result = await worker.runUntil(handle.result());
      
      expect(result.status).toBe('completed');
      expect(result.results.length).toBeGreaterThan(0);

      // Check final metrics
      const finalMetrics = await workflowController.getExecutionMetrics(workflowId);
      expect(finalMetrics.tasksCompleted).toBeGreaterThan(0);

      // Stop monitoring
      metricsCollector.stopCollection();
    });

    it('should handle concurrent workflows with resource management', async () => {
      const workflows = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-${uuid()}-${i}`,
        task: {
          id: `concurrent-task-${i}`,
          type: 'data_processing' as const,
          payload: { steps: 2 },
          priority: 'normal' as const,
          timeout: '5m',
          metadata: { concurrent: true }
        }
      }));

      // Start all workflows concurrently
      const handles = await Promise.all(
        workflows.map(w => 
          temporalClient.startWorkflow(
            'taskProcessingWorkflow',
            [{
              data: w.task,
              context: {
                workflowId: w.id,
                taskQueue: TEST_TASK_QUEUE,
                namespace: TEST_NAMESPACE,
                startedAt: new Date(),
                metadata: {}
              }
            }],
            { workflowId: w.id, taskQueue: TEST_TASK_QUEUE }
          )
        )
      );

      // Wait for all to complete
      const results = await Promise.all(
        handles.map(h => worker.runUntil(h.result()))
      );

      // All should complete successfully
      results.forEach(result => {
        expect(result.status).toBe('completed');
      });

      // Check resource metrics
      const resourceMonitor = ResourceMonitor.getInstance();
      const metrics = resourceMonitor.getMetrics();
      expect(metrics.cpuUsage).toBeDefined();
      expect(metrics.memoryUsage).toBeDefined();
    });
  });

  // ============================================================================
  // Stress Tests
  // ============================================================================

  describe('Stress Testing', () => {
    it('should handle high throughput of short tasks', async () => {
      const taskCount = 50;
      const tasks = Array.from({ length: taskCount }, (_, i) => ({
        id: `stress-task-${i}`,
        type: 'data_processing' as const,
        payload: { steps: 1 }, // Short tasks
        priority: 'normal' as const,
        timeout: '1m',
        metadata: { stress: true }
      }));

      const workflowId = `test-stress-${uuid()}`;
      const startTime = Date.now();

      const handle = await temporalClient.startWorkflow(
        'batchProcessingWorkflow',
        [{
          data: { tasks, batchSize: 10 },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: { stressTest: true }
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      const result = await worker.runUntil(handle.result());
      const duration = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(result.result).toHaveLength(taskCount);
      
      // Calculate throughput
      const throughput = (taskCount / duration) * 1000; // tasks per second
      console.log(`Throughput: ${throughput.toFixed(2)} tasks/second`);
      
      expect(throughput).toBeGreaterThan(1); // At least 1 task per second
    });

    it('should handle memory-intensive workflows', async () => {
      const workflowId = `test-memory-${uuid()}`;
      
      // Large payload to test memory handling
      const largePayload = {
        data: Array(1000).fill('x'.repeat(1000)), // ~1MB of data
        nested: {
          level1: {
            level2: {
              level3: Array(100).fill({ key: 'value' })
            }
          }
        }
      };

      const handle = await temporalClient.startWorkflow(
        'taskProcessingWorkflow',
        [{
          data: {
            id: 'memory-task',
            type: 'data_processing',
            payload: largePayload,
            priority: 'normal',
            timeout: '5m',
            metadata: { memoryTest: true }
          },
          context: {
            workflowId,
            taskQueue: TEST_TASK_QUEUE,
            namespace: TEST_NAMESPACE,
            startedAt: new Date(),
            metadata: {}
          }
        }],
        { workflowId, taskQueue: TEST_TASK_QUEUE }
      );

      const result = await worker.runUntil(handle.result());
      
      expect(result.status).toBe('completed');
      
      // Check memory metrics
      const resourceMonitor = ResourceMonitor.getInstance();
      const metrics = resourceMonitor.getMetrics();
      expect(metrics.memoryUsage).toBeLessThan(90); // Should not exceed 90% memory
    });
  });
});

// ============================================================================
// Test Utilities
// ============================================================================

const testUtils = {
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  createMockActivities: () => ({
    processTask: activities.processTask,
    validateInput: activities.validateInput,
    updateStatus: activities.updateStatus,
    sendNotification: activities.sendNotification,
    generateReport: activities.generateReport,
    cleanupResources: activities.cleanupResources,
    healthCheck: activities.healthCheck
  })
};