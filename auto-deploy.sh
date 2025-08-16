#!/bin/bash

# Automated Shadow Deployment Script using Vercel and Railway CLIs
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

# Check if CLIs are installed
check_clis() {
    log "Checking CLI tools..."
    
    if ! command -v railway &> /dev/null; then
        error "Railway CLI not found. Install with: npm install -g @railway/cli"
    fi
    
    if ! command -v vercel &> /dev/null; then
        error "Vercel CLI not found. Install with: npm install -g vercel"
    fi
    
    log "All CLI tools found!"
}

# Authenticate with Railway
auth_railway() {
    log "Checking Railway authentication..."
    
    if ! railway whoami &> /dev/null; then
        log "Please authenticate with Railway..."
        railway login
    else
        log "Railway authentication verified"
    fi
}

# Authenticate with Vercel
auth_vercel() {
    log "Checking Vercel authentication..."
    
    if ! vercel whoami &> /dev/null; then
        log "Please authenticate with Vercel..."
        vercel login
    else
        log "Vercel authentication verified"
    fi
}

# Deploy to Railway
deploy_railway() {
    log "Deploying backend to Railway..."
    
    # Check if project is already linked
    if [ ! -f ".railway.json" ]; then
        log "Creating new Railway project..."
        railway init --name shadow-backend
    else
        log "Using existing Railway project"
    fi
    
    # Initial deploy to create the application service
    log "Performing initial deployment to Railway..."
    railway up --detach

    # Add PostgreSQL database after app service exists
    log "Ensuring PostgreSQL database exists..."
    railway add -d postgres || warn "Could not add PostgreSQL. It may already exist or another error occurred."

    # Link to the application service to set variables on it
    log "Linking to application service..."
    railway service shadow-backend

    # Set all environment variables including DATABASE_URL
    log "Setting environment variables..."
    railway variables \
        --set "NODE_ENV=production" \
        --set "AGENT_MODE=local" \
        --set "PORT=4000" \
        --set "GITHUB_CLIENT_ID=your_github_client_id_here" \
        --set "GITHUB_CLIENT_SECRET=your_github_client_secret_here" \
        --set "GITHUB_PERSONAL_TOKEN=your_github_personal_token_here" \
        --set "WORKSPACE_DIR=/app/workspace" \
        --set "SIDECAR_URL=http://localhost:3001" \
        --set "DATABASE_URL=${{Postgres.DATABASE_URL}}"

    # Redeploy with new variables
    log "Redeploying to Railway with new variables..."
    railway up --detach
    
    # Wait for deployment
    log "Waiting for deployment to complete..."
    sleep 30
    
    # Get the URL
    RAILWAY_URL=$(railway status --json 2>/dev/null | grep -o '"url":"[^"]*"' | cut -d'"' -f4 | head -1)
    
    if [ -n "$RAILWAY_URL" ]; then
        log "Railway deployment successful!"
        info "Backend URL: $RAILWAY_URL"
        echo "$RAILWAY_URL" > .railway-url
        return 0
    else
        # Fallback: get domain from railway domain command
        RAILWAY_DOMAIN=$(railway domain 2>/dev/null | head -1)
        if [ -n "$RAILWAY_DOMAIN" ]; then
            RAILWAY_URL="https://$RAILWAY_DOMAIN"
            log "Railway deployment successful!"
            info "Backend URL: $RAILWAY_URL"
            echo "$RAILWAY_URL" > .railway-url
            return 0
        else
            warn "Could not retrieve Railway URL automatically. Check Railway dashboard."
            return 1
        fi
    fi
}

# Deploy to Vercel
deploy_vercel() {
    log "Deploying frontend to Vercel..."
    
    cd apps/frontend
    
    # Get Railway URL for environment variable
    if [ -f "../../.railway-url" ]; then
        RAILWAY_URL=$(cat ../../.railway-url)
        log "Using Railway URL: $RAILWAY_URL"
    else
        warn "Railway URL not found. You'll need to set NEXT_PUBLIC_SERVER_URL manually."
        RAILWAY_URL="https://your-railway-app.railway.app"
    fi
    
    # Check if already linked to Vercel
    if [ ! -d ".vercel" ]; then
        log "Linking to Vercel project..."
        vercel link --yes
    fi
    
    # Set environment variables for this deployment
    log "Setting environment variables..."
    echo "NEXT_PUBLIC_SERVER_URL=$RAILWAY_URL" > .env.production
    echo "DATABASE_URL=\$RAILWAY_DATABASE_URL" >> .env.production
    echo "BETTER_AUTH_SECRET=your_better_auth_secret_here" >> .env.production
    echo "GITHUB_CLIENT_ID=your_github_client_id_here" >> .env.production
    echo "GITHUB_CLIENT_SECRET=your_github_client_secret_here" >> .env.production
    echo "GITHUB_PERSONAL_ACCESS_TOKEN=your_github_personal_access_token_here" >> .env.production
    
    # Deploy to production
    log "Deploying to Vercel..."
    VERCEL_URL=$(vercel --prod --yes 2>&1 | grep -o 'https://[^[:space:]]*' | tail -1)
    
    if [ -n "$VERCEL_URL" ]; then
        log "Vercel deployment successful!"
        info "Frontend URL: $VERCEL_URL"
        echo "$VERCEL_URL" > ../../.vercel-url
    else
        warn "Could not retrieve Vercel URL. Check Vercel dashboard."
    fi
    
    # Clean up
    rm -f .env.production
    cd ../..
}

# Verify database migrations locally
verify_migrations() {
    log "Verifying local database migrations..."
    if [ -f "./check-migrations.sh" ]; then
        if ! ./check-migrations.sh; then
            error "Database migration verification failed. Please check the logs above and resolve any issues before deploying."
        fi
        log "Local database migration verification passed."
    else
        warn "'check-migrations.sh' script not found. Skipping local migration verification."
    fi
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    if [ -f ".railway.json" ]; then
        log "Running migrations via Railway..."
        railway run npm run db:migrate:deploy || warn "Migration failed. You may need to run it manually."
    else
        warn "Railway not linked. Run migrations manually: railway run npm run db:migrate:deploy"
    fi
}

# Show deployment summary
show_summary() {
    log "🎉 Deployment completed!"
    echo ""
    info "=== Deployment Summary ==="
    
    if [ -f ".railway-url" ]; then
        info "Backend URL: $(cat .railway-url)"
    fi
    
    if [ -f ".vercel-url" ]; then
        info "Frontend URL: $(cat .vercel-url)"
    fi
    
    echo ""
    warn "Next steps:"
    echo "1. Update GitHub OAuth app with your Vercel URL:"
    if [ -f ".vercel-url" ]; then
        echo "   Homepage: $(cat .vercel-url)"
        echo "   Callback: $(cat .vercel-url)/api/auth/callback/github"
    else
        echo "   Check Vercel dashboard for your URL"
    fi
    echo "2. Test the deployment by visiting your frontend URL"
    echo "3. Check logs if anything isn't working:"
    echo "   - Railway: railway logs"
    echo "   - Vercel: vercel logs"
}

# Main deployment function
main() {
    log "Starting automated Shadow deployment..."
    
    check_clis
    verify_migrations
    
    echo ""
    echo "This will:"
    echo "1. Authenticate with Railway and Vercel"
    echo "2. Deploy backend to Railway (with PostgreSQL)"
    echo "3. Deploy frontend to Vercel"
    echo "4. Run database migrations on Railway"
    echo ""
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
    
    auth_railway
    auth_vercel
    
    deploy_railway
    deploy_vercel
    run_migrations
    
    show_summary
}

# Run main function
main "$@"