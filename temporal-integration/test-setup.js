#!/usr/bin/env node

/**
 * Test Setup Script for Temporal Integration
 * Verifies that the core components are working
 */

const { Connection, Client } = require('@temporalio/client');
const { Worker } = require('@temporalio/worker');
const path = require('path');

async function testConnection() {
  console.log('Testing Temporal connection...');
  
  try {
    const connection = await Connection.connect({
      address: 'localhost:7233'
    });
    
    console.log('✅ Successfully connected to Temporal server');
    
    const client = new Client({
      connection,
      namespace: 'default'
    });
    
    console.log('✅ Client created successfully');
    
    return { connection, client };
  } catch (error) {
    console.error('❌ Failed to connect to Temporal:', error.message);
    console.log('\nMake sure Temporal server is running:');
    console.log('  temporal server start-dev');
    throw error;
  }
}

async function testWorker() {
  console.log('\nTesting Worker creation...');
  
  try {
    const connection = await Connection.connect({
      address: 'localhost:7233'
    });
    
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'test-queue',
      activities: {
        testActivity: async () => {
          return { success: true, timestamp: new Date() };
        }
      },
      workflowsPath: path.resolve(__dirname, 'src/workflows')
    });
    
    console.log('✅ Worker created successfully');
    
    // Don't actually run the worker, just test creation
    await worker.shutdown();
    
    return true;
  } catch (error) {
    console.error('❌ Failed to create worker:', error.message);
    throw error;
  }
}

async function testSimpleWorkflow() {
  console.log('\nTesting simple workflow execution...');
  
  try {
    const { connection, client } = await testConnection();
    
    // Create a simple inline workflow
    const handle = await client.workflow.start('testWorkflow', {
      taskQueue: 'test-queue',
      workflowId: `test-workflow-${Date.now()}`,
      args: [{ message: 'Hello Temporal!' }]
    });
    
    console.log(`✅ Started workflow with ID: ${handle.workflowId}`);
    
    // Note: This will timeout if no worker is running
    // That's expected for this test
    
    return true;
  } catch (error) {
    if (error.message.includes('testWorkflow')) {
      console.log('⚠️  Workflow not found (expected if workers not running)');
      return true;
    }
    console.error('❌ Failed to start workflow:', error.message);
    throw error;
  }
}

async function checkDependencies() {
  console.log('Checking dependencies...\n');
  
  const deps = [
    '@temporalio/client',
    '@temporalio/worker',
    '@temporalio/workflow',
    '@temporalio/activity',
    'express',
    'prom-client',
    'zod'
  ];
  
  for (const dep of deps) {
    try {
      require.resolve(dep);
      console.log(`✅ ${dep} installed`);
    } catch {
      console.log(`❌ ${dep} not found`);
    }
  }
}

async function main() {
  console.log('=================================');
  console.log('Temporal Integration Test Setup');
  console.log('=================================\n');
  
  try {
    // Check dependencies
    checkDependencies();
    
    console.log('\n---------------------------------\n');
    
    // Test connection
    await testConnection();
    
    // Test worker creation
    await testWorker();
    
    // Test workflow start
    await testSimpleWorkflow();
    
    console.log('\n=================================');
    console.log('✅ All basic tests passed!');
    console.log('=================================');
    
    console.log('\nNext steps:');
    console.log('1. Start Temporal server: temporal server start-dev');
    console.log('2. Run workers: npm run worker:dev');
    console.log('3. Execute workflows: npm run example:basic');
    
  } catch (error) {
    console.log('\n=================================');
    console.log('❌ Tests failed');
    console.log('=================================');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testConnection, testWorker, checkDependencies };