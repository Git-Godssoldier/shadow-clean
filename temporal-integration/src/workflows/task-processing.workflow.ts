/**
 * Core Task Processing Workflow
 * Demonstrates fundamental workflow patterns with durable execution
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  defineUpdate,
  setHandler,
  condition,
  sleep,
  CancellationScope,
  continueAsNew,
  log
} from '@temporalio/workflow';

import type * as activities from '../activities';
import type {
  TaskRequest,
  TaskResult,
  TaskStatus,
  WorkflowInput,
  WorkflowOutput
} from '../types';

// ============================================================================
// Activity Proxy Configuration
// ============================================================================

const {
  processTask,
  validateInput,
  sendNotification,
  updateStatus,
  generateReport,
  cleanupResources
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  scheduleToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '1 minute',
    backoffCoefficient: 2,
    maximumAttempts: 5,
    nonRetryableErrorTypes: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError'
    ]
  },
  heartbeatTimeout: '30 seconds'
});

// ============================================================================
// Signal, Query, and Update Definitions
// ============================================================================

export const pauseTaskSignal = defineSignal<[]>('pauseTask');
export const resumeTaskSignal = defineSignal<[]>('resumeTask');
export const cancelTaskSignal = defineSignal<[string]>('cancelTask');
export const updatePrioritySignal = defineSignal<[string]>('updatePriority');

export const getTaskStatusQuery = defineQuery<TaskStatus>('getTaskStatus');
export const getProgressQuery = defineQuery<{ completed: number; total: number }>('getProgress');
export const getMetadataQuery = defineQuery<Record<string, unknown>>('getMetadata');

export const updateConfigUpdate = defineUpdate<boolean, [Record<string, unknown>]>('updateConfig');
export const rescheduleUpdate = defineUpdate<string, [Date]>('reschedule');

// ============================================================================
// Main Task Processing Workflow
// ============================================================================

export async function taskProcessingWorkflow(
  input: WorkflowInput<TaskRequest>
): Promise<WorkflowOutput<TaskResult>> {
  const { data: task, context } = input;
  
  // Initialize workflow state
  let currentStatus: TaskStatus = 'pending';
  let progress = { completed: 0, total: 1 };
  let metadata: Record<string, unknown> = {
    workflowId: context.workflowId,
    startedAt: new Date().toISOString(),
    ...task.metadata
  };
  let isPaused = false;
  let isCancelled = false;
  let cancelReason = '';

  log.info('Task processing workflow started', {
    taskId: task.id,
    taskType: task.type,
    priority: task.priority
  });

  // ============================================================================
  // Signal Handlers
  // ============================================================================

  setHandler(pauseTaskSignal, () => {
    isPaused = true;
    currentStatus = 'pending';
    log.info('Task paused by signal', { taskId: task.id });
  });

  setHandler(resumeTaskSignal, () => {
    isPaused = false;
    if (currentStatus === 'pending') {
      currentStatus = 'in_progress';
    }
    log.info('Task resumed by signal', { taskId: task.id });
  });

  setHandler(cancelTaskSignal, (reason: string) => {
    isCancelled = true;
    cancelReason = reason;
    currentStatus = 'cancelled';
    log.info('Task cancelled by signal', { taskId: task.id, reason });
  });

  setHandler(updatePrioritySignal, (newPriority: string) => {
    task.priority = newPriority as any;
    metadata.priorityUpdatedAt = new Date().toISOString();
    log.info('Task priority updated', { taskId: task.id, newPriority });
  });

  // ============================================================================
  // Query Handlers
  // ============================================================================

  setHandler(getTaskStatusQuery, () => currentStatus);
  setHandler(getProgressQuery, () => progress);
  setHandler(getMetadataQuery, () => metadata);

  // ============================================================================
  // Update Handlers
  // ============================================================================

  setHandler(updateConfigUpdate, async (newConfig: Record<string, unknown>) => {
    const oldConfig = { ...metadata };
    metadata = { ...metadata, ...newConfig, configUpdatedAt: new Date().toISOString() };
    
    log.info('Configuration updated', {
      taskId: task.id,
      oldConfig,
      newConfig
    });
    
    return true;
  });

  setHandler(rescheduleUpdate, async (newScheduleTime: Date) => {
    const currentTime = new Date();
    const delayMs = newScheduleTime.getTime() - currentTime.getTime();
    
    if (delayMs > 0) {
      metadata.rescheduledAt = currentTime.toISOString();
      metadata.newScheduleTime = newScheduleTime.toISOString();
      
      log.info('Task rescheduled', {
        taskId: task.id,
        delayMs,
        newScheduleTime: newScheduleTime.toISOString()
      });
      
      await sleep(delayMs);
      return `Rescheduled to ${newScheduleTime.toISOString()}`;
    }
    
    return 'No reschedule needed - time in past';
  });

  // ============================================================================
  // Main Workflow Logic
  // ============================================================================

  try {
    currentStatus = 'in_progress';
    progress = { completed: 0, total: 5 }; // 5 main steps

    // Step 1: Input validation
    log.info('Starting input validation', { taskId: task.id });
    await validateInput(task);
    progress.completed = 1;
    metadata.validationCompletedAt = new Date().toISOString();

    // Check for cancellation
    if (isCancelled) {
      throw new Error(`Task cancelled: ${cancelReason}`);
    }

    // Step 2: Wait if paused
    await condition(() => !isPaused);
    
    // Step 3: Process the main task
    log.info('Starting main task processing', { taskId: task.id });
    
    const processResult = await CancellationScope.nonCancellable(async () => {
      return await processTask({
        data: task,
        context: {
          activityId: `process-${task.id}`,
          workflowId: context.workflowId,
          attemptNumber: 1,
          info: {
            taskQueue: context.taskQueue,
            activityType: 'processTask',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      });
    });

    progress.completed = 2;
    metadata.processingCompletedAt = new Date().toISOString();

    // Step 4: Update status
    await updateStatus({
      data: {
        taskId: task.id,
        status: 'completed',
        result: processResult.result
      },
      context: {
        activityId: `status-${task.id}`,
        workflowId: context.workflowId,
        attemptNumber: 1,
        info: {
          taskQueue: context.taskQueue,
          activityType: 'updateStatus',
          scheduledTime: new Date(),
          startedTime: new Date()
        }
      }
    });

    progress.completed = 3;

    // Step 5: Send notification
    await sendNotification({
      data: {
        recipient: task.metadata.notificationRecipient || 'system',
        message: `Task ${task.id} completed successfully`,
        taskId: task.id,
        result: processResult.result
      },
      context: {
        activityId: `notify-${task.id}`,
        workflowId: context.workflowId,
        attemptNumber: 1,
        info: {
          taskQueue: context.taskQueue,
          activityType: 'sendNotification',
          scheduledTime: new Date(),
          startedTime: new Date()
        }
      }
    });

    progress.completed = 4;

    // Step 6: Generate report (optional)
    if (task.metadata.generateReport === 'true') {
      await generateReport({
        data: {
          taskId: task.id,
          type: task.type,
          result: processResult.result,
          metadata: metadata
        },
        context: {
          activityId: `report-${task.id}`,
          workflowId: context.workflowId,
          attemptNumber: 1,
          info: {
            taskQueue: context.taskQueue,
            activityType: 'generateReport',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      });
    }

    progress.completed = 5;
    currentStatus = 'completed';

    const result: TaskResult = {
      taskId: task.id,
      status: 'completed',
      result: processResult.result,
      startedAt: new Date(metadata.startedAt as string),
      completedAt: new Date(),
      duration: Date.now() - new Date(metadata.startedAt as string).getTime(),
      attempts: 1,
      metadata: Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [key, String(value)])
      )
    };

    log.info('Task processing completed successfully', {
      taskId: task.id,
      duration: result.duration
    });

    return {
      result,
      status: 'completed',
      metadata: metadata
    };

  } catch (error) {
    currentStatus = 'failed';
    
    log.error('Task processing failed', {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Cleanup resources on failure
    try {
      await cleanupResources({
        data: {
          taskId: task.id,
          reason: 'workflow_failure',
          error: error instanceof Error ? error.message : String(error)
        },
        context: {
          activityId: `cleanup-${task.id}`,
          workflowId: context.workflowId,
          attemptNumber: 1,
          info: {
            taskQueue: context.taskQueue,
            activityType: 'cleanupResources',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      });
    } catch (cleanupError) {
      log.error('Cleanup failed', {
        taskId: task.id,
        cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      });
    }

    const result: TaskResult = {
      taskId: task.id,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      startedAt: new Date(metadata.startedAt as string),
      completedAt: new Date(),
      duration: Date.now() - new Date(metadata.startedAt as string).getTime(),
      attempts: 1,
      metadata: Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [key, String(value)])
      )
    };

    return {
      result,
      status: 'failed',
      metadata: {
        ...metadata,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// ============================================================================
// Batch Processing Workflow
// ============================================================================

export async function batchProcessingWorkflow(
  input: WorkflowInput<{ tasks: TaskRequest[]; batchSize?: number }>
): Promise<WorkflowOutput<TaskResult[]>> {
  const { data: { tasks, batchSize = 10 }, context } = input;
  
  let results: TaskResult[] = [];
  let currentBatch = 0;
  const totalBatches = Math.ceil(tasks.length / batchSize);

  log.info('Batch processing workflow started', {
    totalTasks: tasks.length,
    batchSize,
    totalBatches
  });

  // Process tasks in batches
  for (let i = 0; i < tasks.length; i += batchSize) {
    currentBatch++;
    const batch = tasks.slice(i, i + batchSize);
    
    log.info('Processing batch', {
      batchNumber: currentBatch,
      batchSize: batch.length,
      totalBatches
    });

    // Process batch tasks in parallel
    const batchPromises = batch.map((task, index) =>
      taskProcessingWorkflow({
        data: task,
        context: {
          ...context,
          workflowId: `${context.workflowId}-batch-${currentBatch}-task-${index}`,
          metadata: {
            ...context.metadata,
            batchNumber: String(currentBatch),
            taskIndex: String(index)
          }
        }
      })
    );

    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const batchResult of batchResults) {
      if (batchResult.status === 'fulfilled') {
        results.push(batchResult.value.result);
      } else {
        // Handle failed tasks
        const failedResult: TaskResult = {
          taskId: 'unknown',
          status: 'failed',
          error: batchResult.reason?.message || 'Unknown batch processing error',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 0,
          attempts: 1,
          metadata: { batchNumber: String(currentBatch) }
        };
        results.push(failedResult);
      }
    }

    // Add delay between batches to prevent overwhelming downstream services
    if (currentBatch < totalBatches) {
      await sleep('2 seconds');
    }
  }

  const successCount = results.filter(r => r.status === 'completed').length;
  const failureCount = results.filter(r => r.status === 'failed').length;

  log.info('Batch processing completed', {
    totalTasks: tasks.length,
    successCount,
    failureCount,
    successRate: (successCount / tasks.length) * 100
  });

  return {
    result: results,
    status: failureCount === 0 ? 'completed' : 'completed',
    metadata: {
      totalTasks: tasks.length,
      totalBatches,
      successCount,
      failureCount,
      successRate: (successCount / tasks.length) * 100
    }
  };
}

// ============================================================================
// Long-Running Workflow with Continue-As-New
// ============================================================================

export async function longRunningWorkflow(
  input: WorkflowInput<{ maxIterations?: number; currentIteration?: number }>
): Promise<void> {
  const { data: { maxIterations = 1000, currentIteration = 0 }, context } = input;
  
  log.info('Long-running workflow iteration', {
    currentIteration,
    maxIterations
  });

  // Simulate some work
  await sleep('10 seconds');
  
  // Process some tasks
  await processTask({
    data: {
      id: `long-running-${currentIteration}`,
      type: 'monitoring',
      payload: { iteration: currentIteration },
      priority: 'normal',
      timeout: '30s',
      metadata: { iteration: currentIteration.toString() }
    },
    context: {
      activityId: `long-running-${currentIteration}`,
      workflowId: context.workflowId,
      attemptNumber: 1,
      info: {
        taskQueue: context.taskQueue,
        activityType: 'processTask',
        scheduledTime: new Date(),
        startedTime: new Date()
      }
    }
  });

  // Continue as new if we haven't reached max iterations
  if (currentIteration < maxIterations - 1) {
    await continueAsNew<typeof longRunningWorkflow>({
      data: {
        maxIterations,
        currentIteration: currentIteration + 1
      },
      context
    });
  }

  log.info('Long-running workflow completed', {
    totalIterations: currentIteration + 1,
    maxIterations
  });
}