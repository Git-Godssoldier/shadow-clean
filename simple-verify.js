#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Shadow Application Environment Verification');
console.log('==============================================');

// Check if environment files exist
const serverEnvPath = path.join(__dirname, 'apps/server/.env');
const frontendEnvPath = path.join(__dirname, 'apps/frontend/.env');
const dbEnvPath = path.join(__dirname, 'packages/db/.env');

console.log('\n🔍 Checking environment files...');

if (fs.existsSync(serverEnvPath)) {
  console.log('✅ Server .env file exists');
} else {
  console.log('❌ Server .env file not found');
}

if (fs.existsSync(frontendEnvPath)) {
  console.log('✅ Frontend .env file exists');
} else {
  console.log('❌ Frontend .env file not found');
}

if (fs.existsSync(dbEnvPath)) {
  console.log('✅ Database .env file exists');
} else {
  console.log('❌ Database .env file not found');
}

// Check key variables
console.log('\n🔍 Checking key variables...');

try {
  const serverEnv = fs.readFileSync(serverEnvPath, 'utf8');
  if (serverEnv.includes('GITHUB_CLIENT_ID=')) {
    console.log('✅ GitHub Client ID is set');
  } else {
    console.log('❌ GitHub Client ID is not set correctly');
  }
  
  if (serverEnv.includes('GITHUB_CLIENT_SECRET=')) {
    console.log('✅ GitHub Client Secret is set');
  } else {
    console.log('❌ GitHub Client Secret is not set correctly');
  }
  
  if (serverEnv.includes('OPENAI_API_KEY=')) {
    console.log('✅ OpenAI API Key is set');
  } else {
    console.log('❌ OpenAI API Key is not set correctly');
  }
} catch (error) {
  console.log('❌ Error reading server .env file:', error.message);
}

try {
  const frontendEnv = fs.readFileSync(frontendEnvPath, 'utf8');
  if (frontendEnv.includes('GITHUB_CLIENT_ID=')) {
    console.log('✅ Frontend GitHub Client ID is set');
  } else {
    console.log('❌ Frontend GitHub Client ID is not set correctly');
  }
  
  if (frontendEnv.includes('OPENAI_API_KEY=')) {
    console.log('✅ Frontend OpenAI API Key is set');
  } else {
    console.log('❌ Frontend OpenAI API Key is not set correctly');
  }
} catch (error) {
  console.log('❌ Error reading frontend .env file:', error.message);
}

console.log('\n🎉 Environment setup verification complete!');
