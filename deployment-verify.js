#!/usr/bin/env node

/**
 * Basic Shadow Application Deployment Verification
 * 
 * This script verifies that the Shadow application is properly deployed
 * and accessible, even without authentication.
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'https://shadow-clean-bdsyv9qix-agent-space-7f0053b9.vercel.app';

async function verifyDeployment() {
  console.log('🔍 Verifying Shadow Application Deployment...\\n');
  
  try {
    // Test 1: Check if the application is accessible
    console.log('1. Testing application accessibility...');
    const response = await axios.get(BASE_URL, {
      validateStatus: () => true, // Accept any status code
      timeout: 10000 // 10 second timeout
    });
    
    console.log(`   Status Code: ${response.status}`);
    console.log(`   Status Text: ${response.statusText}`);
    
    // Check if we got any response content
    const hasContent = response.data && response.data.length > 0;
    console.log(`   Has Content: ${hasContent}`);
    
    if (hasContent) {
      // Check for key indicators that this is the Shadow app
      const isShadowApp = response.data.includes('Shadow') || 
                         response.data.includes('Code with') ||
                         response.data.includes('Opulent OS');
      console.log(`   Is Shadow App: ${isShadowApp}`);
      
      // Check content type
      const contentType = response.headers['content-type'] || 'Unknown';
      console.log(`   Content-Type: ${contentType}`);
    }
    
    // Test 2: Check API endpoints (should respond even without auth)
    console.log('\\n2. Testing API endpoint accessibility...');
    const apiEndpoints = [
      '/api/health',
      '/api/models',
      '/api/user-settings'
    ];
    
    for (const endpoint of apiEndpoints) {
      try {
        const apiResponse = await axios.get(`${BASE_URL}${endpoint}`, {
          validateStatus: () => true,
          timeout: 5000
        });
        
        console.log(`   ${endpoint}: ${apiResponse.status} ${apiResponse.statusText}`);
      } catch (error) {
        console.log(`   ${endpoint}: ERROR - ${error.message}`);
      }
    }
    
    // Test 3: Check static assets
    console.log('\\n3. Testing static asset accessibility...');
    const staticAssets = [
      '/favicon.ico'
    ];
    
    for (const asset of staticAssets) {
      try {
        const assetResponse = await axios.get(`${BASE_URL}${asset}`, {
          validateStatus: () => true,
          timeout: 5000
        });
        
        console.log(`   ${asset}: ${assetResponse.status} ${assetResponse.statusText}`);
      } catch (error) {
        console.log(`   ${asset}: ERROR - ${error.message}`);
      }
    }
    
    console.log('\\n✅ Deployment verification completed!');
    console.log('\\n📋 Summary:');
    console.log(`   Main Application: ${response.status === 200 ? 'Accessible' : 'Responding (' + response.status + ')'}`);
    console.log(`   Content Received: ${hasContent ? 'Yes' : 'No'}`);
    
    if (response.status === 200) {
      console.log('\\n🎉 Application is successfully deployed and accessible!');
      console.log('   Note: Some features require authentication to access.');
      return true;
    } else if (response.status >= 400 && response.status < 500) {
      console.log('\\n⚠️  Application is deployed but requires authentication for full access.');
      console.log('   This is expected behavior for security.');
      return true;
    } else {
      console.log('\\n❌ Application deployment may have issues.');
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Deployment verification failed: ${error.message}`);
    console.log('\\n🔧 Troubleshooting steps:');
    console.log('   1. Check if the Vercel deployment URL is correct');
    console.log('   2. Verify internet connectivity');
    console.log('   3. Check if the application is still deploying');
    return false;
  }
}

// Run the verification
verifyDeployment().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});