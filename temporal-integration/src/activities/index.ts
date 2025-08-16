/**
 * Core Activities Implementation
 * Activities handle all external interactions and non-deterministic operations
 */

import { Context, ApplicationFailure } from '@temporalio/activity';
import type {
  ActivityInput,
  ActivityOutput,
  TaskRequest,
  TaskResult,
  TaskStatus
} from '../types';

// ============================================================================
// Core Task Processing Activity
// ============================================================================

export async function processTask(
  input: ActivityInput<TaskRequest>
): Promise<ActivityOutput<any>> {
  const { data: task, context } = input;
  const activityContext = Context.current();
  
  // Log activity start
  console.log(`Processing task ${task.id} of type ${task.type}`, {
    activityId: context.activityId,
    workflowId: context.workflowId,
    attemptNumber: context.attemptNumber
  });

  try {
    // Simulate processing based on task type
    switch (task.type) {
      case 'data_processing':
        return await processDataTask(task, activityContext);
      case 'file_processing':
        return await processFileTask(task, activityContext);
      case 'api_call':
        return await processApiTask(task, activityContext);
      case 'notification':
        return await processNotificationTask(task, activityContext);
      case 'monitoring':
        return await processMonitoringTask(task, activityContext);
      default:
        throw ApplicationFailure.nonRetryable(
          `Unknown task type: ${task.type}`,
          'UnknownTaskType'
        );
    }
  } catch (error) {
    console.error(`Task ${task.id} processing failed:`, error);
    
    if (error instanceof ApplicationFailure) {
      throw error;
    }
    
    // Wrap unknown errors as retryable
    throw ApplicationFailure.create({
      message: `Task processing failed: ${error instanceof Error ? error.message : String(error)}`,
      type: 'TaskProcessingError',
      nonRetryable: false
    });
  }
}

// ============================================================================
// Specialized Task Processors
// ============================================================================

async function processDataTask(
  task: TaskRequest,
  context: Context
): Promise<ActivityOutput<any>> {
  const { payload } = task;
  const startTime = Date.now();
  
  // Simulate data processing with heartbeat
  const steps = typeof payload.steps === 'number' ? payload.steps : 10;
  const stepDelay = typeof payload.stepDelay === 'number' ? payload.stepDelay : 100;
  
  for (let i = 0; i < steps; i++) {
    // Check for cancellation
    if (context.cancellationSignal.aborted) {
      throw new Error('Data processing cancelled');
    }
    
    // Send heartbeat with progress
    context.heartbeat({
      step: i + 1,
      totalSteps: steps,
      progress: ((i + 1) / steps) * 100,
      startTime
    });
    
    // Simulate processing step
    await new Promise(resolve => setTimeout(resolve, stepDelay));
    
    // Simulate processing logic
    if (payload.simulateError === true && i === Math.floor(steps / 2)) {
      throw new Error('Simulated processing error');
    }
  }
  
  const result = {
    processedRecords: steps,
    processingTime: Date.now() - startTime,
    dataSize: typeof payload.dataSize === 'number' ? payload.dataSize : 0,
    checksum: `checksum-${task.id}-${Date.now()}`
  };
  
  return {
    result,
    metadata: {
      processingMethod: 'batch',
      performanceMetrics: {
        recordsPerSecond: steps / ((Date.now() - startTime) / 1000),
        memoryUsage: process.memoryUsage().heapUsed
      }
    }
  };
}

async function processFileTask(
  task: TaskRequest,
  context: Context
): Promise<ActivityOutput<any>> {
  const { payload } = task;
  const startTime = Date.now();
  
  // Simulate file processing
  const fileSize = typeof payload.fileSize === 'number' ? payload.fileSize : 1024;
  const chunkSize = typeof payload.chunkSize === 'number' ? payload.chunkSize : 64;
  const chunks = Math.ceil(fileSize / chunkSize);
  
  for (let i = 0; i < chunks; i++) {
    if (context.cancellationSignal.aborted) {
      throw new Error('File processing cancelled');
    }
    
    context.heartbeat({
      chunk: i + 1,
      totalChunks: chunks,
      bytesProcessed: (i + 1) * chunkSize,
      totalBytes: fileSize
    });
    
    // Simulate chunk processing
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const result = {
    fileName: typeof payload.fileName === 'string' ? payload.fileName : `file-${task.id}`,
    fileSize,
    chunksProcessed: chunks,
    processingTime: Date.now() - startTime,
    outputPath: `/processed/${task.id}/output.dat`
  };
  
  return {
    result,
    metadata: {
      fileFormat: payload.fileFormat || 'binary',
      compressionRatio: 0.75,
      checksumValidated: true
    }
  };
}

async function processApiTask(
  task: TaskRequest,
  context: Context
): Promise<ActivityOutput<any>> {
  const { payload } = task;
  
  // Simulate API call with retry logic
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    if (context.cancellationSignal.aborted) {
      throw new Error('API call cancelled');
    }
    
    attempt++;
    context.heartbeat({ attempt, maxRetries, endpoint: payload.endpoint });
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Simulate success/failure
      if (payload.simulateFailure && attempt < maxRetries) {
        throw new Error(`API call failed on attempt ${attempt}`);
      }
      
      const result = {
        endpoint: payload.endpoint || `/api/task/${task.id}`,
        statusCode: 200,
        response: {
          id: task.id,
          status: 'success',
          timestamp: new Date().toISOString(),
          data: payload.responseData || { processed: true }
        },
        attempt
      };
      
      return {
        result,
        metadata: {
          responseTime: 200,
          retryAttempts: attempt - 1,
          apiVersion: 'v1'
        }
      };
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw ApplicationFailure.create({
          message: `API call failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
          type: 'ApiCallError',
          nonRetryable: false
        });
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  throw new Error('Unexpected API processing state');
}

async function processNotificationTask(
  task: TaskRequest,
  context: Context
): Promise<ActivityOutput<any>> {
  const { payload } = task;
  
  context.heartbeat({ 
    recipient: payload.recipient, 
    channel: payload.channel || 'email' 
  });
  
  // Simulate notification sending
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const result = {
    messageId: `msg-${task.id}-${Date.now()}`,
    recipient: payload.recipient,
    channel: payload.channel || 'email',
    subject: payload.subject || `Notification for task ${task.id}`,
    sentAt: new Date().toISOString(),
    deliveryStatus: 'sent'
  };
  
  return {
    result,
    metadata: {
      provider: 'internal',
      template: payload.template || 'default',
      priority: task.priority
    }
  };
}

async function processMonitoringTask(
  task: TaskRequest,
  context: Context
): Promise<ActivityOutput<any>> {
  const { payload } = task;
  
  context.heartbeat({ 
    monitoringType: payload.type || 'health_check',
    iteration: payload.iteration || 0
  });
  
  // Simulate monitoring check
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const result = {
    checkId: `check-${task.id}-${Date.now()}`,
    type: payload.type || 'health_check',
    status: Math.random() > 0.1 ? 'healthy' : 'warning', // 90% healthy
    metrics: {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      disk: Math.random() * 100,
      network: Math.random() * 1000
    },
    checkedAt: new Date().toISOString(),
    iteration: payload.iteration || 0
  };
  
  return {
    result,
    metadata: {
      checkDuration: 100,
      previousStatus: payload.previousStatus || 'unknown'
    }
  };
}

// ============================================================================
// Input Validation Activity
// ============================================================================

export async function validateInput(
  task: TaskRequest
): Promise<ActivityOutput<boolean>> {
  const context = Context.current();
  
  console.log(`Validating input for task ${task.id}`);
  
  context.heartbeat({ phase: 'validation_start', taskId: task.id });
  
  // Simulate validation delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Basic validation
  if (!task.id || !task.type) {
    throw ApplicationFailure.nonRetryable(
      'Task must have id and type',
      'ValidationError'
    );
  }
  
  if (!task.payload) {
    throw ApplicationFailure.nonRetryable(
      'Task must have payload',
      'ValidationError'
    );
  }
  
  // Type-specific validation
  switch (task.type) {
    case 'api_call':
      if (!task.payload.endpoint) {
        throw ApplicationFailure.nonRetryable(
          'API call tasks must specify endpoint',
          'ValidationError'
        );
      }
      break;
    case 'notification':
      if (!task.payload.recipient) {
        throw ApplicationFailure.nonRetryable(
          'Notification tasks must specify recipient',
          'ValidationError'
        );
      }
      break;
  }
  
  context.heartbeat({ phase: 'validation_complete', taskId: task.id });
  
  return {
    result: true,
    metadata: {
      validatedAt: new Date().toISOString(),
      validationRules: ['required_fields', 'type_specific']
    }
  };
}

// ============================================================================
// Status Update Activity
// ============================================================================

export async function updateStatus(
  input: ActivityInput<{
    taskId: string;
    status: TaskStatus;
    result?: any;
    error?: string;
  }>
): Promise<ActivityOutput<boolean>> {
  const { data, context } = input;
  const activityContext = Context.current();
  
  console.log(`Updating status for task ${data.taskId} to ${data.status}`);
  
  activityContext.heartbeat({
    taskId: data.taskId,
    newStatus: data.status,
    hasResult: !!data.result,
    hasError: !!data.error
  });
  
  // Simulate database update
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Simulate potential database error
  if (Math.random() < 0.05) { // 5% chance of database error
    throw ApplicationFailure.create({
      message: 'Database connection timeout',
      type: 'DatabaseError',
      nonRetryable: false
    });
  }
  
  return {
    result: true,
    metadata: {
      updatedAt: new Date().toISOString(),
      previousStatus: 'unknown', // Would come from database
      updateMethod: 'direct'
    }
  };
}

// ============================================================================
// Notification Activity
// ============================================================================

export async function sendNotification(
  input: ActivityInput<{
    recipient: string;
    message: string;
    taskId: string;
    result?: any;
  }>
): Promise<ActivityOutput<string>> {
  const { data, context } = input;
  const activityContext = Context.current();
  
  console.log(`Sending notification to ${data.recipient} for task ${data.taskId}`);
  
  activityContext.heartbeat({
    recipient: data.recipient,
    taskId: data.taskId,
    messageLength: data.message.length
  });
  
  // Simulate notification service call
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const messageId = `notif-${data.taskId}-${Date.now()}`;
  
  return {
    result: messageId,
    metadata: {
      sentAt: new Date().toISOString(),
      channel: 'email', // Default channel
      deliveryStatus: 'queued'
    }
  };
}

// ============================================================================
// Report Generation Activity
// ============================================================================

export async function generateReport(
  input: ActivityInput<{
    taskId: string;
    type: string;
    result: any;
    metadata: Record<string, unknown>;
  }>
): Promise<ActivityOutput<string>> {
  const { data, context } = input;
  const activityContext = Context.current();
  
  console.log(`Generating report for task ${data.taskId}`);
  
  const reportSteps = ['collect_data', 'process_metrics', 'format_report', 'save_report'];
  
  for (let i = 0; i < reportSteps.length; i++) {
    activityContext.heartbeat({
      step: reportSteps[i],
      progress: ((i + 1) / reportSteps.length) * 100,
      taskId: data.taskId
    });
    
    // Simulate report generation step
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  const reportId = `report-${data.taskId}-${Date.now()}`;
  const reportPath = `/reports/${reportId}.json`;
  
  return {
    result: reportPath,
    metadata: {
      reportId,
      generatedAt: new Date().toISOString(),
      format: 'json',
      size: Math.floor(Math.random() * 10000) + 1000 // Simulate file size
    }
  };
}

// ============================================================================
// Cleanup Activity
// ============================================================================

export async function cleanupResources(
  input: ActivityInput<{
    taskId: string;
    reason: string;
    error?: string;
  }>
): Promise<ActivityOutput<boolean>> {
  const { data, context } = input;
  const activityContext = Context.current();
  
  console.log(`Cleaning up resources for task ${data.taskId}, reason: ${data.reason}`);
  
  const cleanupSteps = ['temp_files', 'cache_entries', 'connections', 'locks'];
  
  for (let i = 0; i < cleanupSteps.length; i++) {
    if (activityContext.cancellationSignal.aborted) {
      console.log('Cleanup cancelled, stopping early');
      break;
    }
    
    activityContext.heartbeat({
      step: cleanupSteps[i],
      progress: ((i + 1) / cleanupSteps.length) * 100,
      taskId: data.taskId
    });
    
    // Simulate cleanup step
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return {
    result: true,
    metadata: {
      cleanedAt: new Date().toISOString(),
      reason: data.reason,
      stepsCompleted: cleanupSteps.length
    }
  };
}

// ============================================================================
// Health Check Activity
// ============================================================================

export async function healthCheck(): Promise<ActivityOutput<{
  status: string;
  timestamp: string;
  services: Record<string, string>;
}>> {
  const context = Context.current();
  
  context.heartbeat({ phase: 'health_check_start' });
  
  // Simulate health checks for various services
  const services = {
    database: Math.random() > 0.05 ? 'healthy' : 'unhealthy',
    cache: Math.random() > 0.02 ? 'healthy' : 'unhealthy',
    queue: Math.random() > 0.01 ? 'healthy' : 'unhealthy',
    storage: Math.random() > 0.03 ? 'healthy' : 'unhealthy'
  };
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const allHealthy = Object.values(services).every(status => status === 'healthy');
  
  return {
    result: {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services
    },
    metadata: {
      checkDuration: 500,
      servicesChecked: Object.keys(services).length
    }
  };
}