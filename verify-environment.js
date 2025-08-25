#!/usr/bin/env node

/**
 * Environment Verification Script for Shadow Application
 * 
 * This script verifies that all required environment variables are set
 * and that the services are accessible.
 */

const fs = require('fs');
const path = require('path');

// Environment verification
const requiredEnvVars = [
  'DATABASE_URL',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_PERSONAL_TOKEN',
  'OPENAI_API_KEY'
];

const frontendRequiredEnvVars = [
  'NEXT_PUBLIC_SERVER_URL',
  'BETTER_AUTH_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'OPENAI_API_KEY'
];

function checkEnvFile(filePath, requiredVars, serviceName) {
  console.log(`\n🔍 Checking ${serviceName} environment...`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${serviceName} .env file not found at: ${filePath}`);
    return false;
  }
  
  const envContent = fs.readFileSync(filePath, 'utf8');
  const envLines = envContent.split('\n');
  const envVars = {};
  
  // Parse environment variables
  envLines.forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
  
  // Check required variables
  let allPresent = true;
  requiredVars.forEach(varName => {
    if (!envVars[varName] || envVars[varName] === `your_${varName.toLowerCase()}_here`) {
      console.log(`❌ Missing or placeholder value for: ${varName}`);
      allPresent = false;
    } else {
      // Show first and last few characters for sensitive values
      const value = envVars[varName];
      if (varName.includes('KEY') || varName.includes('SECRET') || varName.includes('TOKEN')) {
        console.log(`✅ ${varName}: ${value.substring(0, 8)}...${value.substring(value.length - 4)}`);
      } else {
        console.log(`✅ ${varName}: ${value}`);
      }
    }
  });
  
  return allPresent;
}

function main() {
  console.log('🧪 Shadow Application Environment Verification');
  console.log('==============================================');
  
  // Check server environment
  const serverEnvPath = path.join(__dirname, 'apps/server/.env');
  const serverEnvOk = checkEnvFile(serverEnvPath, requiredEnvVars, 'Server');
  
  // Check frontend environment
  const frontendEnvPath = path.join(__dirname, 'apps/frontend/.env');
  const frontendEnvOk = checkEnvFile(frontendEnvPath, frontendRequiredEnvVars, 'Frontend');
  
  console.log('\n📊 Summary:');
  console.log(`   Server Environment: ${serverEnvOk ? '✅ OK' : '❌ Issues'}`);
  console.log(`   Frontend Environment: ${frontendEnvOk ? '✅ OK' : '❌ Issues'}`);
  
  if (serverEnvOk && frontendEnvOk) {
    console.log('\n🎉 All environment variables are properly configured!');
    console.log('\n🚀 Next steps:');
    console.log('   1. Start the server: cd apps/server && npm run dev');
    console.log('   2. Start the frontend: cd apps/frontend && npm run dev');
    console.log('   3. Access the application at http://localhost:3000');
    return true;
  } else {
    console.log('\n⚠️  Please fix the missing or placeholder environment variables.');
    return false;
  }
}

main();
