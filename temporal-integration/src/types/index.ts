/**
 * Core types and interfaces for Temporal.io integration
 */

import { z } from 'zod';

// ============================================================================
// Core Domain Types
// ============================================================================

export const TaskStatusSchema = z.enum([
  'pending',
  'in_progress', 
  'completed',
  'failed',
  'cancelled',
  'timeout'
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskRequestSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.record(z.unknown()),
  priority: TaskPrioritySchema.default('normal'),
  retryPolicy: z.object({
    maxAttempts: z.number().min(1).default(3),
    backoffCoefficient: z.number().min(1).default(2),
    initialInterval: z.string().default('1s'),
    maximumInterval: z.string().default('1m')
  }).optional(),
  timeout: z.string().default('5m'),
  metadata: z.record(z.string()).default({})
});

export type TaskRequest = z.infer<typeof TaskRequestSchema>;

export const TaskResultSchema = z.object({
  taskId: z.string().uuid(),
  status: TaskStatusSchema,
  result: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  duration: z.number().optional(),
  attempts: z.number().default(1),
  metadata: z.record(z.string()).default({})
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

// ============================================================================
// Workflow Types
// ============================================================================

export interface WorkflowContext {
  workflowId: string;
  taskQueue: string;
  namespace: string;
  startedAt: Date;
  metadata: Record<string, string>;
}

export interface WorkflowInput<T = unknown> {
  data: T;
  context: WorkflowContext;
}

export interface WorkflowOutput<T = unknown> {
  result: T;
  status: TaskStatus;
  metadata: Record<string, unknown>;
}

// ============================================================================
// Activity Types  
// ============================================================================

export interface ActivityContext {
  activityId: string;
  workflowId: string;
  attemptNumber: number;
  heartbeatDetails?: unknown;
  info: {
    taskQueue: string;
    activityType: string;
    scheduledTime: Date;
    startedTime: Date;
  };
}

export interface ActivityInput<T = unknown> {
  data: T;
  context: ActivityContext;
}

export interface ActivityOutput<T = unknown> {
  result: T;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Signal and Query Types
// ============================================================================

export interface SignalDefinition<T = unknown> {
  name: string;
  type: 'signal';
  payloadSchema: z.ZodSchema<T>;
}

export interface QueryDefinition<T = unknown> {
  name: string;
  type: 'query';
  responseSchema: z.ZodSchema<T>;
}

export interface UpdateDefinition<TArgs = unknown, TReturn = unknown> {
  name: string;
  type: 'update';
  argsSchema: z.ZodSchema<TArgs>;
  returnSchema: z.ZodSchema<TReturn>;
}

// ============================================================================
// Error Types
// ============================================================================

export class TemporalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TemporalError';
  }
}

export class ValidationError extends TemporalError {
  constructor(message: string, public readonly field: string) {
    super(message, 'VALIDATION_ERROR', false, { field });
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends TemporalError {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message, 'TIMEOUT_ERROR', true, { timeoutMs });
    this.name = 'TimeoutError';
  }
}

export class RetryExhaustedError extends TemporalError {
  constructor(message: string, public readonly attempts: number) {
    super(message, 'RETRY_EXHAUSTED', false, { attempts });
    this.name = 'RetryExhaustedError';
  }
}

// ============================================================================
// Worker Configuration Types
// ============================================================================

export interface WorkerConfig {
  namespace: string;
  taskQueue: string;
  workflowsPath?: string;
  activities?: Record<string, Function>;
  maxConcurrentWorkflowTaskExecutions?: number;
  maxConcurrentActivityTaskExecutions?: number;
  maxConcurrentLocalActivityExecutions?: number;
  maxCachedWorkflows?: number;
  reuseV8Context?: boolean;
  identity?: string;
  buildId?: string;
  useVersioning?: boolean;
  telemetryOptions?: {
    metrics?: {
      prometheus?: {
        bindAddress: string;
      };
    };
  };
}

// ============================================================================
// Client Configuration Types
// ============================================================================

export interface ClientConfig {
  address?: string;
  namespace?: string;
  tls?: {
    clientCertPair?: {
      crt: Buffer;
      key: Buffer;
    };
    serverName?: string;
    serverRootCACertificate?: Buffer;
  };
  apiKey?: string;
  identity?: string;
}

// ============================================================================
// Monitoring and Observability Types
// ============================================================================

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels?: string[];
}

export interface WorkflowMetrics {
  executionCount: number;
  averageDuration: number;
  successRate: number;
  errorRate: number;
  retryCount: number;
}

export interface ActivityMetrics {
  executionCount: number;
  averageDuration: number;
  successRate: number;
  errorRate: number;
  timeoutRate: number;
}

export interface WorkerMetrics {
  tasksProcessed: number;
  workflowsActive: number;
  activitiesActive: number;
  pollerCount: number;
  taskSlotUtilization: number;
}

// ============================================================================
// Schedule Types
// ============================================================================

export const ScheduleSpecSchema = z.object({
  intervals: z.array(z.object({
    every: z.string(),
    offset: z.string().optional()
  })).optional(),
  calendars: z.array(z.object({
    second: z.string().optional(),
    minute: z.string().optional(),
    hour: z.string().optional(),
    dayOfMonth: z.string().optional(),
    month: z.string().optional(),
    year: z.string().optional(),
    dayOfWeek: z.string().optional(),
    comment: z.string().optional()
  })).optional(),
  cronExpressions: z.array(z.string()).optional(),
  excludeCalendars: z.array(z.object({
    second: z.string().optional(),
    minute: z.string().optional(),
    hour: z.string().optional(),
    dayOfMonth: z.string().optional(),
    month: z.string().optional(),
    year: z.string().optional(),
    dayOfWeek: z.string().optional(),
    comment: z.string().optional()
  })).optional(),
  startAt: z.date().optional(),
  endAt: z.date().optional(),
  jitter: z.string().optional()
});

export type ScheduleSpec = z.infer<typeof ScheduleSpecSchema>;

export const SchedulePolicySchema = z.object({
  overlap: z.enum(['SKIP', 'BUFFER_ONE', 'BUFFER_ALL', 'CANCEL_OTHER', 'TERMINATE_OTHER']).default('SKIP'),
  catchupWindow: z.string().optional(),
  pauseOnFailure: z.boolean().default(false)
});

export type SchedulePolicy = z.infer<typeof SchedulePolicySchema>;

// ============================================================================
// Testing Types
// ============================================================================

export interface TestWorkflowEnvironmentConfig {
  namespace?: string;
  timeSkipping?: boolean;
  baseTime?: Date;
}

export interface MockActivityEnvironmentConfig {
  heartbeatTimeoutMs?: number;
  enableHeartbeatDetails?: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// ============================================================================
// Re-exports from Temporal SDK
// ============================================================================

export type {
  WorkflowHandle,
  WorkflowExecution,
  WorkflowExecutionInfo,
  WorkflowOptions,
  RetryPolicy,
  ScheduleOverlapPolicy,
  QueryDefinition as TemporalQueryDefinition,
  SignalDefinition as TemporalSignalDefinition,
  UpdateDefinition as TemporalUpdateDefinition
} from '@temporalio/client';

export type {
  ApplicationFailure,
  ActivityFailure,
  TimeoutFailure,
  CancelledFailure,
  ChildWorkflowFailure,
  ServerFailure,
  TerminatedFailure
} from '@temporalio/common';

export type {
  Context as ActivityExecutionContext,
  Info as ActivityInfo
} from '@temporalio/activity';

export type {
  CancellationScope,
  ChildWorkflowCancellationType,
  ParentClosePolicy,
  ContinueAsNewOptions
} from '@temporalio/workflow';

// ============================================================================
// Missing Type Definitions
// ============================================================================

// Activity Options (custom definition since not exported from client)
export interface ActivityOptions {
  startToCloseTimeout?: string;
  scheduleToStartTimeout?: string;
  scheduleToCloseTimeout?: string;
  heartbeatTimeout?: string;
  retry?: RetryPolicy;
  taskQueue?: string;
}

// Child Workflow Options (custom definition)
export interface ChildWorkflowOptions {
  workflowId?: string;
  taskQueue?: string;
  workflowExecutionTimeout?: string;
  workflowRunTimeout?: string;
  workflowTaskTimeout?: string;
  retry?: RetryPolicy;
  parentClosePolicy?: ParentClosePolicy;
  cancellationType?: ChildWorkflowCancellationType;
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
}

// Scheduled Workflow Config
export interface ScheduledWorkflowConfig {
  schedule: string; // cron expression
  workflowType: string;
  args: unknown[];
  options?: WorkflowOptions;
  timezone?: string;
  jitter?: string;
  notes?: string;
}

// Timer Event
export interface TimerEvent {
  id: string;
  duration: string;
  payload?: unknown;
  metadata?: Record<string, string>;
}

// Recurring Task Config
export interface RecurringTaskConfig {
  interval: string;
  taskType: string;
  payload: unknown;
  retryPolicy?: RetryPolicy;
  enabled: boolean;
}