/**
 * Centralized Temporal SDK imports with correct type definitions
 * This file resolves TypeScript compilation issues by importing from the correct packages
 */

// ============================================================================
// Client Types - from @temporalio/client
// ============================================================================
export type {
  Client,
  Connection,
  ConnectionOptions,
  WorkflowHandle,
  WorkflowClient,
  WorkflowClientOptions,
  WorkflowOptions,
  WorkflowExecutionInfo,
  WorkflowExecution,
  WorkflowStartOptions,
  QueryDefinition,
  SignalDefinition,
  UpdateDefinition,
  ScheduleClient,
  ScheduleHandle,
  ScheduleDescription,
  ScheduleOptions,
  ScheduleUpdateOptions,
  ScheduleSpec,
  SchedulePolicy,
  ScheduleOverlapPolicy,
  ScheduleState,
  ScheduleInfo,
  ScheduleAction,
  ScheduleActionStartWorkflow
} from '@temporalio/client';

// ============================================================================
// Common Types - from @temporalio/common
// ============================================================================
export type {
  RetryPolicy,
  ApplicationFailure,
  ActivityFailure,
  TimeoutFailure,
  CancelledFailure,
  ChildWorkflowFailure,
  ServerFailure,
  TerminatedFailure,
  DataConverter,
  Payload,
  PayloadConverter,
  SearchAttributes,
  Duration,
  WorkflowIdReusePolicy,
  WorkflowIdConflictPolicy,
  VersioningIntent
} from '@temporalio/common';

// ============================================================================
// Workflow Types - from @temporalio/workflow
// ============================================================================
export {
  proxyActivities,
  proxyLocalActivities,
  defineSignal,
  defineQuery,
  defineUpdate,
  setHandler,
  condition,
  sleep,
  workflowInfo,
  uuid4,
  patched,
  deprecatePatch,
  continueAsNew,
  makeContinueAsNewFunc,
  executeChild,
  startChild,
  getExternalWorkflowHandle,
  upsertSearchAttributes,
  isCancellation,
  ensureApplicationFailure,
  proxySinks,
  log
} from '@temporalio/workflow';

export type {
  ActivityOptions,
  LocalActivityOptions,
  ChildWorkflowOptions,
  ContinueAsNewOptions,
  ParentClosePolicy,
  ChildWorkflowCancellationType,
  CancellationScope,
  Trigger,
  WorkflowInfo,
  ChildWorkflowHandle,
  ExternalWorkflowHandle,
  Sink,
  Sinks,
  UnsafeWorkflowInfo,
  WorkflowInterceptors,
  WorkflowInboundCallsInterceptor,
  WorkflowOutboundCallsInterceptor,
  Next,
  WorkflowExecuteInput,
  SignalInput,
  QueryInput,
  UpdateInput,
  ContinueAsNewInput,
  StartChildWorkflowExecutionInput,
  SignalExternalInput,
  CancelExternalInput
} from '@temporalio/workflow';

// ============================================================================
// Activity Types - from @temporalio/activity
// ============================================================================
export {
  Context,
  heartbeat,
  sleep as activitySleep,
  cancelled,
  complete,
  completedOrThrow,
  asyncLocalStorage
} from '@temporalio/activity';

export type {
  Info as ActivityInfo,
  CompleteAsyncError,
  ActivityFunction,
  ActivityInterface,
  UntypedActivities
} from '@temporalio/activity';

// ============================================================================
// Worker Types - from @temporalio/worker
// ============================================================================
export {
  Worker,
  NativeConnection,
  Runtime,
  DefaultLogger,
  bundleWorkflowCode,
  makeTelemetryFilterString
} from '@temporalio/worker';

export type {
  WorkerOptions,
  CompiledWorkerOptions,
  ReplayWorkerOptions,
  TelemetryOptions,
  RuntimeOptions,
  WorkerInterceptors,
  ActivityInboundCallsInterceptor,
  ActivityOutboundCallsInterceptor,
  ActivityExecuteInput,
  WorkflowBundle,
  BundleOptions,
  Logger,
  LogLevel,
  LogEntry,
  ConsoleLogger,
  WorkerTuner,
  SlotSupplier,
  ResourceBasedSlotOptions,
  ResourceBasedTunerOptions,
  FixedSizeSlotSupplier,
  SlotInfo,
  SlotPermit,
  SlotReservation,
  SlotMarkUsedContext,
  SlotReleaseContext,
  TunerHolder,
  WorkerBuildId,
  WorkerBuildIdVersionSets
} from '@temporalio/worker';

// ============================================================================
// Testing Types - from @temporalio/testing
// ============================================================================
export {
  TestWorkflowEnvironment,
  MockActivityEnvironment,
  TimeSkippingWorkflowClient
} from '@temporalio/testing';

export type {
  TestWorkflowEnvironmentOptions,
  MockActivityEnvironmentOptions,
  TestWorkflowEnvironmentOptionsWithoutClient,
  TestWorkflowEnvironmentOptionsWithClient
} from '@temporalio/testing';

// ============================================================================
// Helper type for activity proxy
// ============================================================================
export type ActivityOptionsWithDefaults = ActivityOptions & {
  startToCloseTimeout: Duration;
};

// ============================================================================
// Re-export common enums and constants
// ============================================================================
export { 
  ActivityCancellationType,
  WorkflowIdReusePolicy as IdReusePolicy,
  WorkflowIdConflictPolicy as IdConflictPolicy
} from '@temporalio/common';

export {
  ParentClosePolicy as ParentPolicy,
  ChildWorkflowCancellationType as ChildCancellationType
} from '@temporalio/workflow';