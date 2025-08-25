/**
 * Performance Interceptors for Temporal.io Integration
 * Implements comprehensive performance tracking and optimization at the interceptor level
 */

import {
  ActivityInput,
  ActivityOutput,
  WorkflowInboundCallsInterceptor,
  WorkflowOutboundCallsInterceptor,
  ActivityInboundCallsInterceptor,
  ActivityOutboundCallsInterceptor,
  Next,
  Headers
} from '@temporalio/workflow';

import {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor as ActivityServerInterceptor,
  ActivityOutboundCallsInterceptor as ActivityClientInterceptor
} from '@temporalio/worker';

import { 
  MetricsCollector, 
  PerformanceCacheManager, 
  AdaptivePerformanceOptimizer 
} from '../monitoring';
import { PerformanceMetrics } from '../types';

// ============================================================================
// Workflow Performance Interceptor
// ============================================================================

export class WorkflowPerformanceInterceptor implements 
  WorkflowInboundCallsInterceptor, 
  WorkflowOutboundCallsInterceptor {
  
  private metricsCollector = MetricsCollector.getInstance();
  private cacheManager = PerformanceCacheManager.getInstance();
  private activeOperations = new Map<string, number>();
  
  // ========================================================================
  // Inbound Calls (Workflow Execution)
  // ========================================================================

  async execute(
    input: any,
    next: Next<any>
  ): Promise<any> {
    const workflowType = input.info?.workflowType || 'unknown';
    const workflowId = input.info?.workflowId || 'unknown';
    const operationId = `workflow-${workflowType}-${workflowId}-${Date.now()}`;
    
    this.activeOperations.set(operationId, Date.now());
    this.metricsCollector.recordWorkflowStart();
    
    console.debug(`Workflow execution started: ${workflowType}`, {
      workflowId,
      operationId
    });

    try {
      // Check cache for cached workflow results (if caching is enabled)
      const cacheKey = this.generateWorkflowCacheKey(input);
      const cachedResult = this.cacheManager.get('workflow-results', cacheKey);
      
      if (cachedResult && this.shouldUseCachedResult(input)) {
        console.debug(`Using cached workflow result: ${workflowType}`, { cacheKey });
        return cachedResult;
      }

      // Execute workflow
      const result = await next(input);
      
      // Calculate execution time
      const startTime = this.activeOperations.get(operationId)!;
      const executionTime = Date.now() - startTime;
      
      // Update metrics
      this.metricsCollector.recordWorkflowCompletion(executionTime);
      
      // Cache result if appropriate
      if (this.shouldCacheResult(input, result)) {
        this.cacheManager.set('workflow-results', cacheKey, result);
      }

      console.debug(`Workflow execution completed: ${workflowType}`, {
        workflowId,
        executionTime: `${executionTime}ms`,
        cached: this.shouldCacheResult(input, result)
      });

      return result;

    } catch (error) {
      this.metricsCollector.recordWorkflowFailure();
      
      console.error(`Workflow execution failed: ${workflowType}`, {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  // ========================================================================
  // Outbound Calls (Activity Invocation)
  // ========================================================================

  async scheduleActivity(
    input: any,
    next: Next<any>
  ): Promise<any> {
    const activityType = input.activityType;
    const operationId = `activity-schedule-${activityType}-${Date.now()}`;
    
    this.activeOperations.set(operationId, Date.now());
    
    console.debug(`Activity scheduling: ${activityType}`, {
      operationId,
      args: input.args?.length || 0
    });

    try {
      // Check for cached activity results
      const cacheKey = this.generateActivityCacheKey(input);
      const cachedResult = this.cacheManager.get('activity-results', cacheKey);
      
      if (cachedResult && this.shouldUseCachedActivityResult(input)) {
        console.debug(`Using cached activity result: ${activityType}`, { cacheKey });
        return cachedResult;
      }

      // Apply activity-specific optimizations
      const optimizedInput = this.optimizeActivityInput(input);
      
      const result = await next(optimizedInput);
      
      // Cache activity result if appropriate
      if (this.shouldCacheActivityResult(input, result)) {
        this.cacheManager.set('activity-results', cacheKey, result);
      }

      const executionTime = Date.now() - this.activeOperations.get(operationId)!;
      console.debug(`Activity scheduled: ${activityType}`, {
        executionTime: `${executionTime}ms`,
        cached: this.shouldCacheActivityResult(input, result)
      });

      return result;

    } catch (error) {
      console.error(`Activity scheduling failed: ${activityType}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  async scheduleLocalActivity(
    input: any,
    next: Next<any>
  ): Promise<any> {
    // Similar implementation to scheduleActivity but optimized for local activities
    const activityType = input.activityType;
    const startTime = Date.now();
    
    try {
      // Local activities are typically faster, so use shorter cache TTL
      const cacheKey = this.generateActivityCacheKey(input);
      const cachedResult = this.cacheManager.get('activity-results', cacheKey);
      
      if (cachedResult) {
        console.debug(`Using cached local activity result: ${activityType}`);
        return cachedResult;
      }

      const result = await next(input);
      
      // Cache with shorter TTL for local activities
      if (this.shouldCacheActivityResult(input, result)) {
        this.cacheManager.set('activity-results', cacheKey, result);
      }

      const executionTime = Date.now() - startTime;
      console.debug(`Local activity completed: ${activityType}`, {
        executionTime: `${executionTime}ms`
      });

      return result;
    } catch (error) {
      console.error(`Local activity failed: ${activityType}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // ========================================================================
  // Signal and Query Optimization
  // ========================================================================

  async signalWorkflow(
    input: any,
    next: Next<any>
  ): Promise<any> {
    const signalName = input.signalName;
    const startTime = Date.now();
    
    console.debug(`Signal processing: ${signalName}`);

    try {
      const result = await next(input);
      
      const executionTime = Date.now() - startTime;
      console.debug(`Signal processed: ${signalName}`, {
        executionTime: `${executionTime}ms`
      });

      return result;
    } catch (error) {
      console.error(`Signal processing failed: ${signalName}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async queryWorkflow(
    input: any,
    next: Next<any>
  ): Promise<any> {
    const queryType = input.queryType;
    const startTime = Date.now();
    
    // Queries are read-only, so aggressive caching is beneficial
    const cacheKey = `query-${queryType}-${JSON.stringify(input.args)}`;
    const cachedResult = this.cacheManager.get('query-results', cacheKey);
    
    if (cachedResult) {
      console.debug(`Using cached query result: ${queryType}`);
      return cachedResult;
    }

    console.debug(`Query processing: ${queryType}`);

    try {
      const result = await next(input);
      
      // Cache query results aggressively (short TTL)
      this.cacheManager.set('query-results', cacheKey, result);
      
      const executionTime = Date.now() - startTime;
      console.debug(`Query processed: ${queryType}`, {
        executionTime: `${executionTime}ms`,
        cached: true
      });

      return result;
    } catch (error) {
      console.error(`Query processing failed: ${queryType}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private generateWorkflowCacheKey(input: any): string {
    const workflowType = input.info?.workflowType || 'unknown';
    const argsHash = this.hashArguments(input.args || []);
    return `${workflowType}-${argsHash}`;
  }

  private generateActivityCacheKey(input: any): string {
    const activityType = input.activityType;
    const argsHash = this.hashArguments(input.args || []);
    return `${activityType}-${argsHash}`;
  }

  private hashArguments(args: any[]): string {
    // Simple hash function for arguments
    const str = JSON.stringify(args);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private shouldUseCachedResult(input: any): boolean {
    // Implement logic to determine if cached result should be used
    // For example, skip cache for time-sensitive operations
    const headers = input.headers as Headers || {};
    return !headers['no-cache'] && !headers['real-time'];
  }

  private shouldCacheResult(input: any, result: any): boolean {
    // Implement logic to determine if result should be cached
    // Avoid caching large results or time-sensitive data
    const resultSize = JSON.stringify(result).length;
    const headers = input.headers as Headers || {};
    
    return (
      resultSize < 100000 && // Don't cache results larger than 100KB
      !headers['no-cache'] &&
      !headers['sensitive'] &&
      result !== null &&
      result !== undefined
    );
  }

  private shouldUseCachedActivityResult(input: any): boolean {
    // Activity-specific caching logic
    const headers = input.headers as Headers || {};
    return !headers['no-cache'] && !headers['force-execute'];
  }

  private shouldCacheActivityResult(input: any, result: any): boolean {
    // Activity-specific result caching logic
    const resultSize = JSON.stringify(result).length;
    const headers = input.headers as Headers || {};
    
    return (
      resultSize < 50000 && // Smaller limit for activities
      !headers['no-cache'] &&
      !headers['volatile'] &&
      result !== null &&
      result !== undefined
    );
  }

  private optimizeActivityInput(input: any): any {
    // Apply input optimizations
    const optimized = { ...input };
    
    // Add performance hints to headers
    optimized.headers = {
      ...optimized.headers,
      'performance-optimized': 'true',
      'optimization-timestamp': Date.now().toString()
    };

    return optimized;
  }
}

// ============================================================================
// Activity Performance Interceptor
// ============================================================================

export class ActivityPerformanceInterceptor implements 
  ActivityInboundCallsInterceptor, 
  ActivityOutboundCallsInterceptor {
  
  private metricsCollector = MetricsCollector.getInstance();
  private activeActivities = new Map<string, number>();

  // ========================================================================
  // Inbound Calls (Activity Execution)
  // ========================================================================

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityExecuteInput, any>
  ): Promise<any> {
    const activityInfo = input.info;
    const activityType = activityInfo.activityType;
    const activityId = activityInfo.activityId;
    const operationId = `${activityType}-${activityId}`;
    
    this.activeActivities.set(operationId, Date.now());
    this.metricsCollector.recordActivityStart();
    
    console.debug(`Activity execution started: ${activityType}`, {
      activityId,
      attemptNumber: activityInfo.attempt
    });

    try {
      const result = await next(input);
      
      const startTime = this.activeActivities.get(operationId)!;
      const executionTime = Date.now() - startTime;
      
      this.metricsCollector.recordActivityCompletion(executionTime);
      
      console.debug(`Activity execution completed: ${activityType}`, {
        activityId,
        executionTime: `${executionTime}ms`,
        attempt: activityInfo.attempt
      });

      return result;

    } catch (error) {
      this.metricsCollector.recordActivityFailure();
      
      // Check if this is a retry
      if (activityInfo.attempt > 1) {
        this.metricsCollector.recordActivityRetry();
        console.warn(`Activity retry: ${activityType}`, {
          activityId,
          attempt: activityInfo.attempt,
          error: error instanceof Error ? error.message : String(error)
        });
      } else {
        console.error(`Activity execution failed: ${activityType}`, {
          activityId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      throw error;
    } finally {
      this.activeActivities.delete(operationId);
    }
  }

  // ========================================================================
  // Outbound Calls (Activity to External Systems)
  // ========================================================================

  async heartbeat(
    input: any,
    next: Next<any>
  ): Promise<any> {
    // Optimize heartbeat frequency based on current load
    const currentTime = Date.now();
    const performanceMetrics = this.metricsCollector.getPerformanceMetrics();
    
    // Skip heartbeat if system is under heavy load and last heartbeat was recent
    if (performanceMetrics.systemLoad > 90) {
      const lastHeartbeat = (input as any).lastHeartbeatTime || 0;
      if (currentTime - lastHeartbeat < 5000) { // Skip if less than 5 seconds
        console.debug('Skipping heartbeat due to high system load');
        return;
      }
    }

    try {
      const result = await next(input);
      (input as any).lastHeartbeatTime = currentTime;
      return result;
    } catch (error) {
      console.warn('Heartbeat failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// ============================================================================
// Worker Performance Interceptor
// ============================================================================

export class WorkerPerformanceInterceptor implements ActivityServerInterceptor {
  private metricsCollector = MetricsCollector.getInstance();
  private performanceOptimizer = AdaptivePerformanceOptimizer.getInstance();
  private cacheManager = PerformanceCacheManager.getInstance();

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityExecuteInput, any>
  ): Promise<any> {
    const activityType = input.info.activityType;
    const workflowId = input.info.workflowId;
    const startTime = Date.now();

    // Performance tracking
    console.debug(`Worker executing activity: ${activityType}`, {
      workflowId,
      workerInfo: {
        taskQueue: input.info.taskQueue,
        workflowType: input.info.workflowType
      }
    });

    try {
      // Apply worker-level optimizations
      const optimizedInput = await this.applyWorkerOptimizations(input);
      
      const result = await next(optimizedInput);
      
      const executionTime = Date.now() - startTime;
      
      // Update worker metrics
      this.metricsCollector.updateWorkerMetrics({
        taskThroughput: this.calculateThroughput(),
        errorRate: this.calculateErrorRate()
      });

      console.debug(`Worker completed activity: ${activityType}`, {
        workflowId,
        executionTime: `${executionTime}ms`
      });

      return result;

    } catch (error) {
      console.error(`Worker activity failed: ${activityType}`, {
        workflowId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Update error metrics
      this.metricsCollector.updateWorkerMetrics({
        errorRate: this.calculateErrorRate() + 1
      });
      
      throw error;
    }
  }

  private async applyWorkerOptimizations(input: ActivityExecuteInput): Promise<ActivityExecuteInput> {
    // Worker-level optimizations
    const optimized = { ...input };
    
    // Add worker performance context
    optimized.headers = {
      ...optimized.headers,
      'worker-optimization': 'enabled',
      'worker-timestamp': Date.now().toString()
    };

    return optimized;
  }

  private calculateThroughput(): number {
    // Calculate current throughput
    // This is a simplified implementation
    const metrics = this.metricsCollector.getMetrics();
    const totalTasks = metrics.activities.completed + metrics.activities.failed;
    const timeWindow = 60000; // 1 minute window
    
    return totalTasks > 0 ? (totalTasks / timeWindow) * 1000 : 0;
  }

  private calculateErrorRate(): number {
    // Calculate current error rate
    const metrics = this.metricsCollector.getMetrics();
    const totalTasks = metrics.activities.completed + metrics.activities.failed;
    
    return totalTasks > 0 ? (metrics.activities.failed / totalTasks) * 100 : 0;
  }
}

// ============================================================================
// Performance Interceptor Factory
// ============================================================================

export class PerformanceInterceptorFactory {
  static createWorkflowInterceptor(): WorkflowPerformanceInterceptor {
    return new WorkflowPerformanceInterceptor();
  }

  static createActivityInterceptor(): ActivityPerformanceInterceptor {
    return new ActivityPerformanceInterceptor();
  }

  static createWorkerInterceptor(): WorkerPerformanceInterceptor {
    return new WorkerPerformanceInterceptor();
  }

  static createAll(): {
    workflow: WorkflowPerformanceInterceptor;
    activity: ActivityPerformanceInterceptor;
    worker: WorkerPerformanceInterceptor;
  } {
    return {
      workflow: this.createWorkflowInterceptor(),
      activity: this.createActivityInterceptor(),
      worker: this.createWorkerInterceptor()
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  WorkflowPerformanceInterceptor,
  ActivityPerformanceInterceptor,
  WorkerPerformanceInterceptor,
  PerformanceInterceptorFactory
};

export default PerformanceInterceptorFactory;