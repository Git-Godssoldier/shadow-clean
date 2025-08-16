#!/bin/bash

# Railway Deployment Setup Script for Shadow
# This script helps configure Railway environment variables and deployment

echo "🚀 Shadow Railway Deployment Setup"
echo "================================="

# Check if railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please run:"
    echo "railway login"
    exit 1
fi

echo "✅ Railway CLI found and authenticated"

# Create or link project
echo ""
echo "📋 Setting up Railway project..."
echo "Please follow these steps in the Railway web interface:"
echo ""
echo "1. Go to https://railway.app/dashboard"
echo "2. Click 'New Project'"
echo "3. Select 'Deploy from GitHub repo'"
echo "4. Choose your shadow-clean repository"
echo "5. Add PostgreSQL database service"
echo "6. Configure environment variables (see below)"
echo ""

# Environment variables template
echo "🔧 Required Environment Variables for Railway:"
echo "=============================================="
echo "NODE_ENV=production"
echo "AGENT_MODE=local"
echo "PORT=4000"
echo "WORKSPACE_DIR=/app/workspace"
echo "SIDECAR_URL=http://localhost:3001"
echo ""
echo "Required secrets (set these with your actual values):"
echo "GITHUB_CLIENT_ID=your_github_client_id_here"
echo "GITHUB_CLIENT_SECRET=your_github_client_secret_here"
echo "GITHUB_PERSONAL_TOKEN=your_github_personal_token_here"
echo "DATABASE_URL=\${{Postgres.DATABASE_URL}} # This will be auto-generated"
echo ""

# Build and deployment settings
echo "⚙️ Railway Build Configuration:"
echo "==============================="
echo "Build Command: npm install && npm run generate && npm run build"
echo "Start Command: npm run start:railway"
echo "Root Directory: / (leave as is)"
echo "Watch Paths: apps/server/**, apps/sidecar/**, packages/**"
echo ""

# Check if we can link to existing project
echo "🔗 If you already created the Railway project, you can link it now:"
echo "railway link [your-project-id]"
echo ""

echo "📝 Once linked, you can deploy with:"
echo "railway up"
echo ""

echo "🔍 Monitor deployment with:"
echo "railway logs"
echo "railway status"
echo ""

echo "✅ Setup script completed!"
echo "Next: Configure your Railway project using the information above"