/**
 * Advanced Workflow Controller for Signals, Queries, and Updates
 * Provides high-level interface for dynamic workflow management
 */

import { Client, WorkflowHandle } from '@temporalio/client';
import { 
  TaskRequest,
  WorkflowState,
  ConfigurationUpdate,
  DynamicSchedule,
  WorkflowMetrics,
  StateSnapshot,
  ControlAction
} from '../types';

// Import signal, query, and update definitions
import {
  // Control signals
  pauseWorkflowSignal,
  resumeWorkflowSignal,
  cancelWorkflowSignal,
  terminateWorkflowSignal,
  
  // Configuration signals
  updateConfigurationSignal,
  updatePrioritySignal,
  updateTimeoutSignal,
  updateRetryPolicySignal,
  
  // Task management signals
  addTaskSignal,
  removeTaskSignal,
  skipTaskSignal,
  rescheduleTaskSignal,
  
  // Dynamic scheduling signals
  updateScheduleSignal,
  triggerManualExecutionSignal,
  
  // Debug signals
  enableDebugModeSignal,
  takeSnapshotSignal,
  forceGarbageCollectionSignal,
  
  // External communication signals
  sendMessageToWorkflowSignal,
  broadcastToChildrenSignal,
  
  // Queries
  getWorkflowStateQuery,
  getProgressQuery,
  getTaskStatusQuery,
  isWorkflowPausedQuery,
  getCurrentConfigurationQuery,
  getActiveRetryPolicyQuery,
  getWorkflowMetadataQuery,
  getPendingTasksQuery,
  getCompletedTasksQuery,
  getFailedTasksQuery,
  getTaskByIdQuery,
  getExecutionMetricsQuery,
  getMemoryUsageQuery,
  getExecutionTimeQuery,
  getDebugInfoQuery,
  getStateSnapshotQuery,
  getSignalHistoryQuery,
  getWorkflowHealthQuery,
  getLastErrorQuery,
  
  // Updates
  updateWorkflowConfigUpdate,
  rescheduleWorkflowUpdate,
  changeWorkflowPriorityUpdate,
  addTaskUpdate,
  updateTaskUpdate,
  removeTaskUpdate,
  updateWorkflowStateUpdate,
  setMetadataUpdate
} from '../workflows/advanced-control.workflow';

// ============================================================================
// Workflow Controller Interface
// ============================================================================

export interface WorkflowControllerConfig {
  client: Client;
  namespace?: string;
  defaultTimeout?: string;
  retryAttempts?: number;
}

export interface WorkflowControlOptions {
  timeout?: string;
  waitForResult?: boolean;
  signal?: AbortSignal;
}

// ============================================================================
// Advanced Workflow Controller
// ============================================================================

export class AdvancedWorkflowController {
  private client: Client;
  private namespace: string;
  private defaultTimeout: string;
  private retryAttempts: number;
  private activeHandles = new Map<string, WorkflowHandle>();

  constructor(config: WorkflowControllerConfig) {
    this.client = config.client;
    this.namespace = config.namespace || 'default';
    this.defaultTimeout = config.defaultTimeout || '30s';
    this.retryAttempts = config.retryAttempts || 3;
  }

  // ========================================================================
  // Workflow Handle Management
  // ========================================================================

  async getWorkflowHandle(workflowId: string): Promise<WorkflowHandle> {
    let handle = this.activeHandles.get(workflowId);
    
    if (!handle) {
      handle = this.client.workflow.getHandle(workflowId);
      this.activeHandles.set(workflowId, handle);
    }
    
    return handle;
  }

  async removeWorkflowHandle(workflowId: string): Promise<void> {
    this.activeHandles.delete(workflowId);
  }

  // ========================================================================
  // Basic Workflow Control
  // ========================================================================

  async pauseWorkflow(
    workflowId: string, 
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(pauseWorkflowSignal),
      'pauseWorkflow',
      workflowId
    );
  }

  async resumeWorkflow(
    workflowId: string, 
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(resumeWorkflowSignal),
      'resumeWorkflow',
      workflowId
    );
  }

  async cancelWorkflow(
    workflowId: string, 
    reason?: string, 
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(cancelWorkflowSignal, reason),
      'cancelWorkflow',
      workflowId
    );
  }

  async terminateWorkflow(
    workflowId: string, 
    reason: string, 
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(terminateWorkflowSignal, reason),
      'terminateWorkflow',
      workflowId
    );
  }

  // ========================================================================
  // Configuration Management
  // ========================================================================

  async updateConfiguration(
    workflowId: string,
    config: ConfigurationUpdate,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    
    if (options?.waitForResult) {
      await this.executeWithRetry(
        () => handle.executeUpdate(updateWorkflowConfigUpdate, config),
        'updateConfiguration',
        workflowId
      );
    } else {
      await this.executeWithRetry(
        () => handle.signal(updateConfigurationSignal, config),
        'updateConfiguration',
        workflowId
      );
    }
  }

  async updatePriority(
    workflowId: string,
    priority: string,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    
    if (options?.waitForResult) {
      await this.executeWithRetry(
        () => handle.executeUpdate(changeWorkflowPriorityUpdate, priority),
        'updatePriority',
        workflowId
      );
    } else {
      await this.executeWithRetry(
        () => handle.signal(updatePrioritySignal, priority),
        'updatePriority',
        workflowId
      );
    }
  }

  async updateTimeout(
    workflowId: string,
    timeout: string,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(updateTimeoutSignal, timeout),
      'updateTimeout',
      workflowId
    );
  }

  // ========================================================================
  // Task Management
  // ========================================================================

  async addTask(
    workflowId: string,
    task: TaskRequest,
    options?: WorkflowControlOptions
  ): Promise<string | void> {
    const handle = await this.getWorkflowHandle(workflowId);
    
    if (options?.waitForResult) {
      return await this.executeWithRetry(
        () => handle.executeUpdate(addTaskUpdate, task),
        'addTask',
        workflowId
      );
    } else {
      await this.executeWithRetry(
        () => handle.signal(addTaskSignal, task),
        'addTask',
        workflowId
      );
    }
  }

  async removeTask(
    workflowId: string,
    taskId: string,
    options?: WorkflowControlOptions
  ): Promise<boolean | void> {
    const handle = await this.getWorkflowHandle(workflowId);
    
    if (options?.waitForResult) {
      return await this.executeWithRetry(
        () => handle.executeUpdate(removeTaskUpdate, taskId),
        'removeTask',
        workflowId
      );
    } else {
      await this.executeWithRetry(
        () => handle.signal(removeTaskSignal, taskId),
        'removeTask',
        workflowId
      );
    }
  }

  async updateTask(
    workflowId: string,
    taskId: string,
    updates: Partial<TaskRequest>,
    options?: WorkflowControlOptions
  ): Promise<boolean> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.executeUpdate(updateTaskUpdate, taskId, updates),
      'updateTask',
      workflowId
    );
  }

  async skipTask(
    workflowId: string,
    taskId: string,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(skipTaskSignal, taskId),
      'skipTask',
      workflowId
    );
  }

  async rescheduleTask(
    workflowId: string,
    taskId: string,
    newDate: Date,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(rescheduleTaskSignal, taskId, newDate),
      'rescheduleTask',
      workflowId
    );
  }

  async triggerManualExecution(
    workflowId: string,
    task: TaskRequest,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(triggerManualExecutionSignal, task),
      'triggerManualExecution',
      workflowId
    );
  }

  // ========================================================================
  // Schedule Management
  // ========================================================================

  async updateSchedule(
    workflowId: string,
    schedule: DynamicSchedule,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(updateScheduleSignal, schedule),
      'updateSchedule',
      workflowId
    );
  }

  async rescheduleWorkflow(
    workflowId: string,
    newDate: Date,
    options?: WorkflowControlOptions
  ): Promise<boolean> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.executeUpdate(rescheduleWorkflowUpdate, newDate),
      'rescheduleWorkflow',
      workflowId
    );
  }

  // ========================================================================
  // Debug and Monitoring
  // ========================================================================

  async enableDebugMode(
    workflowId: string,
    enabled: boolean,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(enableDebugModeSignal, enabled),
      'enableDebugMode',
      workflowId
    );
  }

  async takeSnapshot(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(takeSnapshotSignal),
      'takeSnapshot',
      workflowId
    );
  }

  async forceGarbageCollection(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(forceGarbageCollectionSignal),
      'forceGarbageCollection',
      workflowId
    );
  }

  // ========================================================================
  // External Communication
  // ========================================================================

  async sendMessageToWorkflow(
    workflowId: string,
    targetWorkflowId: string,
    messageType: string,
    payload: any,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(sendMessageToWorkflowSignal, targetWorkflowId, messageType, payload),
      'sendMessageToWorkflow',
      workflowId
    );
  }

  async broadcastToChildren(
    workflowId: string,
    messageType: string,
    payload: any,
    options?: WorkflowControlOptions
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await this.executeWithRetry(
      () => handle.signal(broadcastToChildrenSignal, messageType, payload),
      'broadcastToChildren',
      workflowId
    );
  }

  // ========================================================================
  // Query Operations
  // ========================================================================

  async getWorkflowState(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<WorkflowState> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getWorkflowStateQuery),
      'getWorkflowState',
      workflowId
    );
  }

  async getProgress(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<{ completed: number; total: number; percentage: number }> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getProgressQuery),
      'getProgress',
      workflowId
    );
  }

  async getTaskStatus(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<string> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getTaskStatusQuery),
      'getTaskStatus',
      workflowId
    );
  }

  async isWorkflowPaused(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<boolean> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(isWorkflowPausedQuery),
      'isWorkflowPaused',
      workflowId
    );
  }

  async getCurrentConfiguration(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<ConfigurationUpdate> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getCurrentConfigurationQuery),
      'getCurrentConfiguration',
      workflowId
    );
  }

  async getPendingTasks(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<TaskRequest[]> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getPendingTasksQuery),
      'getPendingTasks',
      workflowId
    );
  }

  async getCompletedTasks(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<any[]> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getCompletedTasksQuery),
      'getCompletedTasks',
      workflowId
    );
  }

  async getFailedTasks(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<any[]> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getFailedTasksQuery),
      'getFailedTasks',
      workflowId
    );
  }

  async getTaskById(
    workflowId: string,
    taskId: string,
    options?: WorkflowControlOptions
  ): Promise<TaskRequest | undefined> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getTaskByIdQuery, taskId),
      'getTaskById',
      workflowId
    );
  }

  async getExecutionMetrics(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<WorkflowMetrics> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getExecutionMetricsQuery),
      'getExecutionMetrics',
      workflowId
    );
  }

  async getMemoryUsage(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<{ heapUsed: number; heapTotal: number; external: number }> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getMemoryUsageQuery),
      'getMemoryUsage',
      workflowId
    );
  }

  async getExecutionTime(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<number> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getExecutionTimeQuery),
      'getExecutionTime',
      workflowId
    );
  }

  async getDebugInfo(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<any> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getDebugInfoQuery),
      'getDebugInfo',
      workflowId
    );
  }

  async getStateSnapshot(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<StateSnapshot> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getStateSnapshotQuery),
      'getStateSnapshot',
      workflowId
    );
  }

  async getSignalHistory(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<Array<{ signal: string; timestamp: Date; payload: any }>> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getSignalHistoryQuery),
      'getSignalHistory',
      workflowId
    );
  }

  async getWorkflowHealth(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; issues: string[] }> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getWorkflowHealthQuery),
      'getWorkflowHealth',
      workflowId
    );
  }

  async getLastError(
    workflowId: string,
    options?: WorkflowControlOptions
  ): Promise<{ error: string; timestamp: Date } | null> {
    const handle = await this.getWorkflowHandle(workflowId);
    return await this.executeWithRetry(
      () => handle.query(getLastErrorQuery),
      'getLastError',
      workflowId
    );
  }

  // ========================================================================
  // Batch Operations
  // ========================================================================

  async batchExecute(
    operations: Array<{
      workflowId: string;
      operation: keyof this;
      args: any[];
    }>
  ): Promise<Array<{ success: boolean; result?: any; error?: string }>> {
    const results = await Promise.allSettled(
      operations.map(async (op) => {
        const method = this[op.operation] as Function;
        if (typeof method !== 'function') {
          throw new Error(`Invalid operation: ${String(op.operation)}`);
        }
        return await method.apply(this, [op.workflowId, ...op.args]);
      })
    );

    return results.map((result) => {
      if (result.status === 'fulfilled') {
        return { success: true, result: result.value };
      } else {
        return { 
          success: false, 
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        };
      }
    });
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    workflowId: string
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.retryAttempts) {
          console.error(
            `Operation ${operationName} failed for workflow ${workflowId} after ${attempt} attempts:`,
            lastError.message
          );
          break;
        }
        
        console.warn(
          `Operation ${operationName} failed for workflow ${workflowId} (attempt ${attempt}/${this.retryAttempts}):`,
          lastError.message
        );
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
    
    throw lastError;
  }

  async getMultipleWorkflowStates(
    workflowIds: string[]
  ): Promise<Record<string, WorkflowState | null>> {
    const results = await Promise.allSettled(
      workflowIds.map(async (id) => {
        try {
          const state = await this.getWorkflowState(id);
          return { id, state };
        } catch (error) {
          return { id, state: null };
        }
      })
    );

    const stateMap: Record<string, WorkflowState | null> = {};
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        stateMap[result.value.id] = result.value.state;
      }
    });

    return stateMap;
  }

  async waitForCondition(
    workflowId: string,
    condition: (state: WorkflowState) => boolean,
    options: {
      timeout?: number;
      pollInterval?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<WorkflowState> {
    const timeout = options.timeout || 30000; // 30 seconds default
    const pollInterval = options.pollInterval || 1000; // 1 second default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (options.signal?.aborted) {
        throw new Error('Operation was aborted');
      }

      try {
        const state = await this.getWorkflowState(workflowId);
        if (condition(state)) {
          return state;
        }
      } catch (error) {
        console.warn(`Failed to query workflow state: ${error}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Condition not met within timeout of ${timeout}ms`);
  }

  async getControllerStats(): Promise<{
    activeHandles: number;
    namespace: string;
    defaultTimeout: string;
    retryAttempts: number;
  }> {
    return {
      activeHandles: this.activeHandles.size,
      namespace: this.namespace,
      defaultTimeout: this.defaultTimeout,
      retryAttempts: this.retryAttempts
    };
  }

  async cleanup(): Promise<void> {
    this.activeHandles.clear();
    console.log('Workflow controller cleanup completed');
  }
}

// ============================================================================
// Export
// ============================================================================

export default AdvancedWorkflowController;