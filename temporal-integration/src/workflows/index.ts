/**
 * Workflow exports for Temporal worker
 */

// Export specific workflows
export { taskProcessingWorkflow } from './task-processing.workflow';
export { advancedControlWorkflow } from './advanced-control.workflow';
export { cronScheduledWorkflow, intervalScheduledWorkflow } from './scheduled.workflow';

// Export specific signals, queries, and updates to avoid conflicts
export { 
  pauseTaskSignal,
  resumeTaskSignal,
  cancelTaskSignal,
  getProgressQuery
} from './task-processing.workflow';

export {
  pauseWorkflowSignal,
  resumeWorkflowSignal,
  cancelWorkflowSignal,
  updateConfigurationSignal,
  skipTaskSignal,
  getSignalHistoryQuery
} from './advanced-control.workflow';

export {
  pauseScheduleSignal,
  resumeScheduleSignal,
  getScheduleStatusQuery
} from './scheduled.workflow';