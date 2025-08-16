#!/bin/bash

# Shadow Deployment Script for Vercel + Railway
# This script helps deploy Shadow to Vercel (frontend) and Railway (backend)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[DEPLOY]${NC} $1"
}

error() {
    echo -e "${RED}[DEPLOY]${NC} $1"
    exit 1
}

info() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# Check if required CLIs are installed
check_requirements() {
    log "Checking requirements..."
    
    if ! command -v git &> /dev/null; then
        error "Git is not installed"
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
    fi
    
    log "All requirements met!"
}

# Install Vercel CLI if not present
install_vercel_cli() {
    if ! command -v vercel &> /dev/null; then
        log "Installing Vercel CLI..."
        npm install -g vercel
    else
        log "Vercel CLI already installed"
    fi
}

# Install Railway CLI if not present
install_railway_cli() {
    if ! command -v railway &> /dev/null; then
        log "Installing Railway CLI..."
        npm install -g @railway/cli
    else
        log "Railway CLI already installed"
    fi
}

# Build the project
build_project() {
    log "Building project..."
    npm install
    npm run generate
    npm run build
    log "Build completed successfully!"
}

# Deploy to Railway
deploy_railway() {
    log "Deploying backend to Railway..."
    
    if [ ! -f ".railway.json" ]; then
        warn "No Railway configuration found. Initializing..."
        railway login
        railway link
    fi
    
    info "Pushing to Railway..."
    railway up
    
    # Get the deployment URL
    RAILWAY_URL=$(railway status --json | grep -o '"url":"[^"]*' | grep -o '[^"]*$' | head -1)
    
    if [ -n "$RAILWAY_URL" ]; then
        log "Railway deployment successful!"
        info "Backend URL: https://$RAILWAY_URL"
        echo "https://$RAILWAY_URL" > .railway-url
    else
        warn "Could not retrieve Railway URL. Check Railway dashboard."
    fi
}

# Deploy to Vercel
deploy_vercel() {
    log "Deploying frontend to Vercel..."
    
    cd apps/frontend
    
    # Check if already linked to Vercel
    if [ ! -d ".vercel" ]; then
        log "Linking to Vercel project..."
        vercel link
    fi
    
    # Deploy to production
    vercel --prod
    
    cd ../..
    
    log "Vercel deployment successful!"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    if command -v railway &> /dev/null; then
        log "Using Railway CLI for migrations..."
        railway run npm run db:migrate:deploy
    else
        warn "Railway CLI not found. Please run migrations manually:"
        info "railway run npm run db:migrate:deploy"
    fi
}

# Main deployment flow
main() {
    log "Starting Shadow deployment to Vercel + Railway..."
    
    check_requirements
    
    # Ask user what they want to deploy
    echo ""
    echo "What would you like to deploy?"
    echo "1) Everything (Backend + Frontend + Database)"
    echo "2) Backend only (Railway)"
    echo "3) Frontend only (Vercel)"
    echo "4) Run database migrations only"
    echo ""
    read -p "Enter your choice (1-4): " choice
    
    case $choice in
        1)
            install_railway_cli
            install_vercel_cli
            build_project
            deploy_railway
            deploy_vercel
            run_migrations
            ;;
        2)
            install_railway_cli
            build_project
            deploy_railway
            ;;
        3)
            install_vercel_cli
            build_project
            deploy_vercel
            ;;
        4)
            install_railway_cli
            run_migrations
            ;;
        *)
            error "Invalid choice"
            ;;
    esac
    
    log "🎉 Deployment completed!"
    
    # Show summary
    echo ""
    info "=== Deployment Summary ==="
    
    if [ -f ".railway-url" ]; then
        info "Backend URL: $(cat .railway-url)"
    fi
    
    if [ -d "apps/frontend/.vercel" ]; then
        info "Frontend: Check Vercel dashboard for URL"
    fi
    
    echo ""
    warn "Next steps:"
    echo "1. Update GitHub OAuth app with production URLs"
    echo "2. Set environment variables in Vercel and Railway dashboards"
    echo "3. Configure custom domains (optional)"
    echo "4. Test the deployment thoroughly"
}

# Run main function
main "$@"