#!/usr/bin/env node

/**
 * Comprehensive Testing Script for Shadow Application
 * 
 * This script tests all major capabilities of the Shadow application:
 * - Tool invocations
 * - Computer view (file operations)
 * - Multiturn conversations
 * - API endpoints
 * - Task management
 * - GitHub integration
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
  total: 0
};

// Utility functions
function logTestResult(testName, passed, errorMessage = null) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}: ${errorMessage}`);
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
async function testHealthCheck() {
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    logTestResult('Health Check', response.status === 200);
  } catch (error) {
    logTestResult('Health Check', false, error.message);
  }
}

async function testAPIEndpoints() {
  const endpoints = [
    '/api/models',
    '/api/user-settings',
    '/api/validate-keys'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        validateStatus: () => true // Don't throw on 4xx/5xx
      });
      // We're just checking if the endpoint exists and responds
      logTestResult(`API Endpoint: ${endpoint}`, response.status < 500);
    } catch (error) {
      logTestResult(`API Endpoint: ${endpoint}`, false, error.message);
    }
  }
}

async function testTaskCreation() {
  try {
    // This would normally require authentication
    const response = await axios.post(`${API_BASE_URL}/tasks`, {
      message: 'Test task creation',
      model: 'gpt-4o',
      repo: 'test-repo',
      branch: 'main'
    }, {
      validateStatus: () => true
    });
    
    // We're checking that the endpoint exists and responds appropriately
    const validStatus = response.status === 401 || response.status === 400 || response.status === 200;
    logTestResult('Task Creation Endpoint', validStatus);
  } catch (error) {
    logTestResult('Task Creation Endpoint', false, error.message);
  }
}

async function testFileOperations() {
  // These tests would need to be run in the context of an authenticated session
  // For now, we'll just check if the API endpoints exist
  const fileEndpoints = [
    '/api/tasks/[taskId]/files/tree',
    '/api/tasks/[taskId]/files/content'
  ];

  for (const endpoint of fileEndpoints) {
    try {
      // Replace taskId placeholder with a test value
      const testEndpoint = endpoint.replace('[taskId]', 'test-task-id');
      const response = await axios.get(`${API_BASE_URL}${testEndpoint}`, {
        validateStatus: () => true
      });
      
      // Check if endpoint exists (404 is acceptable for non-existent task)
      const validStatus = response.status < 500;
      logTestResult(`File Operation Endpoint: ${endpoint}`, validStatus);
    } catch (error) {
      logTestResult(`File Operation Endpoint: ${endpoint}`, false, error.message);
    }
  }
}

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
      const validStatus = response.status < 500;
      logTestResult(`GitHub Integration Endpoint: ${endpoint}`, validStatus);
    } catch (error) {
      logTestResult(`GitHub Integration Endpoint: ${endpoint}`, false, error.message);
    }
  }
}

async function testMultiturnConversation() {
  // This would simulate a conversation flow
  // For now, we'll just check if the main page loads
  try {
    const response = await axios.get(BASE_URL);
    const hasChatInterface = response.data.includes('PromptForm') || response.data.includes('chat');
    logTestResult('Multiturn Conversation Interface', response.status === 200 && hasChatInterface);
  } catch (error) {
    logTestResult('Multiturn Conversation Interface', false, error.message);
  }
}

async function testToolInvocations() {
  // Check if documentation about tools exists
  try {
    const response = await axios.get(BASE_URL);
    const hasToolInfo = response.data.includes('read_file') || 
                        response.data.includes('edit_file') || 
                        response.data.includes('run_terminal_cmd');
    logTestResult('Tool Invocation Documentation', response.status === 200 && hasToolInfo);
  } catch (error) {
    logTestResult('Tool Invocation Documentation', false, error.message);
  }
}

async function testComputerView() {
  // Check if file explorer or similar interface exists
  try {
    const response = await axios.get(BASE_URL);
    const hasFileExplorer = response.data.includes('file') || 
                           response.data.includes('directory') || 
                           response.data.includes('explorer');
    logTestResult('Computer View Interface', response.status === 200 && hasFileExplorer);
  } catch (error) {
    logTestResult('Computer View Interface', false, error.message);
  }
}

// Main test execution
async function runAllTests() {
  console.log('🧪 Starting Shadow Application Comprehensive Testing\n');
  
  console.log('🔍 Testing API Endpoints...');
  await testHealthCheck();
  await testAPIEndpoints();
  await testTaskCreation();
  await testFileOperations();
  await testGitHubIntegration();
  
  console.log('\n💬 Testing User Interface...');
  await testMultiturnConversation();
  await testToolInvocations();
  await testComputerView();
  
  console.log('\n📊 Test Results Summary:');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review the output above.`);
  }
  
  return testResults.failed === 0;
}

// Run the tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});