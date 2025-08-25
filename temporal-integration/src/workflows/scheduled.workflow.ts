/**
 * Scheduled Workflows with Timer Integration
 * Demonstrates various scheduling patterns and timer usage
 */

import { 
  sleep, 
  workflowInfo, 
  log,
  startChild,
  setHandler,
  defineSignal,
  defineQuery,
  condition,
  allHandlersFinished,
  CancellationScope,
  isCancellation
} from '@temporalio/workflow';

import { proxyActivities } from '@temporalio/workflow';
import * as activities from '../activities';
import { 
  WorkflowInput,
  TaskRequest,
  ScheduledWorkflowConfig,
  TimerEvent,
  RecurringTaskConfig
} from '../types';
import { RetryPolicies } from '../utils/error-handling';

// Configure activity proxies
const {
  processTask,
  validateInput,
  updateStatus,
  sendNotification,
  generateReport,
  healthCheck
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
  retry: RetryPolicies.STANDARD
});

// ============================================================================
// Signals and Queries for Scheduled Workflows
// ============================================================================

export const scheduleTaskSignal = defineSignal<[TaskRequest]>('scheduleTask');
export const cancelScheduledTaskSignal = defineSignal<[string]>('cancelScheduledTask');
export const updateScheduleSignal = defineSignal<[ScheduledWorkflowConfig]>('updateSchedule');
export const pauseScheduleSignal = defineSignal<[]>('pauseSchedule');
export const resumeScheduleSignal = defineSignal<[]>('resumeSchedule');

export const getScheduledTasksQuery = defineQuery<TaskRequest[]>('getScheduledTasks');
export const getNextExecutionTimeQuery = defineQuery<Date | null>('getNextExecutionTime');
export const getScheduleStatusQuery = defineQuery<'active' | 'paused' | 'stopped'>('getScheduleStatus');
export const getExecutionHistoryQuery = defineQuery<Array<{ timestamp: Date; taskId: string; result: string }>>('getExecutionHistory');

// ============================================================================
// Cron-based Scheduled Workflow
// ============================================================================

export async function cronScheduledWorkflow(
  input: WorkflowInput<{
    cronExpression: string;
    taskTemplate: TaskRequest;
    maxExecutions?: number;
    timezone?: string;
  }>
): Promise<{ status: string; executionsCompleted: number; totalDuration: number }> {
  const { cronExpression, taskTemplate, maxExecutions = -1, timezone = 'UTC' } = input.data;
  const workflowId = workflowInfo().workflowId;
  const startTime = Date.now();
  
  let executionsCompleted = 0;
  let isActive = true;
  let isPaused = false;
  const executionHistory: Array<{ timestamp: Date; taskId: string; result: string }> = [];

  log.info('Cron scheduled workflow started', { 
    cronExpression, 
    maxExecutions, 
    timezone 
  });

  // Signal handlers
  setHandler(pauseScheduleSignal, () => {
    isPaused = true;
    log.info('Schedule paused');
  });

  setHandler(resumeScheduleSignal, () => {
    isPaused = false;
    log.info('Schedule resumed');
  });

  // Query handlers
  setHandler(getScheduleStatusQuery, () => {
    if (!isActive) return 'stopped';
    return isPaused ? 'paused' : 'active';
  });

  setHandler(getExecutionHistoryQuery, () => executionHistory);

  try {
    while (isActive && (maxExecutions === -1 || executionsCompleted < maxExecutions)) {
      // Wait for next scheduled time
      const nextExecution = calculateNextCronExecution(cronExpression, timezone);
      const waitTime = nextExecution.getTime() - Date.now();
      
      if (waitTime > 0) {
        log.info('Waiting for next execution', { 
          nextExecution: nextExecution.toISOString(),
          waitTimeMs: waitTime 
        });
        
        await sleep(waitTime);
      }

      // Check if paused
      await condition(() => !isPaused);

      if (!isActive) break;

      // Execute scheduled task
      const taskId = `${taskTemplate.id}-${Date.now()}`;
      const scheduledTask: TaskRequest = {
        ...taskTemplate,
        id: taskId,
        metadata: {
          ...taskTemplate.metadata,
          scheduledExecution: 'true',
          executionNumber: String(executionsCompleted + 1),
          scheduledTime: new Date().toISOString()
        }
      };

      log.info('Executing scheduled task', { taskId, executionNumber: executionsCompleted + 1 });

      try {
        // Validate and process the task
        await validateInput(scheduledTask);

        const result = await processTask({
          data: scheduledTask,
          context: {
            activityId: `process-${taskId}`,
            workflowId,
            attemptNumber: 1,
            info: {
              taskQueue: workflowInfo().taskQueue,
              activityType: 'processTask',
              scheduledTime: new Date(),
              startedTime: new Date()
            }
          }
        });

        // Update status
        await updateStatus({
          data: {
            taskId,
            status: 'completed',
            result: result.result
          },
          context: {
            activityId: `status-${taskId}`,
            workflowId,
            attemptNumber: 1,
            info: {
              taskQueue: workflowInfo().taskQueue,
              activityType: 'updateStatus',
              scheduledTime: new Date(),
              startedTime: new Date()
            }
          }
        });

        executionsCompleted++;
        executionHistory.push({
          timestamp: new Date(),
          taskId,
          result: 'completed'
        });

        log.info('Scheduled task completed successfully', { 
          taskId, 
          executionsCompleted 
        });

      } catch (error) {
        executionHistory.push({
          timestamp: new Date(),
          taskId,
          result: `failed: ${error instanceof Error ? error.message : String(error)}`
        });

        log.error('Scheduled task failed', { 
          taskId, 
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // Limit history size
      if (executionHistory.length > 1000) {
        executionHistory.splice(0, 500);
      }
    }

    isActive = false;
    const totalDuration = Date.now() - startTime;

    log.info('Cron scheduled workflow completed', {
      executionsCompleted,
      totalDurationMs: totalDuration
    });

    return {
      status: 'completed',
      executionsCompleted,
      totalDuration
    };

  } catch (error) {
    if (isCancellation(error)) {
      log.info('Cron scheduled workflow cancelled', { executionsCompleted });
      return {
        status: 'cancelled',
        executionsCompleted,
        totalDuration: Date.now() - startTime
      };
    }
    
    log.error('Cron scheduled workflow failed', { 
      error: error instanceof Error ? error.message : String(error),
      executionsCompleted
    });
    
    throw error;
  }
}

// ============================================================================
// Interval-based Scheduled Workflow
// ============================================================================

export async function intervalScheduledWorkflow(
  input: WorkflowInput<{
    intervalMs: number;
    taskTemplate: TaskRequest;
    maxExecutions?: number;
    jitterMs?: number;
  }>
): Promise<{ status: string; executionsCompleted: number; averageInterval: number }> {
  const { intervalMs, taskTemplate, maxExecutions = -1, jitterMs = 0 } = input.data;
  const workflowId = workflowInfo().workflowId;
  
  let executionsCompleted = 0;
  let isActive = true;
  let isPaused = false;
  const intervals: number[] = [];

  log.info('Interval scheduled workflow started', { 
    intervalMs, 
    maxExecutions, 
    jitterMs 
  });

  // Signal handlers
  setHandler(pauseScheduleSignal, () => {
    isPaused = true;
    log.info('Interval schedule paused');
  });

  setHandler(resumeScheduleSignal, () => {
    isPaused = false;
    log.info('Interval schedule resumed');
  });

  try {
    while (isActive && (maxExecutions === -1 || executionsCompleted < maxExecutions)) {
      const intervalStart = Date.now();

      // Calculate interval with jitter
      let actualInterval = intervalMs;
      if (jitterMs > 0) {
        const jitter = Math.random() * jitterMs * 2 - jitterMs; // ±jitterMs
        actualInterval = Math.max(1000, intervalMs + jitter); // Minimum 1 second
      }

      log.info('Waiting for interval', { 
        intervalMs: actualInterval,
        executionNumber: executionsCompleted + 1 
      });

      await sleep(actualInterval);

      // Check if paused
      await condition(() => !isPaused);

      if (!isActive) break;

      // Execute task
      const taskId = `${taskTemplate.id}-interval-${Date.now()}`;
      const intervalTask: TaskRequest = {
        ...taskTemplate,
        id: taskId,
        metadata: {
          ...taskTemplate.metadata,
          intervalExecution: 'true',
          executionNumber: String(executionsCompleted + 1),
          actualInterval: String(actualInterval)
        }
      };

      try {
        const result = await processTask({
          data: intervalTask,
          context: {
            activityId: `process-${taskId}`,
            workflowId,
            attemptNumber: 1,
            info: {
              taskQueue: workflowInfo().taskQueue,
              activityType: 'processTask',
              scheduledTime: new Date(),
              startedTime: new Date()
            }
          }
        });

        executionsCompleted++;
        intervals.push(Date.now() - intervalStart);

        log.info('Interval task completed', { 
          taskId, 
          executionsCompleted,
          actualInterval 
        });

      } catch (error) {
        log.error('Interval task failed', { 
          taskId, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const averageInterval = intervals.length > 0 
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
      : 0;

    log.info('Interval scheduled workflow completed', {
      executionsCompleted,
      averageInterval
    });

    return {
      status: 'completed',
      executionsCompleted,
      averageInterval
    };

  } catch (error) {
    if (isCancellation(error)) {
      log.info('Interval scheduled workflow cancelled', { executionsCompleted });
      return {
        status: 'cancelled',
        executionsCompleted,
        averageInterval: 0
      };
    }
    
    throw error;
  }
}

// ============================================================================
// Dynamic Scheduled Workflow
// ============================================================================

export async function dynamicScheduledWorkflow(
  input: WorkflowInput<{
    initialConfig: ScheduledWorkflowConfig;
    maxDuration?: string;
  }>
): Promise<{ status: string; tasksProcessed: number; configChanges: number }> {
  const { initialConfig, maxDuration = '24h' } = input.data;
  const workflowId = workflowInfo().workflowId;
  
  let currentConfig = { ...initialConfig };
  let scheduledTasks: TaskRequest[] = [];
  let isActive = true;
  let isPaused = false;
  let tasksProcessed = 0;
  let configChanges = 0;

  log.info('Dynamic scheduled workflow started', { initialConfig, maxDuration });

  // Signal handlers
  setHandler(scheduleTaskSignal, (task: TaskRequest) => {
    scheduledTasks.push({
      ...task,
      metadata: {
        ...task.metadata,
        dynamicallyScheduled: 'true',
        addedAt: new Date().toISOString()
      }
    });
    log.info('Task dynamically scheduled', { taskId: task.id });
  });

  setHandler(cancelScheduledTaskSignal, (taskId: string) => {
    const initialLength = scheduledTasks.length;
    scheduledTasks = scheduledTasks.filter(task => task.id !== taskId);
    const removed = scheduledTasks.length < initialLength;
    log.info('Task cancellation requested', { taskId, removed });
  });

  setHandler(updateScheduleSignal, (newConfig: ScheduledWorkflowConfig) => {
    currentConfig = { ...currentConfig, ...newConfig };
    configChanges++;
    log.info('Schedule configuration updated', { configChanges });
  });

  setHandler(pauseScheduleSignal, () => {
    isPaused = true;
    log.info('Dynamic schedule paused');
  });

  setHandler(resumeScheduleSignal, () => {
    isPaused = false;
    log.info('Dynamic schedule resumed');
  });

  // Query handlers
  setHandler(getScheduledTasksQuery, () => scheduledTasks);
  setHandler(getNextExecutionTimeQuery, () => {
    if (scheduledTasks.length === 0) return null;
    const now = new Date();
    return new Date(now.getTime() + (currentConfig.checkIntervalMs || 5000));
  });
  setHandler(getScheduleStatusQuery, () => {
    if (!isActive) return 'stopped';
    return isPaused ? 'paused' : 'active';
  });

  try {
    // Set up workflow timeout
    await CancellationScope.cancellable(async () => {
      const maxDurationMs = parseDuration(maxDuration);
      
      await CancellationScope.withTimeout(maxDurationMs, async () => {
        while (isActive) {
          // Wait for check interval
          await sleep(currentConfig.checkIntervalMs || 5000);

          // Check if paused
          await condition(() => !isPaused);

          if (!isActive || scheduledTasks.length === 0) {
            continue;
          }

          // Process scheduled tasks
          const tasksToProcess = scheduledTasks.splice(0, currentConfig.batchSize || 5);
          
          if (tasksToProcess.length > 0) {
            log.info('Processing scheduled tasks batch', { 
              count: tasksToProcess.length,
              remainingTasks: scheduledTasks.length 
            });

            // Process tasks in parallel
            const taskPromises = tasksToProcess.map(async (task) => {
              try {
                const result = await processTask({
                  data: task,
                  context: {
                    activityId: `process-${task.id}`,
                    workflowId,
                    attemptNumber: 1,
                    info: {
                      taskQueue: workflowInfo().taskQueue,
                      activityType: 'processTask',
                      scheduledTime: new Date(),
                      startedTime: new Date()
                    }
                  }
                });

                tasksProcessed++;
                log.info('Dynamic task completed', { taskId: task.id });
                return { taskId: task.id, success: true, result };

              } catch (error) {
                log.error('Dynamic task failed', { 
                  taskId: task.id, 
                  error: error instanceof Error ? error.message : String(error)
                });
                return { taskId: task.id, success: false, error };
              }
            });

            await Promise.allSettled(taskPromises);
          }
        }
      });
    });

    log.info('Dynamic scheduled workflow completed', {
      tasksProcessed,
      configChanges,
      remainingTasks: scheduledTasks.length
    });

    return {
      status: 'completed',
      tasksProcessed,
      configChanges
    };

  } catch (error) {
    if (isCancellation(error)) {
      log.info('Dynamic scheduled workflow cancelled', { tasksProcessed, configChanges });
      return {
        status: 'cancelled',
        tasksProcessed,
        configChanges
      };
    }
    
    throw error;
  }
}

// ============================================================================
// Recurring Batch Workflow
// ============================================================================

export async function recurringBatchWorkflow(
  input: WorkflowInput<{
    config: RecurringTaskConfig;
    batchSize: number;
    processingInterval: string;
  }>
): Promise<{ status: string; batchesProcessed: number; totalTasksProcessed: number }> {
  const { config, batchSize, processingInterval } = input.data;
  const workflowId = workflowInfo().workflowId;
  
  let batchesProcessed = 0;
  let totalTasksProcessed = 0;
  let isActive = true;

  log.info('Recurring batch workflow started', { config, batchSize, processingInterval });

  try {
    while (isActive) {
      // Generate batch of tasks
      const batch = generateTaskBatch(config, batchSize, batchesProcessed);
      
      if (batch.length === 0) {
        log.info('No more tasks to generate, stopping workflow');
        break;
      }

      log.info('Processing batch', { 
        batchNumber: batchesProcessed + 1,
        taskCount: batch.length 
      });

      // Process batch using child workflow
      const childResult = await startChild('batchProcessingWorkflow', {
        args: [{
          data: { tasks: batch, batchSize },
          context: {
            workflowId: `${workflowId}-batch-${batchesProcessed + 1}`,
            taskQueue: workflowInfo().taskQueue,
            namespace: 'default',
            startedAt: new Date(),
            metadata: {
              parentWorkflowId: workflowId,
              batchNumber: batchesProcessed + 1
            }
          }
        }],
        workflowId: `${workflowId}-batch-${batchesProcessed + 1}`
      });

      const batchResult = await childResult.result();
      
      batchesProcessed++;
      totalTasksProcessed += batchResult.result.length;

      log.info('Batch completed', { 
        batchNumber: batchesProcessed,
        tasksInBatch: batchResult.result.length,
        totalTasksProcessed 
      });

      // Wait for next processing interval
      const intervalMs = parseDuration(processingInterval);
      await sleep(intervalMs);

      // Check if we should continue
      if (config.maxBatches && batchesProcessed >= config.maxBatches) {
        log.info('Max batches reached, stopping workflow', { maxBatches: config.maxBatches });
        break;
      }
    }

    log.info('Recurring batch workflow completed', {
      batchesProcessed,
      totalTasksProcessed
    });

    return {
      status: 'completed',
      batchesProcessed,
      totalTasksProcessed
    };

  } catch (error) {
    if (isCancellation(error)) {
      log.info('Recurring batch workflow cancelled', { batchesProcessed, totalTasksProcessed });
      return {
        status: 'cancelled',
        batchesProcessed,
        totalTasksProcessed
      };
    }
    
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateNextCronExecution(cronExpression: string, timezone: string): Date {
  // Simplified cron calculation - in a real implementation, use a proper cron library
  const now = new Date();
  const nextExecution = new Date(now.getTime() + 60000); // Default to 1 minute from now
  
  // Parse cron expression and calculate actual next execution time
  // This is a placeholder - use libraries like node-cron or cron-parser
  
  return nextExecution;
}

function parseDuration(duration: string): number {
  // Simple duration parser
  const units: Record<string, number> = {
    'ms': 1,
    's': 1000,
    'm': 60000,
    'h': 3600000,
    'd': 86400000
  };
  
  const match = duration.match(/^(\d+)([smhd]?)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  
  const value = parseInt(match[1]);
  const unit = match[2] || 'ms';
  
  return value * (units[unit as keyof typeof units] || 1);
}

function generateTaskBatch(
  config: RecurringTaskConfig, 
  batchSize: number, 
  batchNumber: number
): TaskRequest[] {
  const tasks: TaskRequest[] = [];
  
  for (let i = 0; i < batchSize; i++) {
    const taskId = `${config.taskIdPrefix || 'task'}-batch-${batchNumber}-${i}`;
    
    tasks.push({
      id: taskId,
      type: config.taskType,
      payload: {
        ...(typeof config.taskPayload === 'object' && config.taskPayload !== null ? config.taskPayload : {}),
        batchNumber,
        taskIndex: i
      },
      priority: config.priority || 'normal',
      timeout: config.timeout || '5m',
      metadata: {
        batchGenerated: 'true',
        batchNumber: String(batchNumber),
        taskIndex: String(i),
        generatedAt: new Date().toISOString()
      }
    });
  }
  
  return tasks;
}