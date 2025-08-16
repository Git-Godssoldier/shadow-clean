#!/bin/bash

# Shadow Project Deployment Readiness Verification Script
echo "🔍 Verifying Shadow Project Deployment Readiness..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track issues
ISSUES=0

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "✅ ${GREEN}$1 exists${NC}"
    else
        echo -e "❌ ${RED}$1 missing${NC}"
        ((ISSUES++))
    fi
}

# Function to check if file contains required content
check_content() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "✅ ${GREEN}$1 contains required content${NC}"
    else
        echo -e "❌ ${RED}$1 missing required content: $2${NC}"
        ((ISSUES++))
    fi
}

echo "📁 Checking Deployment Configuration Files..."
echo "--------------------------------------------"

# Check Railway configuration
check_file "railway.json"
check_file "railway.toml"
check_file "Dockerfile.railway"
check_file ".env.railway"

# Check Vercel configuration
check_file "apps/frontend/vercel.json"
check_file ".env.vercel"

# Check deployment guides
check_file "DEPLOYMENT_CHECKLIST.md"
check_file "QUICK_START_DEPLOY.md"

echo ""
echo "🔧 Checking Package Configuration..."
echo "------------------------------------"

# Check if SWC WASM fallback is installed
if grep -q "@next/swc-wasm-nodejs" apps/frontend/package.json; then
    echo -e "✅ ${GREEN}SWC WASM fallback configured${NC}"
else
    echo -e "⚠️ ${YELLOW}SWC WASM fallback not found (may cause build issues)${NC}"
fi

# Check Turbo configuration
check_file "turbo.json"

echo ""
echo "🗂️ Checking Project Structure..."
echo "--------------------------------"

# Check critical directories
if [ -d "apps/frontend" ]; then
    echo -e "✅ ${GREEN}Frontend app directory exists${NC}"
else
    echo -e "❌ ${RED}Frontend app directory missing${NC}"
    ((ISSUES++))
fi

if [ -d "apps/server" ]; then
    echo -e "✅ ${GREEN}Server app directory exists${NC}"
else
    echo -e "❌ ${RED}Server app directory missing${NC}"
    ((ISSUES++))
fi

if [ -d "apps/sidecar" ]; then
    echo -e "✅ ${GREEN}Sidecar app directory exists${NC}"
else
    echo -e "❌ ${RED}Sidecar app directory missing${NC}"
    ((ISSUES++))
fi

echo ""
echo "🔐 Checking Environment Variable Templates..."
echo "--------------------------------------------"

# Check Railway environment variables
check_content ".env.railway" "NODE_ENV=production"
check_content ".env.railway" "GITHUB_CLIENT_ID"
check_content ".env.railway" "DATABASE_URL"

# Check Vercel environment variables
check_content ".env.vercel" "NEXT_PUBLIC_SERVER_URL"
check_content ".env.vercel" "BETTER_AUTH_SECRET"

echo ""
echo "📝 Checking Git Status..."
echo "------------------------"

# Check if changes are committed
if git diff --quiet && git diff --staged --quiet; then
    echo -e "✅ ${GREEN}All changes committed${NC}"
else
    echo -e "⚠️ ${YELLOW}Uncommitted changes detected${NC}"
fi

# Check if on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ]; then
    echo -e "✅ ${GREEN}On main branch${NC}"
else
    echo -e "⚠️ ${YELLOW}Not on main branch (current: $BRANCH)${NC}"
fi

echo ""
echo "🎯 Final Assessment..."
echo "====================="

if [ $ISSUES -eq 0 ]; then
    echo -e "🎉 ${GREEN}DEPLOYMENT READY!${NC}"
    echo -e "✨ ${GREEN}All configuration files are present and properly configured.${NC}"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Follow QUICK_START_DEPLOY.md for rapid deployment"
    echo "2. Or use DEPLOYMENT_CHECKLIST.md for detailed step-by-step guide"
    echo ""
    echo "🌐 Deployment Targets:"
    echo "- Backend: Railway (with PostgreSQL)"
    echo "- Frontend: Vercel"
    echo "- Expected Cost: ~$5-15/month"
else
    echo -e "⚠️ ${YELLOW}ISSUES FOUND: $ISSUES${NC}"
    echo -e "🔧 ${YELLOW}Please address the issues above before deploying.${NC}"
fi

echo ""
echo "📚 Documentation Available:"
echo "- QUICK_START_DEPLOY.md - Fast deployment (15-20 min)"
echo "- DEPLOYMENT_CHECKLIST.md - Detailed guide with troubleshooting"
echo "- .env.railway & .env.vercel - Environment variable templates"