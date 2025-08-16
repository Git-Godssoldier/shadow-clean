#!/bin/bash

# Quick Deploy Helper for Shadow
# This script prepares everything for deployment

echo "🚀 Shadow Quick Deploy Helper"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}✅ Project is ready for deployment!${NC}"
echo ""
echo "📋 Deployment Checklist:"
echo ""
echo "1. ${BLUE}Railway Backend:${NC}"
echo "   - Go to: https://railway.app"
echo "   - Create new project from GitHub"
echo "   - Add PostgreSQL database"
echo "   - Set environment variables from .env.railway"
echo "   - Deploy and get URL"
echo ""
echo "2. ${BLUE}Vercel Frontend:${NC}"
echo "   - Go to: https://vercel.com"
echo "   - Import GitHub repository"
echo "   - Root directory: apps/frontend"
echo "   - Add Railway URL to NEXT_PUBLIC_SERVER_URL"
echo "   - Deploy"
echo ""
echo "3. ${BLUE}Database:${NC}"
echo "   - Run: railway run npm run db:migrate:deploy"
echo ""
echo "4. ${BLUE}GitHub OAuth:${NC}"
echo "   - Update callback URL with Vercel URL"
echo ""
echo -e "${YELLOW}📖 Full guide: DEPLOY_NOW.md${NC}"
echo ""
echo "Would you like to:"
echo "1) Open deployment guide"
echo "2) Check build locally"
echo "3) View environment templates"
echo "4) Exit"
echo ""
read -p "Choose (1-4): " choice

case $choice in
    1)
        if command -v code &> /dev/null; then
            code DEPLOY_NOW.md
        elif command -v open &> /dev/null; then
            open DEPLOY_NOW.md
        else
            cat DEPLOY_NOW.md
        fi
        ;;
    2)
        echo "Testing build locally..."
        npm run build
        ;;
    3)
        echo ""
        echo "=== Railway Environment (.env.railway) ==="
        cat .env.railway
        echo ""
        echo "=== Vercel Environment (.env.vercel) ==="
        cat .env.vercel
        ;;
    4)
        echo "Good luck with your deployment! 🚀"
        ;;
    *)
        echo "Invalid choice"
        ;;
esac