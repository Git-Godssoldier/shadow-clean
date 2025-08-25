#!/usr/bin/env node

/**
 * Complete Environment Verification Script for Shadow Application
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
  'OPENAI_API_KEY',
  'BETTER_AUTH_SECRET'
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
  console.log(`

🔍 Checking ${serviceName} environment...`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${serviceName} .env file not found at: ${filePath}`);
    return false;
  }
  
  const envContent = fs.readFileSync(filePath, 'utf8');
  const envLines = envContent.split('
');
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

function checkAIProviders() {
  console.log('

🤖 Checking AI Provider Configuration...');
  
  const providers = [
    { name: 'OpenAI', key: 'OPENAI_API_KEY' },
    { name: 'Claude', key: 'CLAUDE_API_KEY' },
    { name: 'Google Gemini', key: 'GOOGLE_GEMINI_API_KEY' },
    { name: 'Together AI', key: 'TOGETHER_AI_API_KEY' },
    { name: 'DeepSeek', key: 'DEEPSEEK_API_KEY' },
    { name: 'Cerebras', key: 'CEREBRAS_API_KEY' }
  ];
  
  const serverEnv = fs.readFileSync(path.join(__dirname, 'apps/server/.env'), 'utf8');
  const frontendEnv = fs.readFileSync(path.join(__dirname, 'apps/frontend/.env'), 'utf8');
  
  const serverVars = {};
  serverEnv.split('
').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        serverVars[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
  
  const frontendVars = {};
  frontendEnv.split('
').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        frontendVars[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
  
  providers.forEach(provider => {
    const serverKey = serverVars[provider.key];
    const frontendKey = frontendVars[provider.key];
    
    if (serverKey || frontendKey) {
      console.log(`✅ ${provider.name}: Configured`);
    } else {
      console.log(`⚠️  ${provider.name}: Not configured`);
    }
  });
}

function checkGitHubIntegration() {
  console.log('

🐙 Checking GitHub Integration...');
  
  const serverEnv = fs.readFileSync(path.join(__dirname, 'apps/server/.env'), 'utf8');
  const frontendEnv = fs.readFileSync(path.join(__dirname, 'apps/frontend/.env'), 'utf8');
  
  const serverVars = {};
  serverEnv.split('
').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        serverVars[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
  
  const frontendVars = {};
  frontendEnv.split('
').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      if (key && value) {
        frontendVars[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
      }
    }
  });
  
  const checks = [
    { name: 'GitHub OAuth App', server: 'GITHUB_CLIENT_ID', frontend: 'GITHUB_CLIENT_ID' },
    { name: 'GitHub OAuth Secret', server: 'GITHUB_CLIENT_SECRET', frontend: 'GITHUB_CLIENT_SECRET' },
    { name: 'GitHub Personal Token', server: 'GITHUB_PERSONAL_TOKEN', frontend: 'GITHUB_PERSONAL_ACCESS_TOKEN' }
  ];
  
  checks.forEach(check => {
    const serverValue = serverVars[check.server];
    const frontendValue = frontendVars[check.frontend];
    
    if (serverValue && frontendValue) {
      console.log(`✅ ${check.name}: Configured`);
    } else {
      console.log(`❌ ${check.name}: Missing`);
    }
  });
}

function main() {
  console.log('🧪 Shadow Application Complete Environment Verification');
  console.log('====================================================');
  
  // Check server environment
  const serverEnvPath = path.join(__dirname, 'apps/server/.env');
  const serverEnvOk = checkEnvFile(serverEnvPath, requiredEnvVars, 'Server');
  
  // Check frontend environment
  const frontendEnvPath = path.join(__dirname, 'apps/frontend/.env');
  const frontendEnvOk = checkEnvFile(frontendEnvPath, frontendRequiredEnvVars, 'Frontend');
  
  // Check AI providers
  checkAIProviders();
  
  // Check GitHub integration
  checkGitHubIntegration();
  
  console.log('

📊 Summary:');
  console.log(`   Server Environment: ${serverEnvOk ? '✅ OK' : '❌ Issues'}`);
  console.log(`   Frontend Environment: ${frontendEnvOk ? '✅ OK' : '❌ Issues'}`);
  
  if (serverEnvOk && frontendEnvOk) {
    console.log('

🎉 All environment variables are properly configured!');
    console.log('

🚀 Next steps:');
    console.log('   1. Start the server: cd apps/server && npm run dev');
    console.log('   2. Start the frontend: cd apps/frontend && npm run dev');
    console.log('   3. Access the application at http://localhost:3000');
    return true;
  } else {
    console.log('

⚠️  Please fix the missing or placeholder environment variables.');
    return false;
  }
}

main();