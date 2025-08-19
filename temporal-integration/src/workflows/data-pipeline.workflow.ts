/**
 * Data Pipeline Workflow
 * Real-world example: Process CSV files, transform data, and store results
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  workflowInfo,
  isCancellation
} from '@temporalio/workflow';
import { ApplicationFailure } from '@temporalio/common';
import type * as activities from '../activities/data-pipeline.activities';

// Proxy activities with retry configuration
const {
  downloadFile,
  validateCSV,
  parseCSVData,
  transformData,
  enrichData,
  validateTransformedData,
  storeInDatabase,
  generateReport,
  sendNotification,
  cleanupTempFiles
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '30s',
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['ValidationError', 'DataFormatError']
  }
});

// Define workflow state
interface PipelineState {
  status: 'downloading' | 'validating' | 'parsing' | 'transforming' | 'enriching' | 'storing' | 'completed' | 'failed';
  progress: number;
  recordsProcessed: number;
  recordsTotal: number;
  errors: string[];
  startTime: Date;
  completionTime?: Date;
  fileUrl?: string;
  outputLocation?: string;
}

// Define signals
export const pausePipelineSignal = defineSignal('pausePipeline');
export const resumePipelineSignal = defineSignal('resumePipeline');
export const cancelPipelineSignal = defineSignal('cancelPipeline');
export const retryFailedStepSignal = defineSignal<[string]>('retryFailedStep');

// Define queries
export const getPipelineStateQuery = defineQuery<PipelineState>('getPipelineState');
export const getProgressQuery = defineQuery<number>('getProgress');
export const getErrorsQuery = defineQuery<string[]>('getErrors');

export interface DataPipelineInput {
  fileUrl: string;
  format: 'csv' | 'json' | 'xlsx';
  transformationRules: {
    mapping: Record<string, string>;
    filters?: Array<{ field: string; operator: string; value: any }>;
    aggregations?: Array<{ field: string; operation: 'sum' | 'avg' | 'count' | 'min' | 'max' }>;
  };
  enrichmentConfig?: {
    apiEndpoint?: string;
    lookupTable?: string;
    joinKey?: string;
  };
  outputConfig: {
    database: string;
    table: string;
    format: 'sql' | 'nosql' | 'warehouse';
    partitionKey?: string;
  };
  notificationConfig: {
    email?: string;
    slack?: string;
    webhook?: string;
  };
}

export interface DataPipelineResult {
  success: boolean;
  recordsProcessed: number;
  duration: number;
  outputLocation: string;
  reportUrl?: string;
  errors?: string[];
}

/**
 * Main data pipeline workflow
 */
export async function dataPipelineWorkflow(
  input: DataPipelineInput
): Promise<DataPipelineResult> {
  const info = workflowInfo();
  
  // Initialize state
  const state: PipelineState = {
    status: 'downloading',
    progress: 0,
    recordsProcessed: 0,
    recordsTotal: 0,
    errors: [],
    startTime: new Date()
  };

  let isPaused = false;
  let shouldCancel = false;
  let retryStep: string | null = null;
  let tempFilePath: string | null = null;

  // Register signal handlers
  setHandler(pausePipelineSignal, () => {
    isPaused = true;
    console.log('Pipeline paused');
  });

  setHandler(resumePipelineSignal, () => {
    isPaused = false;
    console.log('Pipeline resumed');
  });

  setHandler(cancelPipelineSignal, () => {
    shouldCancel = true;
    console.log('Pipeline cancellation requested');
  });

  setHandler(retryFailedStepSignal, (step: string) => {
    retryStep = step;
    console.log(`Retry requested for step: ${step}`);
  });

  // Register query handlers
  setHandler(getPipelineStateQuery, () => state);
  setHandler(getProgressQuery, () => state.progress);
  setHandler(getErrorsQuery, () => state.errors);

  try {
    // Step 1: Download file
    state.status = 'downloading';
    state.progress = 10;
    
    await waitIfPaused(isPaused);
    if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
    
    tempFilePath = await downloadFile({
      url: input.fileUrl,
      workflowId: info.workflowId
    });
    
    console.log(`File downloaded: ${tempFilePath}`);
    
    // Step 2: Validate file format
    state.status = 'validating';
    state.progress = 20;
    
    await waitIfPaused(isPaused);
    if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
    
    const validationResult = await validateCSV({
      filePath: tempFilePath,
      expectedFormat: input.format,
      rules: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        requiredColumns: Object.keys(input.transformationRules.mapping),
        encoding: 'utf-8'
      }
    });
    
    if (!validationResult.isValid) {
      throw new ApplicationFailure(`Validation failed: ${validationResult.errors.join(', ')}`);
    }
    
    state.recordsTotal = validationResult.recordCount || 0;
    
    // Step 3: Parse data
    state.status = 'parsing';
    state.progress = 30;
    
    await waitIfPaused(isPaused);
    if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
    
    const parsedData = await parseCSVData({
      filePath: tempFilePath,
      format: input.format,
      options: {
        delimiter: ',',
        headers: true,
        skipEmptyRows: true
      }
    });
    
    console.log(`Parsed ${parsedData.records.length} records`);
    
    // Step 4: Transform data
    state.status = 'transforming';
    state.progress = 50;
    
    await waitIfPaused(isPaused);
    if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
    
    const transformedData = await transformData({
      data: parsedData.records,
      rules: input.transformationRules,
      options: {
        batchSize: 1000,
        parallel: true,
        errorHandling: 'skip' // 'skip' | 'fail' | 'default'
      }
    });
    
    state.recordsProcessed = transformedData.successCount;
    if (transformedData.errors.length > 0) {
      state.errors.push(...transformedData.errors.slice(0, 10)); // Keep first 10 errors
    }
    
    // Step 5: Enrich data (optional)
    if (input.enrichmentConfig) {
      state.status = 'enriching';
      state.progress = 65;
      
      await waitIfPaused(isPaused);
      if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
      
      const enrichedData = await enrichData({
        data: transformedData.data,
        config: input.enrichmentConfig,
        options: {
          cacheResults: true,
          retryFailedEnrichments: true,
          timeout: 30000
        }
      });
      
      transformedData.data = enrichedData.data;
      console.log(`Enriched ${enrichedData.enrichedCount} records`);
    }
    
    // Step 6: Validate transformed data
    state.progress = 75;
    
    await waitIfPaused(isPaused);
    if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
    
    const dataValidation = await validateTransformedData({
      data: transformedData.data,
      schema: {
        required: Object.values(input.transformationRules.mapping),
        types: {}, // Would be defined based on target schema
        constraints: {} // Business rules
      }
    });
    
    if (!dataValidation.isValid && dataValidation.criticalErrors > 0) {
      throw new ApplicationFailure(`Data validation failed: ${dataValidation.errors.join(', ')}`);
    }
    
    // Step 7: Store in database
    state.status = 'storing';
    state.progress = 85;
    
    await waitIfPaused(isPaused);
    if (shouldCancel) throw new ApplicationFailure('Pipeline cancelled');
    
    const storeResult = await storeInDatabase({
      data: transformedData.data,
      config: input.outputConfig,
      options: {
        batchSize: 500,
        upsert: true,
        transactional: true
      }
    });
    
    state.outputLocation = storeResult.location;
    console.log(`Stored ${storeResult.recordsInserted} records to ${storeResult.location}`);
    
    // Step 8: Generate report
    state.progress = 95;
    
    const report = await generateReport({
      pipelineId: info.workflowId,
      stats: {
        totalRecords: state.recordsTotal,
        processedRecords: state.recordsProcessed,
        failedRecords: state.recordsTotal - state.recordsProcessed,
        duration: Date.now() - state.startTime.getTime(),
        errors: state.errors
      },
      outputLocation: state.outputLocation || ''
    });
    
    // Step 9: Send notification
    state.progress = 99;
    
    await sendNotification({
      config: input.notificationConfig,
      message: {
        title: 'Data Pipeline Completed',
        body: `Successfully processed ${state.recordsProcessed} of ${state.recordsTotal} records`,
        details: {
          workflowId: info.workflowId,
          duration: Date.now() - state.startTime.getTime(),
          reportUrl: report.url
        }
      }
    });
    
    // Mark as completed
    state.status = 'completed';
    state.progress = 100;
    state.completionTime = new Date();
    
    // Cleanup
    if (tempFilePath) {
      await cleanupTempFiles({ paths: [tempFilePath] });
    }
    
    return {
      success: true,
      recordsProcessed: state.recordsProcessed,
      duration: Date.now() - state.startTime.getTime(),
      outputLocation: state.outputLocation || '',
      reportUrl: report.url,
      errors: state.errors.length > 0 ? state.errors : []
    };
    
  } catch (error) {
    state.status = 'failed';
    
    if (isCancellation(error)) {
      console.log('Pipeline was cancelled');
      state.errors.push('Pipeline cancelled by user');
    } else if (error instanceof Error) {
      console.error('Pipeline failed:', error.message);
      state.errors.push(error.message);
    }
    
    // Cleanup on failure
    if (tempFilePath) {
      try {
        await cleanupTempFiles({ paths: [tempFilePath] });
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }
    
    // Send failure notification
    try {
      await sendNotification({
        config: input.notificationConfig,
        message: {
          title: 'Data Pipeline Failed',
          body: `Pipeline failed: ${state.errors[state.errors.length - 1]}`,
          details: {
            workflowId: info.workflowId,
            errors: state.errors
          }
        }
      });
    } catch (notifyError) {
      console.error('Failed to send notification:', notifyError);
    }
    
    return {
      success: false,
      recordsProcessed: state.recordsProcessed,
      duration: Date.now() - state.startTime.getTime(),
      outputLocation: state.outputLocation || '',
      errors: state.errors
    };
  }
}

/**
 * Helper function to handle pausing
 */
async function waitIfPaused(isPaused: boolean): Promise<void> {
  while (isPaused) {
    await sleep('1s');
    await condition(() => !isPaused, '30s');
  }
}

/**
 * Batch processing workflow for large datasets
 */
export async function batchDataPipelineWorkflow(
  input: DataPipelineInput & { batchSize: number }
): Promise<DataPipelineResult> {
  // This would split the input into batches and process them in parallel
  // using child workflows
  const results: DataPipelineResult[] = [];
  
  // Implementation would go here
  // For now, delegate to single pipeline
  return dataPipelineWorkflow(input);
}