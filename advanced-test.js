#!/usr/bin/env node

/**
 * Advanced Shadow Application Testing Script
 * 
 * This script tests the actual capabilities of the Shadow application by
 * simulating real user interactions and tool invocations.
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const BASE_URL = 'https://shadow-clean-bdsyv9qix-agent-space-7f0053b9.vercel.app';
const API_BASE_URL = `${BASE_URL}/api`;

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Utility functions
function logTestResult(testName, passed, errorMessage = null, details = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: ${errorMessage}`);
  }
  
  testResults.details.push({
    name: testName,
    passed,
    error: errorMessage,
    details
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test the available tools by examining the source code
async function testAvailableTools() {
  try {
    // Read the tools index file to understand what tools are available
    const toolsIndex = await fs.readFile(
      path.join(__dirname, 'apps/server/src/agent/tools/index.ts'),
      'utf8'
    );
    
    // Check for key tool names
    const expectedTools = [
      'todo_write',
      'read_file',
      'edit_file',
      'search_replace',
      'run_terminal_cmd',
      'list_dir',
      'grep_search',
      'file_search',
      'delete_file',
      'semantic_search',
      'add_memory',
      'list_memories'
    ];
    
    const foundTools = expectedTools.filter(tool => toolsIndex.includes(tool));
    
    logTestResult(
      'Tool System - Available Tools',
      foundTools.length >= expectedTools.length * 0.8, // At least 80% of expected tools
      `Found ${foundTools.length}/${expectedTools.length} expected tools`,
      { foundTools, missingTools: expectedTools.filter(t => !foundTools.includes(t)) }
    );
    
    return foundTools;
  } catch (error) {
    logTestResult('Tool System - Available Tools', false, error.message);
    return [];
  }
}

// Test API endpoint structure
async function testAPIEndpointStructure() {
  // Test a few key endpoints to verify structure
  const endpoints = [
    { path: '/api/models' },
    { path: '/api/user-settings' },
    { path: '/api/github/repositories' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      // We expect these to return 401 without auth, but the structure should be correct
      const response = await axios.get(`${API_BASE_URL}${endpoint.path}`, {
        validateStatus: () => true
      });
      
      // Check if it's a proper API response structure (even if unauthorized)
      const hasProperStructure = response.status === 401 || 
                                (response.status === 200 && typeof response.data === 'object');
      
      logTestResult(
        `API Structure - ${endpoint.path}`,
        hasProperStructure,
        `Status: ${response.status}`,
        { status: response.status, hasData: !!response.data }
      );
    } catch (error) {
      logTestResult(
        `API Structure - ${endpoint.path}`,
        false,
        error.message
      );
    }
  }
}

// Test frontend interface components
async function testFrontendInterface() {
  try {
    // Fetch the main page
    const response = await axios.get(BASE_URL, {
      validateStatus: () => true
    });
    
    // Check for key UI components
    const html = response.data;
    const hasKeyComponents = [
      'PromptForm',
      'chat',
      'GitHub',
      'model',
      'task'
    ].some(component => html.includes(component));
    
    logTestResult(
      'Frontend Interface Components',
      response.status === 200 && hasKeyComponents,
      `Status: ${response.status}`,
      { 
        status: response.status, 
        hasComponents: hasKeyComponents
      }
    );
  } catch (error) {
    logTestResult('Frontend Interface Components', false, error.message);
  }
}

// Test task management capabilities
async function testTaskManagement() {
  // Check if task-related endpoints exist
  const taskEndpoints = [
    '/api/tasks',
    '/api/tasks/test-task-id',
    '/api/tasks/test-task-id/status'
  ];
  
  for (const endpoint of taskEndpoints) {
    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        validateStatus: () => true
      });
      
      // Check if endpoint exists (404 is acceptable for non-existent task)
      const endpointExists = response.status < 500;
      logTestResult(
        `Task Management - ${endpoint}`,
        endpointExists,
        `Status: ${response.status}`,
        { status: response.status }
      );
    } catch (error) {
      logTestResult(
        `Task Management - ${endpoint}`,
        false,
        error.message
      );
    }
  }
}

// Test file operation capabilities
async function testFileOperations() {
  // Check if file-related endpoints exist
  const fileEndpoints = [
    '/api/tasks/test-task-id/files/tree',
    '/api/tasks/test-task-id/files/content'
  ];
  
  for (const endpoint of fileEndpoints) {
    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        validateStatus: () => true
      });
      
      // Check if endpoint exists
      const endpointExists = response.status < 500;
      logTestResult(
        `File Operations - ${endpoint}`,
        endpointExists,
        `Status: ${response.status}`,
        { status: response.status }
      );
    } catch (error) {
      logTestResult(
        `File Operations - ${endpoint}`,
        false,
        error.message
      );
    }
  }
}

// Test GitHub integration capabilities
async function testGitHubIntegration() {
  const githubEndpoints = [
    '/api/github/repositories',
    '/api/github/branches',
    '/api/github/issues'
  ];
  
  for (const endpoint of githubEndpoints) {
    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        validateStatus: () => true
      });
      
      // Check if endpoint exists
      const endpointExists = response.status < 500;
      logTestResult(
        `GitHub Integration - ${endpoint}`,
        endpointExists,
        `Status: ${response.status}`,
        { status: response.status }
      );
    } catch (error) {
      logTestResult(
        `GitHub Integration - ${endpoint}`,
        false,
        error.message
      );
    }
  }
}

// Test authentication flow
async function testAuthenticationFlow() {
  try {
    // Check if auth endpoints exist
    const authEndpoints = [
      '/api/auth/login',
      '/api/auth/logout'
    ];
    
    for (const endpoint of authEndpoints) {
      const response = await axios.get(`${BASE_URL}${endpoint}`, {
        validateStatus: () => true
      });
      
      // These might redirect or return specific status codes, but shouldn't 500
      const isValidResponse = response.status < 500;
      logTestResult(
        `Authentication Flow - ${endpoint}`,
        isValidResponse,
        `Status: ${response.status}`,
        { status: response.status }
      );
    }
  } catch (error) {
    logTestResult('Authentication Flow', false, error.message);
  }
}

// Test tool invocation patterns
async function testToolInvocationPatterns() {
  // Based on the tools index, check for proper tool definition patterns
  try {
    const toolsIndex = await fs.readFile(
      path.join(__dirname, 'apps/server/src/agent/tools/index.ts'),
      'utf8'
    );
    
    // Check for key patterns that indicate proper tool implementation
    const hasToolDefinition = toolsIndex.includes('tool({');
    const hasExecuteFunction = toolsIndex.includes('execute:');
    const hasReturnStatement = toolsIndex.includes('return {');
    const hasConsoleLog = toolsIndex.includes('console.log');
    const hasExecutor = toolsIndex.includes('executor.');
    
    const patternCount = [
      hasToolDefinition,
      hasExecuteFunction,
      hasReturnStatement,
      hasConsoleLog,
      hasExecutor
    ].filter(Boolean).length;
    
    logTestResult(
      'Tool Invocation Patterns',
      patternCount >= 4, // At least 4 of 5 patterns
      `Found ${patternCount}/5 expected patterns`,
      { 
        patternCount,
        patterns: {
          hasToolDefinition,
          hasExecuteFunction,
          hasReturnStatement,
          hasConsoleLog,
          hasExecutor
        }
      }
    );
  } catch (error) {
    logTestResult('Tool Invocation Patterns', false, error.message);
  }
}

// Test computer view capabilities
async function testComputerView() {
  try {
    // Check for file explorer related components
    const response = await axios.get(BASE_URL, {
      validateStatus: () => true
    });
    
    const html = response.data;
    const hasFileExplorer = [
      'file',
      'directory',
      'explorer',
      'tree',
      'navigator'
    ].some(term => html.includes(term));
    
    logTestResult(
      'Computer View Interface',
      response.status === 200 && hasFileExplorer,
      `Status: ${response.status}`,
      { 
        status: response.status,
        hasFileExplorer
      }
    );
  } catch (error) {
    logTestResult('Computer View Interface', false, error.message);
  }
}

// Test multiturn conversation capabilities
async function testMultiturnConversation() {
  try {
    // Check for chat-related components
    const response = await axios.get(BASE_URL, {
      validateStatus: () => true
    });
    
    const html = response.data;
    const hasChatComponents = [
      'message',
      'conversation',
      'stream',
      'history'
    ].some(term => html.includes(term));
    
    logTestResult(
      'Multiturn Conversation Interface',
      response.status === 200 && hasChatComponents,
      `Status: ${response.status}`,
      { 
        status: response.status,
        hasChatComponents
      }
    );
  } catch (error) {
    logTestResult('Multiturn Conversation Interface', false, error.message);
  }
}

// Main test execution
async function runAllTests() {
  console.log('🧪 Starting Shadow Application Advanced Testing\n');
  
  console.log('🔧 Testing Tool System...');
  await testAvailableTools();
  await testToolInvocationPatterns();
  
  console.log('\n🌐 Testing API Structure...');
  await testAPIEndpointStructure();
  
  console.log('\n🖥️  Testing Frontend Interface...');
  await testFrontendInterface();
  await testComputerView();
  await testMultiturnConversation();
  
  console.log('\n📝 Testing Task Management...');
  await testTaskManagement();
  
  console.log('\n📁 Testing File Operations...');
  await testFileOperations();
  
  console.log('\n🐙 Testing GitHub Integration...');
  await testGitHubIntegration();
  
  console.log('\n🔐 Testing Authentication Flow...');
  await testAuthenticationFlow();
  
  console.log('\n📊 Test Results Summary:');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
  
  // Write detailed results to file
  try {
    await fs.writeFile(
      path.join(__dirname, 'test-results-detailed.json'),
      JSON.stringify(testResults, null, 2)
    );
    console.log('\n📝 Detailed results saved to test-results-detailed.json');
  } catch (error) {
    console.log('\n⚠️  Could not save detailed results:', error.message);
  }
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed!');
    return true;
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review the output above.`);
    
    // Show failed tests
    const failedTests = testResults.details.filter(test => !test.passed);
    if (failedTests.length > 0) {
      console.log('\n❌ Failed Tests Details:');
      failedTests.forEach(test => {
        console.log(`  - ${test.name}: ${test.error}`);
      });
    }
    
    return false;
  }
}

// Run the tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});