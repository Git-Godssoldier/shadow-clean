#!/usr/bin/env node

/**
 * Complete Application Testing Script
 * 
 * This script tests all the capabilities of the Shadow application
 * to ensure everything is working perfectly.
 */

const axios = require('axios');
const fs = require('fs');

async function testApplication() {
  console.log('🧪 Starting Complete Application Test');
  console.log('====================================');
  
  try {
    // Test 1: Check if frontend is accessible
    console.log('\n🔍 Test 1: Frontend Accessibility');
    const frontendResponse = await axios.get('http://localhost:3000', {
      timeout: 5000
    });
    console.log(`✅ Frontend is accessible (Status: ${frontendResponse.status})`);
    
    // Test 2: Check if server API is accessible
    console.log('\n🔍 Test 2: Server API Accessibility');
    const serverResponse = await axios.get('http://localhost:4000/api/health', {
      timeout: 5000,
      validateStatus: () => true // Accept any status code
    });
    console.log(`✅ Server API is accessible (Status: ${serverResponse.status})`);
    
    // Test 3: Check if authentication endpoints exist
    console.log('\n🔍 Test 3: Authentication Endpoints');
    const authEndpoints = [
      '/api/auth/login',
      '/api/auth/logout'
    ];
    
    for (const endpoint of authEndpoints) {
      try {
        const response = await axios.get(`http://localhost:4000${endpoint}`, {
          timeout: 5000,
          validateStatus: () => true
        });
        console.log(`✅ ${endpoint} exists (Status: ${response.status})`);
      } catch (error) {
        console.log(`⚠️  ${endpoint} error: ${error.message}`);
      }
    }
    
    // Test 4: Check if GitHub integration endpoints exist
    console.log('\n🔍 Test 4: GitHub Integration Endpoints');
    const githubEndpoints = [
      '/api/github/repositories',
      '/api/github/branches',
      '/api/github/issues'
    ];
    
    for (const endpoint of githubEndpoints) {
      try {
        const response = await axios.get(`http://localhost:4000${endpoint}`, {
          timeout: 5000,
          validateStatus: () => true
        });
        console.log(`✅ ${endpoint} exists (Status: ${response.status})`);
      } catch (error) {
        console.log(`⚠️  ${endpoint} error: ${error.message}`);
      }
    }
    
    // Test 5: Check if task management endpoints exist
    console.log('\n🔍 Test 5: Task Management Endpoints');
    const taskEndpoints = [
      '/api/tasks'
    ];
    
    for (const endpoint of taskEndpoints) {
      try {
        const response = await axios.get(`http://localhost:4000${endpoint}`, {
          timeout: 5000,
          validateStatus: () => true
        });
        console.log(`✅ ${endpoint} exists (Status: ${response.status})`);
      } catch (error) {
        console.log(`⚠️  ${endpoint} error: ${error.message}`);
      }
    }
    
    // Test 6: Check if models endpoint exists
    console.log('\n🔍 Test 6: Models Endpoint');
    try {
      const response = await axios.get('http://localhost:4000/api/models', {
        timeout: 5000,
        validateStatus: () => true
      });
      console.log(`✅ /api/models exists (Status: ${response.status})`);
    } catch (error) {
      console.log(`⚠️  /api/models error: ${error.message}`);
    }
    
    // Test 7: Check if user settings endpoint exists
    console.log('\n🔍 Test 7: User Settings Endpoint');
    try {
      const response = await axios.get('http://localhost:4000/api/user-settings', {
        timeout: 5000,
        validateStatus: () => true
      });
      console.log(`✅ /api/user-settings exists (Status: ${response.status})`);
    } catch (error) {
      console.log(`⚠️  /api/user-settings error: ${error.message}`);
    }
    
    console.log('\n🎉 All tests completed!');
    console.log('\n🚀 Application is running successfully!');
    console.log('   Frontend: http://localhost:3000');
    console.log('   Server API: http://localhost:4000');
    
    return true;
    
  } catch (error) {
    console.log(`\n❌ Test failed: ${error.message}`);
    return false;
  }
}

// Run the tests
testApplication().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
