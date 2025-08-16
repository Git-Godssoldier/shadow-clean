/**
 * Workflow exports for Temporal worker
 */

// Export specific workflows
export { taskProcessingWorkflow } from './task-processing.workflow';
export { advancedControlWorkflow } from './advanced-control.workflow';
export { cronScheduledWorkflow, intervalScheduledWorkflow } from './scheduled.workflow';

// Export specific signals, queries, and updates to avoid conflicts
export { 
  pauseWorkflowSignal,
  resumeWorkflowSignal,
  cancelWorkflowSignal,
  getWorkflowStateQuery
} from './task-processing.workflow';

export {
  retryFailedTaskSignal,
  skipStepSignal,
  modifyControlFlowSignal,
  updateQualityGateSignal,
  updateCircuitBreakerSignal,
  getControlStateQuery,
  updateConfigUpdate,
  updateRateLimitUpdate
} from './advanced-control.workflow';

export {
  pauseScheduleSignal,
  resumeScheduleSignal,
  getScheduleStatusQuery
} from './scheduled.workflow';