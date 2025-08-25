/**
 * Data Pipeline Example
 * Demonstrates real-world data processing workflow
 */

import { Connection, Client } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { dataPipelineWorkflow, batchDataPipelineWorkflow } from '../src/workflows/data-pipeline.workflow';
import * as dataPipelineActivities from '../src/activities/data-pipeline.activities';
import * as path from 'path';
import * as fs from 'fs/promises';

// Create sample CSV file for testing
async function createSampleCSV(): Promise<string> {
  const csvContent = `id,name,age,email,department,salary,hire_date
1,John Doe,30,john.doe@example.com,Engineering,75000,2020-01-15
2,Jane Smith,28,jane.smith@example.com,Marketing,65000,2019-06-20
3,Bob Johnson,35,bob.johnson@example.com,Sales,70000,2018-03-10
4,Alice Williams,32,alice.williams@example.com,Engineering,80000,2021-02-01
5,Charlie Brown,29,charlie.brown@example.com,HR,60000,2020-09-15
6,Diana Prince,31,diana.prince@example.com,Engineering,85000,2019-11-30
7,Eve Anderson,27,eve.anderson@example.com,Marketing,62000,2021-05-20
8,Frank Miller,33,frank.miller@example.com,Sales,72000,2018-08-25
9,Grace Lee,30,grace.lee@example.com,Engineering,78000,2020-04-10
10,Henry Wilson,34,henry.wilson@example.com,Operations,68000,2019-01-05`;

  const filePath = path.join('/tmp', `sample-data-${Date.now()}.csv`);
  await fs.writeFile(filePath, csvContent);
  console.log(`Created sample CSV file: ${filePath}`);
  return filePath;
}

// Run the data pipeline workflow
async function runDataPipeline() {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const client = new Client({
    connection,
    namespace: 'default'
  });

  // Create sample data file
  const sampleFile = await createSampleCSV();

  console.log('Starting data pipeline workflow...');
  
  const handle = await client.workflow.start(dataPipelineWorkflow, {
    taskQueue: 'data-pipeline-queue',
    workflowId: `data-pipeline-${Date.now()}`,
    args: [{
      fileUrl: `file://${sampleFile}`, // Using local file for testing
      format: 'csv',
      transformationRules: {
        mapping: {
          'id': 'employee_id',
          'name': 'full_name',
          'age': 'age',
          'email': 'email_address',
          'department': 'dept',
          'salary': 'annual_salary',
          'hire_date': 'start_date'
        },
        filters: [
          { field: 'dept', operator: 'equals', value: 'Engineering' }
        ],
        aggregations: [
          { field: 'annual_salary', operation: 'avg' }
        ]
      },
      enrichmentConfig: {
        apiEndpoint: 'https://api.example.com/employee-data',
        lookupTable: 'employee_details',
        joinKey: 'employee_id'
      },
      outputConfig: {
        database: 'analytics',
        table: 'employees_transformed',
        format: 'sql',
        partitionKey: 'dept'
      },
      notificationConfig: {
        email: 'admin@example.com',
        slack: '#data-pipeline-alerts',
        webhook: 'https://hooks.example.com/pipeline-complete'
      }
    }]
  });

  console.log(`Workflow started with ID: ${handle.workflowId}`);

  // Monitor progress
  const monitorProgress = setInterval(async () => {
    try {
      const state = await handle.query('getPipelineState');
      const progress = await handle.query('getProgress');
      console.log(`Status: ${state.status}, Progress: ${progress}%`);
      
      if (state.status === 'completed' || state.status === 'failed') {
        clearInterval(monitorProgress);
      }
    } catch (error) {
      console.error('Error querying workflow:', error);
    }
  }, 2000);

  // Wait for result
  const result = await handle.result();
  clearInterval(monitorProgress);
  
  console.log('Pipeline completed!');
  console.log('Result:', JSON.stringify(result, null, 2));

  // Query final state
  const finalState = await handle.query('getPipelineState');
  console.log('Final state:', JSON.stringify(finalState, null, 2));

  return result;
}

// Run worker for data pipeline
async function runDataPipelineWorker() {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'data-pipeline-queue',
    workflowsPath: path.resolve(__dirname, '../src/workflows'),
    activities: dataPipelineActivities
  });

  console.log('Data pipeline worker started, waiting for tasks...');
  await worker.run();
}

// Test pipeline control signals
async function testPipelineControl(workflowId: string) {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const client = new Client({
    connection,
    namespace: 'default'
  });

  const handle = client.workflow.getHandle(workflowId);

  console.log('Testing pipeline control signals...');

  // Pause pipeline
  console.log('Pausing pipeline...');
  await handle.signal('pausePipeline');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Resume pipeline
  console.log('Resuming pipeline...');
  await handle.signal('resumePipeline');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Query state
  const state = await handle.query('getPipelineState');
  console.log('Current state:', state);

  // Get errors
  const errors = await handle.query('getErrors');
  console.log('Errors:', errors);
}

// Main execution
if (require.main === module) {
  const mode = process.argv[2];
  
  if (mode === 'worker') {
    runDataPipelineWorker().catch(err => {
      console.error('Worker failed:', err);
      process.exit(1);
    });
  } else if (mode === 'client') {
    runDataPipeline()
      .then(() => {
        console.log('Data pipeline execution completed successfully');
        process.exit(0);
      })
      .catch(err => {
        console.error('Data pipeline execution failed:', err);
        process.exit(1);
      });
  } else if (mode === 'control') {
    const workflowId = process.argv[3];
    if (!workflowId) {
      console.error('Please provide workflow ID for control test');
      process.exit(1);
    }
    testPipelineControl(workflowId)
      .then(() => {
        console.log('Control test completed');
        process.exit(0);
      })
      .catch(err => {
        console.error('Control test failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  Start worker: ts-node data-pipeline-example.ts worker');
    console.log('  Run pipeline: ts-node data-pipeline-example.ts client');
    console.log('  Test control: ts-node data-pipeline-example.ts control <workflow-id>');
    process.exit(1);
  }
}

export { runDataPipeline, runDataPipelineWorker, testPipelineControl };