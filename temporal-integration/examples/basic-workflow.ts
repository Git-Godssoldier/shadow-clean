/**
 * Basic Workflow Example
 * Demonstrates simple workflow execution with activities
 */

import { Connection, Client } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { taskProcessingWorkflow } from '../src/workflows/task-processing.workflow';
import * as activities from '../src/activities';

async function runBasicWorkflow() {
  // 1. Connect to Temporal server
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  // 2. Create a client
  const client = new Client({
    connection,
    namespace: 'default'
  });

  // 3. Start a workflow
  console.log('Starting basic workflow...');
  
  const handle = await client.workflow.start(taskProcessingWorkflow, {
    taskQueue: 'basic-task-queue',
    workflowId: `basic-workflow-${Date.now()}`,
    args: [{
      data: {
        id: 'task-001',
        type: 'data_processing',
        payload: {
          message: 'Hello Temporal!',
          steps: 3,
          stepDelay: 1000
        },
        priority: 'normal',
        timeout: '5m',
        metadata: {
          source: 'example',
          timestamp: new Date().toISOString()
        }
      },
      context: {
        workflowId: `basic-workflow-${Date.now()}`,
        taskQueue: 'basic-task-queue',
        namespace: 'default',
        startedAt: new Date(),
        metadata: {}
      }
    }]
  });

  console.log(`Workflow started with ID: ${handle.workflowId}`);

  // 4. Wait for result
  const result = await handle.result();
  console.log('Workflow completed with result:', result);

  // 5. Query workflow state (optional)
  const state = await handle.query('getWorkflowState');
  console.log('Final workflow state:', state);
}

async function runWorker() {
  // Create a worker to process the workflow
  const worker = await Worker.create({
    connection: await Connection.connect({
      address: 'localhost:7233'
    }),
    namespace: 'default',
    taskQueue: 'basic-task-queue',
    workflowsPath: require.resolve('../src/workflows'),
    activities
  });

  console.log('Worker started, waiting for tasks...');
  await worker.run();
}

// Main execution
if (require.main === module) {
  // Check command line argument
  const mode = process.argv[2];
  
  if (mode === 'worker') {
    runWorker().catch(err => {
      console.error('Worker failed:', err);
      process.exit(1);
    });
  } else if (mode === 'client') {
    runBasicWorkflow()
      .then(() => {
        console.log('Workflow execution completed successfully');
        process.exit(0);
      })
      .catch(err => {
        console.error('Workflow execution failed:', err);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  Start worker: ts-node basic-workflow.ts worker');
    console.log('  Run workflow: ts-node basic-workflow.ts client');
    process.exit(1);
  }
}

export { runBasicWorkflow, runWorker };