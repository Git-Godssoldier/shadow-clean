#!/bin/bash

# Quick CLI Deploy Script for Shadow
# Run this after authenticating with both Railway and Vercel

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check authentication
check_auth() {
    log "Checking authentication..."
    
    if ! railway whoami &> /dev/null; then
        error "Not authenticated with Railway. Run: railway login"
    fi
    
    if ! vercel whoami &> /dev/null; then
        error "Not authenticated with Vercel. Run: vercel login"
    fi
    
    log "Authentication verified!"
}

# Deploy to Railway
deploy_railway() {
    log "Deploying to Railway..."
    
    # Create and link project
    if [ ! -f ".railway.json" ]; then
        log "Creating Railway project..."
        railway init --name shadow-backend
        railway link
    fi
    
    # Add database
    log "Adding PostgreSQL..."
    railway add postgresql 2>/dev/null || log "PostgreSQL already exists"
    
    # Set environment variables in one command
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
        --skip-deploys
    
    # Deploy
    log "Deploying backend..."
    railway up
    
    # Get URL
    log "Getting Railway URL..."
    sleep 10  # Wait for deployment
    RAILWAY_URL=$(railway status --json 2>/dev/null | grep -o '"url":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$RAILWAY_URL" ]; then
        log "Backend deployed successfully!"
        info "Railway URL: $RAILWAY_URL"
        echo "$RAILWAY_URL" > .railway-url
    else
        warn "Could not get Railway URL automatically. Check Railway dashboard."
    fi
}

# Deploy to Vercel
deploy_vercel() {
    log "Deploying to Vercel..."
    
    cd apps/frontend
    
    # Link project
    if [ ! -d ".vercel" ]; then
        log "Linking Vercel project..."
        vercel link --yes
    fi
    
    # Get Railway URL
    RAILWAY_URL=""
    if [ -f "../../.railway-url" ]; then
        RAILWAY_URL=$(cat ../../.railway-url)
        log "Using Railway URL: $RAILWAY_URL"
    else
        warn "Railway URL not found. Please set manually in Vercel dashboard."
        RAILWAY_URL="https://your-railway-url.railway.app"
    fi
    
    # Set environment variables via CLI (this will prompt for values)
    log "Setting Vercel environment variables..."
    
    echo "$RAILWAY_URL" | vercel env add NEXT_PUBLIC_SERVER_URL production
    echo "postgresql://..." | vercel env add DATABASE_URL production  # User will need to update this
    echo "your_better_auth_secret_here" | vercel env add BETTER_AUTH_SECRET production
    echo "your_github_client_id_here" | vercel env add GITHUB_CLIENT_ID production
    echo "your_github_client_secret_here" | vercel env add GITHUB_CLIENT_SECRET production
    echo "your_github_personal_access_token_here" | vercel env add GITHUB_PERSONAL_ACCESS_TOKEN production
    
    # Deploy
    log "Deploying frontend..."
    VERCEL_OUTPUT=$(vercel --prod --yes)
    VERCEL_URL=$(echo "$VERCEL_OUTPUT" | grep -o 'https://[^[:space:]]*' | tail -1)
    
    if [ -n "$VERCEL_URL" ]; then
        log "Frontend deployed successfully!"
        info "Vercel URL: $VERCEL_URL"
        echo "$VERCEL_URL" > ../../.vercel-url
    fi
    
    cd ../..
}

# Run migrations
run_migrations() {
    log "Running database migrations..."
    railway run npm run db:migrate:deploy || warn "Migration may have failed. Check manually."
}

# Show summary
show_summary() {
    log "🎉 Deployment complete!"
    echo ""
    info "=== URLs ==="
    
    if [ -f ".railway-url" ]; then
        info "Backend:  $(cat .railway-url)"
    fi
    
    if [ -f ".vercel-url" ]; then
        info "Frontend: $(cat .vercel-url)"
    fi
    
    echo ""
    warn "Next steps:"
    echo "1. Update GitHub OAuth app callback URL"
    echo "2. Set correct DATABASE_URL in Vercel (copy from Railway)"
    echo "3. Test your deployment!"
}

# Main function
main() {
    log "Starting CLI deployment..."
    
    check_auth
    deploy_railway
    deploy_vercel
    run_migrations
    show_summary
}

main "$@"