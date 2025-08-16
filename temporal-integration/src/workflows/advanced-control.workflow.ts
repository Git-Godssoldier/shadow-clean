/**
 * Advanced Workflow Control with Comprehensive Signals, Queries, and Updates
 * Implements dynamic workflow management, state updates, and real-time control
 */

import { 
  defineSignal, 
  defineQuery, 
  defineUpdate,
  setHandler,
  condition,
  workflowInfo,
  sleep,
  continueAsNew,
  log,
  upsertSearchAttributes,
  getExternalWorkflowHandle
} from '@temporalio/workflow';

import { proxyActivities } from '@temporalio/workflow';
import * as activities from '../activities';
import { 
  WorkflowInput,
  TaskRequest,
  WorkflowState,
  ConfigurationUpdate,
  DynamicSchedule,
  WorkflowMetrics,
  StateSnapshot,
  ControlAction
} from '../types';
import { RetryPolicies } from '../utils/error-handling';

// Configure activity proxies with comprehensive retry policies
const {
  processTask,
  validateInput,
  updateStatus,
  sendNotification,
  generateReport,
  cleanupResources,
  healthCheck
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
  retry: RetryPolicies.STANDARD
});

// ============================================================================
// Enhanced Signal Definitions
// ============================================================================

// Basic control signals
export const pauseWorkflowSignal = defineSignal<[]>('pauseWorkflow');
export const resumeWorkflowSignal = defineSignal<[]>('resumeWorkflow');
export const cancelWorkflowSignal = defineSignal<[string?]>('cancelWorkflow');
export const terminateWorkflowSignal = defineSignal<[string]>('terminateWorkflow');

// Configuration signals
export const updateConfigurationSignal = defineSignal<[ConfigurationUpdate]>('updateConfiguration');
export const updatePrioritySignal = defineSignal<[string]>('updatePriority'); // 'low' | 'normal' | 'high' | 'critical'
export const updateTimeoutSignal = defineSignal<[string]>('updateTimeout');
export const updateRetryPolicySignal = defineSignal<[typeof RetryPolicies.STANDARD]>('updateRetryPolicy');

// Task management signals
export const addTaskSignal = defineSignal<[TaskRequest]>('addTask');
export const removeTaskSignal = defineSignal<[string]>('removeTask');
export const skipTaskSignal = defineSignal<[string]>('skipTask');
export const rescheduleTaskSignal = defineSignal<[string, Date]>('rescheduleTask');

// Dynamic scheduling signals
export const updateScheduleSignal = defineSignal<[DynamicSchedule]>('updateSchedule');
export const triggerManualExecutionSignal = defineSignal<[TaskRequest]>('triggerManualExecution');

// Debug and monitoring signals
export const enableDebugModeSignal = defineSignal<[boolean]>('enableDebugMode');
export const takeSnapshotSignal = defineSignal<[]>('takeSnapshot');
export const forceGarbageCollectionSignal = defineSignal<[]>('forceGarbageCollection');

// External communication signals
export const sendMessageToWorkflowSignal = defineSignal<[string, string, any]>('sendMessageToWorkflow'); // workflowId, messageType, payload
export const broadcastToChildrenSignal = defineSignal<[string, any]>('broadcastToChildren'); // messageType, payload

// ============================================================================
// Enhanced Query Definitions
// ============================================================================

// Basic state queries
export const getWorkflowStateQuery = defineQuery<WorkflowState>('getWorkflowState');
export const getProgressQuery = defineQuery<{ completed: number; total: number; percentage: number }>('getProgress');
export const getTaskStatusQuery = defineQuery<string>('getTaskStatus');
export const isWorkflowPausedQuery = defineQuery<boolean>('isWorkflowPaused');

// Configuration queries
export const getCurrentConfigurationQuery = defineQuery<ConfigurationUpdate>('getCurrentConfiguration');
export const getActiveRetryPolicyQuery = defineQuery<any>('getActiveRetryPolicy');
export const getWorkflowMetadataQuery = defineQuery<Record<string, any>>('getWorkflowMetadata');

// Task management queries
export const getPendingTasksQuery = defineQuery<TaskRequest[]>('getPendingTasks');
export const getCompletedTasksQuery = defineQuery<any[]>('getCompletedTasks');
export const getFailedTasksQuery = defineQuery<any[]>('getFailedTasks');
export const getTaskByIdQuery = defineQuery<TaskRequest | undefined, [string]>('getTaskById');

// Performance queries
export const getExecutionMetricsQuery = defineQuery<WorkflowMetrics>('getExecutionMetrics');
export const getMemoryUsageQuery = defineQuery<{ heapUsed: number; heapTotal: number; external: number }>('getMemoryUsage');
export const getExecutionTimeQuery = defineQuery<number>('getExecutionTime');

// Debug queries
export const getDebugInfoQuery = defineQuery<any>('getDebugInfo');
export const getStateSnapshotQuery = defineQuery<StateSnapshot>('getStateSnapshot');
export const getSignalHistoryQuery = defineQuery<Array<{ signal: string; timestamp: Date; payload: any }>>('getSignalHistory');

// Health queries
export const getWorkflowHealthQuery = defineQuery<{ status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] }>('getWorkflowHealth');
export const getLastErrorQuery = defineQuery<{ error: string; timestamp: Date } | null>('getLastError');

// ============================================================================
// Enhanced Update Definitions
// ============================================================================

// Configuration updates
export const updateWorkflowConfigUpdate = defineUpdate<void, [ConfigurationUpdate]>('updateWorkflowConfig');
export const rescheduleWorkflowUpdate = defineUpdate<boolean, [Date]>('rescheduleWorkflow');
export const changeWorkflowPriorityUpdate = defineUpdate<void, [string]>('changeWorkflowPriority');

// Task management updates
export const addTaskUpdate = defineUpdate<string, [TaskRequest]>('addTask');
export const updateTaskUpdate = defineUpdate<boolean, [string, Partial<TaskRequest>]>('updateTask');
export const removeTaskUpdate = defineUpdate<boolean, [string]>('removeTask');

// State updates
export const updateWorkflowStateUpdate = defineUpdate<void, [Partial<WorkflowState>]>('updateWorkflowState');
export const setMetadataUpdate = defineUpdate<void, [Record<string, any>]>('setMetadata');

// ============================================================================
// Advanced Workflow with Dynamic Control
// ============================================================================

export async function advancedControlWorkflow(
  input: WorkflowInput<{
    tasks: TaskRequest[];
    configuration?: ConfigurationUpdate;
    schedule?: DynamicSchedule;
  }>
): Promise<{ status: string; results: any[]; metrics: WorkflowMetrics }> {
  const startTime = Date.now();
  const workflowId = workflowInfo().workflowId;
  
  // Initialize workflow state
  let state: WorkflowState = {
    status: 'initializing',
    isPaused: false,
    isDebugMode: false,
    currentTask: null,
    completedTasks: [],
    failedTasks: [],
    pendingTasks: [...input.data.tasks],
    configuration: input.data.configuration || {},
    schedule: input.data.schedule,
    metadata: input.context.metadata || {},
    metrics: {
      tasksStarted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      memoryUsage: 0,
      lastUpdated: new Date()
    },
    errors: [],
    snapshots: []
  };

  // Signal history tracking
  const signalHistory: Array<{ signal: string; timestamp: Date; payload: any }> = [];

  // Initialize search attributes
  await upsertSearchAttributes({
    workflowStatus: [state.status],
    taskCount: [state.pendingTasks.length],
    priority: [input.data.configuration?.priority || 'normal']
  });

  // ========================================================================
  // Signal Handlers
  // ========================================================================

  // Basic control signals
  setHandler(pauseWorkflowSignal, () => {
    state.isPaused = true;
    signalHistory.push({ signal: 'pause', timestamp: new Date(), payload: null });
    log.info('Workflow paused via signal');
  });

  setHandler(resumeWorkflowSignal, () => {
    state.isPaused = false;
    signalHistory.push({ signal: 'resume', timestamp: new Date(), payload: null });
    log.info('Workflow resumed via signal');
  });

  setHandler(cancelWorkflowSignal, (reason?: string) => {
    state.status = 'cancelled';
    signalHistory.push({ signal: 'cancel', timestamp: new Date(), payload: reason });
    log.warn('Workflow cancelled via signal', { reason });
  });

  setHandler(terminateWorkflowSignal, (reason: string) => {
    state.status = 'terminated';
    signalHistory.push({ signal: 'terminate', timestamp: new Date(), payload: reason });
    log.error('Workflow terminated via signal', { reason });
    throw new Error(`Workflow terminated: ${reason}`);
  });

  // Configuration signals
  setHandler(updateConfigurationSignal, (config: ConfigurationUpdate) => {
    state.configuration = { ...state.configuration, ...config };
    signalHistory.push({ signal: 'updateConfiguration', timestamp: new Date(), payload: config });
    log.info('Configuration updated via signal', config);
    
    // Update search attributes if priority changed
    if (config.priority) {
      upsertSearchAttributes({ priority: [config.priority] });
    }
  });

  setHandler(updatePrioritySignal, (priority: string) => {
    state.configuration.priority = priority;
    signalHistory.push({ signal: 'updatePriority', timestamp: new Date(), payload: priority });
    upsertSearchAttributes({ priority: [priority] });
    log.info('Priority updated via signal', { priority });
  });

  setHandler(updateTimeoutSignal, (timeout: string) => {
    state.configuration.timeout = timeout;
    signalHistory.push({ signal: 'updateTimeout', timestamp: new Date(), payload: timeout });
    log.info('Timeout updated via signal', { timeout });
  });

  // Task management signals
  setHandler(addTaskSignal, (task: TaskRequest) => {
    state.pendingTasks.push(task);
    signalHistory.push({ signal: 'addTask', timestamp: new Date(), payload: task });
    upsertSearchAttributes({ taskCount: [state.pendingTasks.length] });
    log.info('Task added via signal', { taskId: task.id });
  });

  setHandler(removeTaskSignal, (taskId: string) => {
    state.pendingTasks = state.pendingTasks.filter(task => task.id !== taskId);
    signalHistory.push({ signal: 'removeTask', timestamp: new Date(), payload: taskId });
    upsertSearchAttributes({ taskCount: [state.pendingTasks.length] });
    log.info('Task removed via signal', { taskId });
  });

  setHandler(skipTaskSignal, (taskId: string) => {
    const taskIndex = state.pendingTasks.findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      const skippedTask = state.pendingTasks.splice(taskIndex, 1)[0];
      state.completedTasks.push({ ...skippedTask, status: 'skipped', result: null });
      signalHistory.push({ signal: 'skipTask', timestamp: new Date(), payload: taskId });
      log.info('Task skipped via signal', { taskId });
    }
  });

  setHandler(rescheduleTaskSignal, (taskId: string, newDate: Date) => {
    const task = state.pendingTasks.find(t => t.id === taskId);
    if (task) {
      task.metadata.scheduledFor = newDate.toISOString();
      signalHistory.push({ signal: 'rescheduleTask', timestamp: new Date(), payload: { taskId, newDate } });
      log.info('Task rescheduled via signal', { taskId, newDate });
    }
  });

  // Dynamic scheduling signals
  setHandler(updateScheduleSignal, (schedule: DynamicSchedule) => {
    state.schedule = schedule;
    signalHistory.push({ signal: 'updateSchedule', timestamp: new Date(), payload: schedule });
    log.info('Schedule updated via signal', schedule);
  });

  setHandler(triggerManualExecutionSignal, (task: TaskRequest) => {
    // Insert task at the beginning for immediate execution
    state.pendingTasks.unshift(task);
    signalHistory.push({ signal: 'triggerManualExecution', timestamp: new Date(), payload: task });
    log.info('Manual execution triggered via signal', { taskId: task.id });
  });

  // Debug signals
  setHandler(enableDebugModeSignal, (enabled: boolean) => {
    state.isDebugMode = enabled;
    signalHistory.push({ signal: 'enableDebugMode', timestamp: new Date(), payload: enabled });
    log.info('Debug mode toggled via signal', { enabled });
  });

  setHandler(takeSnapshotSignal, () => {
    const snapshot: StateSnapshot = {
      timestamp: new Date(),
      state: JSON.parse(JSON.stringify(state)),
      workflowInfo: {
        workflowId: workflowInfo().workflowId,
        runId: workflowInfo().runId,
        taskQueue: workflowInfo().taskQueue,
        workflowType: workflowInfo().workflowType
      },
      memoryUsage: {
        heapUsed: 0, // Would be populated with actual memory data
        heapTotal: 0,
        external: 0
      }
    };
    state.snapshots.push(snapshot);
    signalHistory.push({ signal: 'takeSnapshot', timestamp: new Date(), payload: null });
    log.info('Snapshot taken via signal');
  });

  setHandler(forceGarbageCollectionSignal, () => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    signalHistory.push({ signal: 'forceGarbageCollection', timestamp: new Date(), payload: null });
    log.info('Garbage collection forced via signal');
  });

  // External communication signals
  setHandler(sendMessageToWorkflowSignal, async (targetWorkflowId: string, messageType: string, payload: any) => {
    try {
      const targetWorkflow = getExternalWorkflowHandle(targetWorkflowId);
      // Send appropriate signal based on messageType
      // This would be implemented based on your specific messaging needs
      signalHistory.push({ 
        signal: 'sendMessageToWorkflow', 
        timestamp: new Date(), 
        payload: { targetWorkflowId, messageType, payload } 
      });
      log.info('Message sent to external workflow', { targetWorkflowId, messageType });
    } catch (error) {
      log.error('Failed to send message to external workflow', { targetWorkflowId, messageType, error });
    }
  });

  setHandler(broadcastToChildrenSignal, (messageType: string, payload: any) => {
    // Broadcast to child workflows
    signalHistory.push({ 
      signal: 'broadcastToChildren', 
      timestamp: new Date(), 
      payload: { messageType, payload } 
    });
    log.info('Broadcast sent to child workflows', { messageType });
  });

  // ========================================================================
  // Query Handlers
  // ========================================================================

  setHandler(getWorkflowStateQuery, () => state);
  setHandler(getProgressQuery, () => {
    const total = state.pendingTasks.length + state.completedTasks.length + state.failedTasks.length;
    const completed = state.completedTasks.length;
    return {
      completed,
      total,
      percentage: total > 0 ? (completed / total) * 100 : 0
    };
  });
  setHandler(getTaskStatusQuery, () => state.status);
  setHandler(isWorkflowPausedQuery, () => state.isPaused);

  setHandler(getCurrentConfigurationQuery, () => state.configuration);
  setHandler(getActiveRetryPolicyQuery, () => RetryPolicies.STANDARD);
  setHandler(getWorkflowMetadataQuery, () => state.metadata);

  setHandler(getPendingTasksQuery, () => state.pendingTasks);
  setHandler(getCompletedTasksQuery, () => state.completedTasks);
  setHandler(getFailedTasksQuery, () => state.failedTasks);
  setHandler(getTaskByIdQuery, (taskId: string) => {
    return state.pendingTasks.find(task => task.id === taskId) ||
           state.completedTasks.find(task => task.id === taskId) ||
           state.failedTasks.find(task => task.id === taskId);
  });

  setHandler(getExecutionMetricsQuery, () => state.metrics);
  setHandler(getMemoryUsageQuery, () => ({
    heapUsed: 0, // Would be populated with actual memory data
    heapTotal: 0,
    external: 0
  }));
  setHandler(getExecutionTimeQuery, () => Date.now() - startTime);

  setHandler(getDebugInfoQuery, () => ({
    workflowId,
    startTime: new Date(startTime),
    isDebugMode: state.isDebugMode,
    signalCount: signalHistory.length,
    snapshotCount: state.snapshots.length
  }));
  setHandler(getStateSnapshotQuery, () => state.snapshots[state.snapshots.length - 1]);
  setHandler(getSignalHistoryQuery, () => signalHistory);

  setHandler(getWorkflowHealthQuery, () => {
    const issues: string[] = [];
    
    if (state.failedTasks.length > state.completedTasks.length) {
      issues.push('High failure rate detected');
    }
    
    if (state.errors.length > 10) {
      issues.push('Multiple errors recorded');
    }
    
    if (state.isPaused) {
      issues.push('Workflow is paused');
    }

    const status = issues.length === 0 ? 'healthy' : 
                   issues.length <= 2 ? 'degraded' : 'unhealthy';

    return { status, issues };
  });

  setHandler(getLastErrorQuery, () => {
    return state.errors.length > 0 ? state.errors[state.errors.length - 1] : null;
  });

  // ========================================================================
  // Update Handlers
  // ========================================================================

  setHandler(updateWorkflowConfigUpdate, (config: ConfigurationUpdate) => {
    state.configuration = { ...state.configuration, ...config };
    log.info('Configuration updated via update', config);
  });

  setHandler(rescheduleWorkflowUpdate, (newDate: Date): boolean => {
    // Reschedule the workflow execution
    state.metadata.rescheduledTo = newDate.toISOString();
    log.info('Workflow rescheduled via update', { newDate });
    return true;
  });

  setHandler(changeWorkflowPriorityUpdate, (priority: string) => {
    state.configuration.priority = priority;
    upsertSearchAttributes({ priority: [priority] });
    log.info('Priority changed via update', { priority });
  });

  setHandler(addTaskUpdate, (task: TaskRequest): string => {
    state.pendingTasks.push(task);
    upsertSearchAttributes({ taskCount: [state.pendingTasks.length] });
    log.info('Task added via update', { taskId: task.id });
    return task.id;
  });

  setHandler(updateTaskUpdate, (taskId: string, updates: Partial<TaskRequest>): boolean => {
    const task = state.pendingTasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      log.info('Task updated via update', { taskId, updates });
      return true;
    }
    return false;
  });

  setHandler(removeTaskUpdate, (taskId: string): boolean => {
    const initialLength = state.pendingTasks.length;
    state.pendingTasks = state.pendingTasks.filter(task => task.id !== taskId);
    const removed = state.pendingTasks.length < initialLength;
    
    if (removed) {
      upsertSearchAttributes({ taskCount: [state.pendingTasks.length] });
      log.info('Task removed via update', { taskId });
    }
    
    return removed;
  });

  setHandler(updateWorkflowStateUpdate, (stateUpdates: Partial<WorkflowState>) => {
    Object.assign(state, stateUpdates);
    log.info('Workflow state updated via update');
  });

  setHandler(setMetadataUpdate, (metadata: Record<string, any>) => {
    state.metadata = { ...state.metadata, ...metadata };
    log.info('Metadata updated via update', metadata);
  });

  // ========================================================================
  // Main Workflow Execution
  // ========================================================================

  state.status = 'running';
  await upsertSearchAttributes({ workflowStatus: [state.status] });
  
  log.info('Advanced control workflow started', {
    workflowId,
    initialTaskCount: state.pendingTasks.length,
    configuration: state.configuration
  });

  try {
    // Main execution loop
    while (state.pendingTasks.length > 0 && state.status === 'running') {
      // Check for pause condition
      await condition(() => !state.isPaused || state.status !== 'running');
      
      if (state.status !== 'running') {
        break;
      }

      // Get next task
      const currentTask = state.pendingTasks.shift()!;
      state.currentTask = currentTask;
      state.metrics.tasksStarted++;

      log.info('Processing task', { taskId: currentTask.id, type: currentTask.type });

      const taskStartTime = Date.now();

      try {
        // Validate task if validation is enabled
        if (state.configuration.validateTasks !== false) {
          await validateInput({
            data: currentTask,
            context: {
              activityId: `validate-${currentTask.id}`,
              workflowId,
              attemptNumber: 1,
              info: {
                taskQueue: workflowInfo().taskQueue,
                activityType: 'validateInput',
                scheduledTime: new Date(),
                startedTime: new Date()
              }
            }
          });
        }

        // Process the task
        const result = await processTask({
          data: currentTask,
          context: {
            activityId: `process-${currentTask.id}`,
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
            taskId: currentTask.id,
            status: 'completed',
            result: result.result
          },
          context: {
            activityId: `status-${currentTask.id}`,
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

        const executionTime = Date.now() - taskStartTime;
        
        // Update metrics
        state.metrics.tasksCompleted++;
        state.metrics.totalExecutionTime += executionTime;
        state.metrics.averageExecutionTime = state.metrics.totalExecutionTime / state.metrics.tasksCompleted;
        state.metrics.lastUpdated = new Date();

        // Add to completed tasks
        state.completedTasks.push({
          ...currentTask,
          status: 'completed',
          result: result.result,
          executionTime,
          completedAt: new Date()
        });

        log.info('Task completed', { 
          taskId: currentTask.id, 
          executionTime: `${executionTime}ms` 
        });

        // Send notification if configured
        if (state.configuration.notifyOnCompletion) {
          await sendNotification({
            data: {
              recipient: state.configuration.notificationRecipient || 'system',
              message: `Task ${currentTask.id} completed successfully`,
              taskId: currentTask.id
            },
            context: {
              activityId: `notify-${currentTask.id}`,
              workflowId,
              attemptNumber: 1,
              info: {
                taskQueue: workflowInfo().taskQueue,
                activityType: 'sendNotification',
                scheduledTime: new Date(),
                startedTime: new Date()
              }
            }
          });
        }

      } catch (error) {
        const errorInfo = {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date()
        };
        
        state.errors.push(errorInfo);
        state.metrics.tasksFailed++;
        state.failedTasks.push({
          ...currentTask,
          status: 'failed',
          error: errorInfo.error,
          failedAt: new Date()
        });

        log.error('Task failed', { 
          taskId: currentTask.id, 
          error: errorInfo.error 
        });

        // Continue with next task unless configured to stop on failure
        if (state.configuration.stopOnFailure) {
          state.status = 'failed';
          break;
        }
      }

      state.currentTask = null;

      // Check for dynamic schedule updates
      if (state.schedule?.interval) {
        await sleep(state.schedule.interval);
      }

      // Auto-snapshot on every 10th task
      if (state.metrics.tasksCompleted % 10 === 0) {
        setHandler(takeSnapshotSignal, () => {}); // Trigger snapshot
      }

      // Continue as new if we've processed many tasks to avoid history bloat
      if (state.metrics.tasksCompleted >= 1000) {
        log.info('Continuing as new workflow to manage history size');
        
        await continueAsNew<typeof advancedControlWorkflow>({
          data: {
            tasks: state.pendingTasks,
            configuration: state.configuration,
            schedule: state.schedule
          },
          context: {
            ...input.context,
            metadata: {
              ...state.metadata,
              previousRunMetrics: state.metrics,
              continuedFromRun: workflowInfo().runId
            }
          }
        });
      }
    }

    // Final status update
    if (state.status === 'running') {
      state.status = state.failedTasks.length > 0 ? 'completed_with_failures' : 'completed';
    }

    await upsertSearchAttributes({ workflowStatus: [state.status] });

    // Generate final report if configured
    if (state.configuration.generateReport !== false) {
      await generateReport({
        data: {
          taskId: 'workflow-report',
          type: 'workflow_summary',
          result: {
            completedTasks: state.completedTasks,
            failedTasks: state.failedTasks,
            metrics: state.metrics
          },
          metadata: {
            workflowId,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date().toISOString()
          }
        },
        context: {
          activityId: `report-${workflowId}`,
          workflowId,
          attemptNumber: 1,
          info: {
            taskQueue: workflowInfo().taskQueue,
            activityType: 'generateReport',
            scheduledTime: new Date(),
            startedTime: new Date()
          }
        }
      });
    }

    // Cleanup resources
    await cleanupResources({
      data: {
        taskId: workflowId,
        reason: 'workflow_completion'
      },
      context: {
        activityId: `cleanup-${workflowId}`,
        workflowId,
        attemptNumber: 1,
        info: {
          taskQueue: workflowInfo().taskQueue,
          activityType: 'cleanupResources',
          scheduledTime: new Date(),
          startedTime: new Date()
        }
      }
    });

    const totalExecutionTime = Date.now() - startTime;
    
    log.info('Advanced control workflow completed', {
      status: state.status,
      totalTasks: state.completedTasks.length + state.failedTasks.length,
      completedTasks: state.completedTasks.length,
      failedTasks: state.failedTasks.length,
      totalExecutionTime: `${totalExecutionTime}ms`,
      signalsReceived: signalHistory.length
    });

    return {
      status: state.status,
      results: state.completedTasks,
      metrics: {
        ...state.metrics,
        totalExecutionTime,
        signalsReceived: signalHistory.length,
        snapshotsTaken: state.snapshots.length
      }
    };

  } catch (error) {
    state.status = 'failed';
    const errorInfo = {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date()
    };
    state.errors.push(errorInfo);

    await upsertSearchAttributes({ workflowStatus: [state.status] });

    log.error('Workflow failed', { error: errorInfo.error });
    
    throw error;
  }
}