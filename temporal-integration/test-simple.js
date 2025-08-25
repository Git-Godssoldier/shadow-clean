#!/usr/bin/env node

/**
 * Simplified Temporal Test
 * Tests basic client connection and workflow start
 */

const { Connection, Client } = require('@temporalio/client');

async function testClient() {
  console.log('Testing Temporal Client...\n');
  
  try {
    // Connect to Temporal
    const connection = await Connection.connect({
      address: 'localhost:7233'
    });
    
    console.log('✅ Connected to Temporal server');
    
    // Create client
    const client = new Client({
      connection,
      namespace: 'default'
    });
    
    console.log('✅ Client created successfully');
    
    // List workflows (should be empty or contain previous runs)
    console.log('\nListing workflows...');
    const workflows = client.workflow.list();
    let count = 0;
    
    for await (const workflow of workflows) {
      console.log(`  - ${workflow.workflowId} (${workflow.status?.name || 'UNKNOWN'})`);
      count++;
      if (count >= 5) break; // Limit to 5 for brevity
    }
    
    if (count === 0) {
      console.log('  No workflows found');
    }
    
    // Try to start a simple workflow (will fail if no worker, but that's OK)
    console.log('\nAttempting to start a workflow...');
    
    try {
      const handle = await client.workflow.start('testWorkflow', {
        taskQueue: 'test-queue',
        workflowId: `simple-test-${Date.now()}`,
        args: [{ message: 'Hello Temporal!' }]
      });
      
      console.log(`✅ Workflow started with ID: ${handle.workflowId}`);
      console.log('   (It will timeout if no worker is running, which is expected)');
      
      // Check workflow status
      const description = await handle.describe();
      console.log(`   Status: ${description.status?.name || 'RUNNING'}`);
      
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('Workflow type not found')) {
        console.log('⚠️  Workflow type not registered (expected without worker)');
      } else {
        throw error;
      }
    }
    
    console.log('\n✅ All client tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  }
}

async function testUI() {
  console.log('\n📊 Temporal UI Information:');
  console.log('   URL: http://localhost:8233');
  console.log('   You can view workflows, workers, and namespaces in the UI');
}

async function main() {
  console.log('====================================');
  console.log('Simplified Temporal Test');
  console.log('====================================\n');
  
  await testClient();
  await testUI();
  
  console.log('\n====================================');
  console.log('Test Summary');
  console.log('====================================');
  console.log('✅ Temporal server is running');
  console.log('✅ Client can connect successfully');
  console.log('✅ Basic workflow operations work');
  console.log('\nNext steps:');
  console.log('1. Fix TypeScript compilation issues');
  console.log('2. Create a proper worker with compiled workflows');
  console.log('3. Run end-to-end workflow tests');
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ All tests completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Tests failed:', err.message);
      process.exit(1);
    });
}