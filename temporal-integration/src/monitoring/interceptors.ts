/**
 * Temporal Interceptors for Monitoring and Observability
 * Provides automatic metrics collection, tracing, and performance monitoring
 */

import {
  ActivityInboundCallsInterceptor,
  ActivityExecuteInput,
  ActivityInput,
  Next,
  WorkflowInboundCallsInterceptor,
  WorkflowExecuteInput,
  WorkflowInterceptors,
  WorkflowOutboundCallsInterceptor,
  ScheduleActivityInput,
  StartChildWorkflowExecutionInput
} from '@temporalio/workflow';

import {
  ActivityInterceptors,
  ActivityInboundCallsInterceptorConstructor,
  Context
} from '@temporalio/activity';

import {
  WorkerInterceptors,
  WorkflowInboundCallsInterceptorConstructor
} from '@temporalio/worker';

import * as opentelemetry from '@opentelemetry/api';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

import { MetricsCollector, MonitoringManager } from './index';
import { LogLevel, LogEntry } from '../types';

// ============================================================================
// Workflow Monitoring Interceptor
// ============================================================================

export class WorkflowMonitoringInterceptor implements WorkflowInboundCallsInterceptor {
  private workflowType: string;
  private workflowId: string;
  private runId: string;
  private startTime: number;
  private metricsCollector: MetricsCollector;
  private tracer: opentelemetry.Tracer;
  private rootSpan?: opentelemetry.Span;

  constructor(context: any) {
    this.workflowType = context.info.workflowType;
    this.workflowId = context.info.workflowId;
    this.runId = context.info.runId;
    this.startTime = Date.now();
    this.metricsCollector = MetricsCollector.getInstance();
    this.tracer = opentelemetry.trace.getTracer('temporal-workflow');
  }

  async execute(
    input: WorkflowExecuteInput,
    next: Next<WorkflowInboundCallsInterceptor, 'execute'>
  ): Promise<unknown> {
    // Start workflow span
    this.rootSpan = this.tracer.startSpan(`workflow:${this.workflowType}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'workflow.type': this.workflowType,
        'workflow.id': this.workflowId,
        'workflow.run_id': this.runId,
        'workflow.task_queue': input.headers?.taskQueue || 'default'
      }
    });

    // Record workflow start
    this.metricsCollector.recordWorkflowStart();
    
    this.log('info', `Workflow started: ${this.workflowType}`, {
      workflowId: this.workflowId,
      runId: this.runId
    });

    try {
      // Execute workflow
      const result = await opentelemetry.context.with(
        opentelemetry.trace.setSpan(opentelemetry.context.active(), this.rootSpan),
        async () => {
          return await next(input);
        }
      );

      // Record successful completion
      const duration = Date.now() - this.startTime;
      this.metricsCollector.recordWorkflowCompletion(duration);
      
      this.rootSpan.setStatus({ code: SpanStatusCode.OK });
      this.rootSpan.setAttribute('workflow.duration_ms', duration);
      
      this.log('info', `Workflow completed: ${this.workflowType}`, {
        workflowId: this.workflowId,
        duration
      });

      return result;
    } catch (error) {
      // Record failure
      this.metricsCollector.recordWorkflowFailure();
      
      this.rootSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        this.rootSpan.recordException(error);
      }
      
      this.log('error', `Workflow failed: ${this.workflowType}`, {
        workflowId: this.workflowId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    } finally {
      this.rootSpan?.end();
    }
  }

  async handleSignal(
    input: any,
    next: Next<WorkflowInboundCallsInterceptor, 'handleSignal'>
  ): Promise<void> {
    const span = this.tracer.startSpan(`signal:${input.signalName}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'signal.name': input.signalName,
        'workflow.id': this.workflowId
      }
    });

    this.log('debug', `Signal received: ${input.signalName}`, {
      workflowId: this.workflowId,
      args: input.args
    });

    try {
      await opentelemetry.context.with(
        opentelemetry.trace.setSpan(opentelemetry.context.active(), span),
        async () => {
          await next(input);
        }
      );
      
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        span.recordException(error);
      }
      
      throw error;
    } finally {
      span.end();
    }
  }

  async handleQuery(
    input: any,
    next: Next<WorkflowInboundCallsInterceptor, 'handleQuery'>
  ): Promise<unknown> {
    const span = this.tracer.startSpan(`query:${input.queryName}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'query.name': input.queryName,
        'workflow.id': this.workflowId
      }
    });

    this.log('debug', `Query received: ${input.queryName}`, {
      workflowId: this.workflowId,
      args: input.args
    });

    try {
      const result = await opentelemetry.context.with(
        opentelemetry.trace.setSpan(opentelemetry.context.active(), span),
        async () => {
          return await next(input);
        }
      );
      
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        span.recordException(error);
      }
      
      throw error;
    } finally {
      span.end();
    }
  }

  private log(level: LogLevel, message: string, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      source: 'workflow',
      workflowId: this.workflowId,
      metadata
    };
    
    // In production, this would send to a logging service
    console.log(`[${level.toUpperCase()}] ${message}`, metadata || '');
  }
}

// ============================================================================
// Workflow Outbound Interceptor
// ============================================================================

export class WorkflowOutboundInterceptor implements WorkflowOutboundCallsInterceptor {
  private tracer: opentelemetry.Tracer;

  constructor() {
    this.tracer = opentelemetry.trace.getTracer('temporal-workflow-outbound');
  }

  async scheduleActivity(
    input: ScheduleActivityInput,
    next: Next<WorkflowOutboundCallsInterceptor, 'scheduleActivity'>
  ): Promise<unknown> {
    const span = this.tracer.startSpan(`schedule-activity:${input.activityType}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'activity.type': input.activityType,
        'activity.task_queue': input.taskQueue || 'default'
      }
    });

    try {
      const result = await next(input);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        span.recordException(error);
      }
      
      throw error;
    } finally {
      span.end();
    }
  }

  async startChildWorkflowExecution(
    input: StartChildWorkflowExecutionInput,
    next: Next<WorkflowOutboundCallsInterceptor, 'startChildWorkflowExecution'>
  ): Promise<[Promise<unknown>, Promise<unknown>]> {
    const span = this.tracer.startSpan(`start-child-workflow:${input.workflowType}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'child_workflow.type': input.workflowType,
        'child_workflow.id': input.workflowId
      }
    });

    try {
      const result = await next(input);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        span.recordException(error);
      }
      
      throw error;
    } finally {
      span.end();
    }
  }

  async signalWorkflow(
    input: any,
    next: Next<WorkflowOutboundCallsInterceptor, 'signalWorkflow'>
  ): Promise<void> {
    const span = this.tracer.startSpan(`signal-workflow:${input.signalName}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'signal.name': input.signalName,
        'target_workflow.id': input.workflowId
      }
    });

    try {
      await next(input);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        span.recordException(error);
      }
      
      throw error;
    } finally {
      span.end();
    }
  }
}

// ============================================================================
// Activity Monitoring Interceptor
// ============================================================================

export class ActivityMonitoringInterceptor implements ActivityInboundCallsInterceptor {
  private activityType: string;
  private startTime: number;
  private metricsCollector: MetricsCollector;
  private tracer: opentelemetry.Tracer;
  private span?: opentelemetry.Span;
  private attemptNumber = 0;

  constructor(context: Context) {
    this.activityType = context.info.activityType;
    this.startTime = Date.now();
    this.metricsCollector = MetricsCollector.getInstance();
    this.tracer = opentelemetry.trace.getTracer('temporal-activity');
  }

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, 'execute'>
  ): Promise<unknown> {
    this.attemptNumber++;
    
    // Start activity span
    this.span = this.tracer.startSpan(`activity:${this.activityType}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'activity.type': this.activityType,
        'activity.id': input.headers?.activityId || 'unknown',
        'activity.attempt': this.attemptNumber,
        'activity.task_queue': input.headers?.taskQueue || 'default'
      }
    });

    // Record activity start
    this.metricsCollector.recordActivityStart();
    
    if (this.attemptNumber > 1) {
      this.metricsCollector.recordActivityRetry();
    }
    
    this.log('info', `Activity started: ${this.activityType}`, {
      activityId: input.headers?.activityId,
      attempt: this.attemptNumber
    });

    try {
      // Execute activity
      const result = await opentelemetry.context.with(
        opentelemetry.trace.setSpan(opentelemetry.context.active(), this.span),
        async () => {
          return await next(input);
        }
      );

      // Record successful completion
      const duration = Date.now() - this.startTime;
      this.metricsCollector.recordActivityCompletion(duration);
      
      this.span.setStatus({ code: SpanStatusCode.OK });
      this.span.setAttribute('activity.duration_ms', duration);
      
      this.log('info', `Activity completed: ${this.activityType}`, {
        activityId: input.headers?.activityId,
        duration
      });

      return result;
    } catch (error) {
      // Record failure
      this.metricsCollector.recordActivityFailure();
      
      this.span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      
      if (error instanceof Error) {
        this.span.recordException(error);
      }
      
      this.log('error', `Activity failed: ${this.activityType}`, {
        activityId: input.headers?.activityId,
        error: error instanceof Error ? error.message : String(error),
        attempt: this.attemptNumber
      });

      throw error;
    } finally {
      this.span?.end();
    }
  }

  private log(level: LogLevel, message: string, metadata?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      source: 'activity',
      activityType: this.activityType,
      metadata
    };
    
    // In production, this would send to a logging service
    console.log(`[${level.toUpperCase()}] ${message}`, metadata || '');
  }
}

// ============================================================================
// Interceptor Factories
// ============================================================================

export const workflowMonitoringInterceptorFactory: WorkflowInboundCallsInterceptorConstructor = (
  context: any
) => {
  return new WorkflowMonitoringInterceptor(context);
};

export const activityMonitoringInterceptorFactory: ActivityInboundCallsInterceptorConstructor = (
  context: Context
) => {
  return new ActivityMonitoringInterceptor(context);
};

// ============================================================================
// Workflow Interceptors Provider
// ============================================================================

export function createWorkflowInterceptors(): WorkflowInterceptors {
  return {
    inbound: [new WorkflowMonitoringInterceptor({
      info: {
        workflowType: 'unknown',
        workflowId: 'unknown',
        runId: 'unknown'
      }
    })],
    outbound: [new WorkflowOutboundInterceptor()]
  };
}

// ============================================================================
// Activity Interceptors Provider
// ============================================================================

export function createActivityInterceptors(): ActivityInterceptors {
  return {
    inbound: [new ActivityMonitoringInterceptor({
      info: {
        activityType: 'unknown',
        workflowId: 'unknown',
        runId: 'unknown',
        activityId: 'unknown',
        taskQueue: 'default'
      } as any
    } as Context)]
  };
}

// ============================================================================
// Worker Interceptors Provider
// ============================================================================

export function createWorkerInterceptors(): WorkerInterceptors {
  return {
    workflowModules: [{
      interceptors: workflowMonitoringInterceptorFactory
    }],
    activityInbound: [activityMonitoringInterceptorFactory]
  };
}

// ============================================================================
// Metrics Reporter
// ============================================================================

export class MetricsReporter {
  private metricsCollector: MetricsCollector;
  private reportInterval?: NodeJS.Timer;
  private reportingEnabled = false;

  constructor() {
    this.metricsCollector = MetricsCollector.getInstance();
  }

  startReporting(intervalMs = 60000): void {
    if (this.reportingEnabled) return;
    
    this.reportingEnabled = true;
    this.reportInterval = setInterval(() => {
      this.reportMetrics();
    }, intervalMs);
    
    console.log('Metrics reporting started');
  }

  stopReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = undefined;
    }
    this.reportingEnabled = false;
    console.log('Metrics reporting stopped');
  }

  private reportMetrics(): void {
    const metrics = this.metricsCollector.getMetrics();
    const performance = this.metricsCollector.getPerformanceMetrics();
    
    console.log('=== Temporal Metrics Report ===');
    console.log('Workflows:', {
      started: metrics.workflows.started,
      completed: metrics.workflows.completed,
      failed: metrics.workflows.failed,
      running: metrics.workflows.running,
      successRate: `${performance.workflowSuccessRate.toFixed(1)}%`
    });
    
    console.log('Activities:', {
      started: metrics.activities.started,
      completed: metrics.activities.completed,
      failed: metrics.activities.failed,
      retried: metrics.activities.retried,
      successRate: `${performance.activitySuccessRate.toFixed(1)}%`
    });
    
    console.log('System:', {
      cpu: `${metrics.system.cpuUsage.toFixed(1)}%`,
      memory: `${metrics.system.memoryUsage.toFixed(1)}%`,
      heap: `${metrics.system.heapUsage.toFixed(1)}%`,
      uptime: `${Math.floor(metrics.system.uptime / 1000)}s`
    });
    
    console.log('Workers:', {
      active: metrics.workers.active,
      queueLength: metrics.workers.taskQueueLength,
      throughput: metrics.workers.taskThroughput,
      errorRate: `${metrics.workers.errorRate.toFixed(1)}%`
    });
    
    console.log('==============================');
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  WorkflowMonitoringInterceptor,
  WorkflowOutboundInterceptor,
  ActivityMonitoringInterceptor,
  MetricsReporter
};

export default {
  createWorkflowInterceptors,
  createActivityInterceptors,
  createWorkerInterceptors,
  workflowMonitoringInterceptorFactory,
  activityMonitoringInterceptorFactory,
  MetricsReporter
};