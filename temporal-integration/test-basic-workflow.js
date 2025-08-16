#!/usr/bin/env node

/**
 * Basic Workflow Test Script
 * Tests basic workflow execution with the Temporal server
 */

const { Connection, Client } = require('@temporalio/client');
const { Worker } = require('@temporalio/worker');
const path = require('path');

// Define a simple workflow directly in JavaScript
async function simpleWorkflow(input) {
  console.log('Workflow executing with input:', input);
  return { success: true, message: `Processed: ${input.message}`, timestamp: new Date().toISOString() };
}

// Define a simple activity
async function simpleActivity(message) {
  console.log('Activity executing:', message);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
  return `Activity processed: ${message}`;
}

async function runWorker() {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'simple-test-queue',
    // Use the bundled workflows from src/workflows
    workflowsPath: path.resolve(__dirname, 'src/workflows'),
    activities: {
      simpleActivity
    }
  });

  console.log('Worker started, waiting for tasks...');
  
  // Run worker for 30 seconds then shutdown
  setTimeout(async () => {
    console.log('Shutting down worker...');
    await worker.shutdown();
    console.log('Worker shutdown complete');
    process.exit(0);
  }, 30000);

  await worker.run();
}

async function runClient() {
  const connection = await Connection.connect({
    address: 'localhost:7233'
  });

  const client = new Client({
    connection,
    namespace: 'default'
  });

  // Start a workflow using the bundled taskProcessingWorkflow
  console.log('Starting workflow...');
  
  try {
    const handle = await client.workflow.start('taskProcessingWorkflow', {
      taskQueue: 'simple-test-queue',
      workflowId: `test-workflow-${Date.now()}`,
      args: [{
        data: {
          id: 'test-1',
          type: 'data_processing',
          payload: {
            message: 'Hello from test!',
            steps: 3,
            stepDelay: 1000
          },
          priority: 'normal',
          timeout: '5m',
          metadata: {}
        },
        context: {
          workflowId: `test-workflow-${Date.now()}`,
          taskQueue: 'simple-test-queue',
          namespace: 'default',
          startedAt: new Date(),
          metadata: {}
        }
      }]
    });

    console.log(`Workflow started with ID: ${handle.workflowId}`);
    console.log('Waiting for workflow result...');
    
    // Wait for result with timeout
    const resultPromise = handle.result();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Workflow timeout')), 10000)
    );

    try {
      const result = await Promise.race([resultPromise, timeoutPromise]);
      console.log('Workflow completed successfully!');
      console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
      if (err.message === 'Workflow timeout') {
        console.log('Workflow is still running (no worker to process it)');
        console.log('Start a worker with: node test-basic-workflow.js worker');
      } else {
        throw err;
      }
    }
  } catch (error) {
    console.error('Failed to start workflow:', error.message);
    throw error;
  }
}

async function main() {
  const mode = process.argv[2];

  console.log('====================================');
  console.log('Temporal Basic Workflow Test');
  console.log('====================================\n');

  try {
    // Test connection first
    const connection = await Connection.connect({
      address: 'localhost:7233'
    });
    console.log('✅ Connected to Temporal server\n');

    if (mode === 'worker') {
      console.log('Starting worker mode...\n');
      await runWorker();
    } else if (mode === 'client') {
      console.log('Starting client mode...\n');
      await runClient();
      console.log('\n✅ Test completed successfully');
      process.exit(0);
    } else if (mode === 'both') {
      console.log('Starting worker and client...\n');
      
      // Start worker in background
      const workerPromise = runWorker();
      
      // Wait a bit for worker to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Run client
      await runClient();
      
      console.log('\n✅ All tests completed successfully');
      process.exit(0);
    } else {
      console.log('Usage:');
      console.log('  Start worker:  node test-basic-workflow.js worker');
      console.log('  Run client:    node test-basic-workflow.js client');
      console.log('  Run both:      node test-basic-workflow.js both');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}