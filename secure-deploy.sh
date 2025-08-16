#!/bin/bash

# Secure Deployment Script for Shadow
# This script handles deployment to Vercel and Railway with proper secret management

# Exit on error
set -euo pipefail

# Default values
DRY_RUN=false
CHECK_ENV=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check if required environment variables are set
check_env_vars() {
    log "Checking environment variables..."
    
    local missing_vars=()
    
    # Check for required variables
    [[ -z "${NEXT_PUBLIC_SERVER_URL:-}" ]] && missing_vars+=("NEXT_PUBLIC_SERVER_URL")
    [[ -z "${DATABASE_URL:-}" ]] && missing_vars+=("DATABASE_URL")
    [[ -z "${GITHUB_CLIENT_ID:-}" ]] && missing_vars+=("GITHUB_CLIENT_ID")
    [[ -z "${GITHUB_CLIENT_SECRET:-}" ]] && missing_vars+=("GITHUB_CLIENT_SECRET")
    [[ -z "${BETTER_AUTH_SECRET:-}" ]] && missing_vars+=("BETTER_AUTH_SECRET")
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        if [ "$DRY_RUN" = true ]; then
            warn "The following environment variables would be required for a real deployment: ${missing_vars[*]}"
            warn "For dry-run, using placeholder values..."
            
            # Set default values for dry-run
            export NEXT_PUBLIC_SERVER_URL="${NEXT_PUBLIC_SERVER_URL:-https://shadow-backend.railway.app}"
            export DATABASE_URL="${DATABASE_URL:-postgresql://user:pass@host:5432/db}"
            export GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-github_client_id_dry_run}"
            export GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-github_client_secret_dry_run}"
            export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(openssl rand -hex 32)}"
            
            log "✅ Dry-run environment configured with placeholder values"
        else
            error "Missing required environment variables: ${missing_vars[*]}"
            exit 1
        fi
    else
        log "✅ All required environment variables are set"
    fi
}

# Check if required CLIs are installed
check_clis() {
    log "Checking for required CLI tools..."
    
    local missing_clis=()
    local cli_versions=()
    
    if command -v railway &> /dev/null; then
        cli_versions+=("✅ Railway CLI: $(railway --version 2>&1 | head -n 1)")
    else
        missing_clis+=("Railway CLI (install with: npm install -g @railway/cli)")
    fi
    
    if command -v vercel &> /dev/null; then
        cli_versions+=("✅ Vercel CLI: $(vercel --version)")
    else
        missing_clis+=("Vercel CLI (install with: npm install -g vercel)")
    fi
    
    if [ "$DRY_RUN" = false ] && [ ${#missing_clis[@]} -gt 0 ]; then
        error "Missing required CLI tools:"
        for cli in "${missing_clis[@]}"; do
            echo "  - $cli"
        done
        exit 1
    fi
    
    # Show installed versions
    for version in "${cli_versions[@]}"; do
        log "$version"
    done
}

# Authenticate with Railway
auth_railway() {
    if [ "$DRY_RUN" = true ]; then
        dry_run_info "Would authenticate with Railway"
        return 0
    fi
    
    log "Authenticating with Railway..."
    
    if ! railway whoami &> /dev/null; then
        log "Please authenticate with Railway..."
        railway login
    else
        log "✅ Already authenticated with Railway as: $(railway whoami 2>&1 | grep Email | cut -d' ' -f2)"
    fi
}

# Authenticate with Vercel
auth_vercel() {
    if [ "$DRY_RUN" = true ]; then
        dry_run_info "Would authenticate with Vercel"
        return 0
    fi
    
    log "Authenticating with Vercel..."
    
    if ! vercel whoami &> /dev/null; then
        log "Please authenticate with Vercel..."
        vercel login
    else
        log "✅ Already authenticated with Vercel as: $(vercel whoami)"
    fi
}

# Deploy backend to Railway
deploy_railway() {
    if [ "$DRY_RUN" = true ]; then
        dry_run_info "Would create/update Railway project 'shadow-backend'"
        dry_run_info "Would add PostgreSQL service"
        dry_run_info "Would set environment variables"
        dry_run_info "Would deploy backend to Railway"
        return 0
    fi
    
    log "Deploying backend to Railway..."
    
    # Link existing project or create new one
    if [[ ! -f ".railway.json" ]]; then
        log "Creating new Railway project..."
        railway project new shadow-backend
        railway link
    fi
    
    # Add PostgreSQL if not exists
    log "Ensuring PostgreSQL database exists..."
    if ! railway add postgresql 2>/dev/null; then
        log "ℹ️ PostgreSQL already exists or could not be added"
    fi
    
    # Set environment variables
    log "Setting environment variables..."
    railway variables set NODE_ENV=production \
        AGENT_MODE=remote \
        PORT=4000 \
        GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" \
        GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" \
        BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
        DATABASE_URL="$DATABASE_URL"
    
    # Deploy
    log "Starting deployment to Railway..."
    railway up --detach
    
    # Wait for deployment
    log "Waiting for deployment to complete (this may take a few minutes)..."
    sleep 30
    
    # Get the URL
    local railway_url
    railway_url=$(railway status --json 2>/dev/null | grep -o '"url":"[^"]*"' | cut -d'"' -f4 | head -1)
    
    # Fallback method if JSON parsing fails
    if [[ -z "$railway_url" ]]; then
        railway_url=$(railway status 2>/dev/null | grep -o 'https://[^ ]*' | head -1)
    fi
    
    if [[ -n "$railway_url" ]]; then
        log "✅ Backend deployment successful!"
        info "Backend URL: $railway_url"
        echo "$railway_url" > .railway-url
        export NEXT_PUBLIC_SERVER_URL="$railway_url"
    else
        warn "Could not retrieve Railway URL. Please check Railway dashboard."
        return 1
    fi
}

# Deploy frontend to Vercel
deploy_vercel() {
    if [ "$DRY_RUN" = true ]; then
        dry_run_info "Would deploy frontend to Vercel"
        dry_run_info "Would set frontend environment variables"
        return 0
    fi
    
    log "Deploying frontend to Vercel..."
    
    cd apps/frontend || error "Failed to change to frontend directory"
    
    # Create production environment file
    log "Configuring frontend environment..."
    cat > .env.production <<EOL
NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
NEXT_PUBLIC_VERCEL_ENV=production
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
EOL
    
    # Deploy to Vercel
    log "Starting deployment to Vercel..."
    local vercel_output
    vercel_output=$(vercel --prod --yes 2>&1 | tee /dev/tty)
    
    # Extract URL from output
    local vercel_url
    vercel_url=$(echo "$vercel_output" | grep -o 'https://[^[:space:]]*\.vercel\.app' | tail -1)
    
    if [[ -n "$vercel_url" ]]; then
        log "✅ Frontend deployment successful!"
        info "Frontend URL: $vercel_url"
        echo "$vercel_url" > ../../.vercel-url
    else
        warn "Could not retrieve Vercel URL from output. Please check Vercel dashboard."
    fi
    
    # Clean up
    rm -f .env.production
    cd ../..
}

# Run database migrations
run_migrations() {
    if [ "$DRY_RUN" = true ]; then
        dry_run_info "Would run database migrations"
        return 0
    fi
    
    log "Running database migrations..."
    
    if [[ -f ".railway.json" ]]; then
        log "Running migrations via Railway..."
        if railway run npm run db:migrate:deploy; then
            log "✅ Database migrations completed successfully"
        else
            warn "❌ Migration failed. You may need to run it manually."
            return 1
        fi
    else
        warn "❌ Railway not linked. Please run migrations manually."
        return 1
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --check-env)
                CHECK_ENV=true
                shift
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Check environment variables only
check_environment() {
    log "Checking environment configuration..."
    check_clis
    check_env_vars
    
    # Additional environment checks can be added here
    log "✅ Environment check completed successfully"
    exit 0
}

# Print dry-run information
dry_run_info() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN] $1${NC}"
    fi
}

# Main deployment function
main() {
    parse_args "$@"
    
    if [ "$CHECK_ENV" = true ]; then
        check_environment
    fi
    
    log "Starting secure deployment of Shadow..."
    if [ "$DRY_RUN" = true ]; then
        log "🚀 DRY RUN MODE - No changes will be made"
    fi
    
    # Check prerequisites
    check_clis
    check_env_vars
    
    # Show deployment plan
    echo -e "\n${BLUE}=== Deployment Plan ===${NC}"
    echo "1. Authenticate with Railway and Vercel"
    echo "2. Deploy backend to Railway (with PostgreSQL)"
    echo "3. Deploy frontend to Vercel"
    echo "4. Run database migrations"
    echo -e "${BLUE}======================${NC}"
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "\n${YELLOW}DRY RUN: The following actions would be performed:${NC}"
        echo "- Authenticate with Railway and Vercel"
        echo "- Create/update Railway project 'shadow-backend'"
        echo "- Add PostgreSQL service to Railway project"
        echo "- Set environment variables in Railway"
        echo "- Deploy backend to Railway"
        echo "- Deploy frontend to Vercel"
        echo "- Run database migrations"
        echo -e "\n${GREEN}✅ Dry run completed successfully. No changes were made.${NC}"
        exit 0
    fi
    
    read -p "Continue with deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Deployment cancelled"
        exit 0
    fi
    
    # Execute deployment steps
    log "🚀 Starting deployment process..."
    
    log "\n🔑 Step 1/4: Authenticating with Railway and Vercel"
    auth_railway
    auth_vercel
    
    log "\n🚂 Step 2/4: Deploying backend to Railway"
    deploy_railway
    
    log "\n🌐 Step 3/4: Deploying frontend to Vercel"
    deploy_vercel
    
    log "\n💾 Step 4/4: Running database migrations"
    run_migrations
    
    # Show deployment summary
    log "🎉 Deployment completed successfully!"
    echo -e "\n${GREEN}=== 🚀 Deployment Summary ===${NC}"
    
    # Get the frontend URL
    local frontend_url=""
    if [[ -f ".vercel-url" ]]; then
        frontend_url=$(cat .vercel-url)
    fi
    
    # Display backend URL
    if [[ -n "${NEXT_PUBLIC_SERVER_URL:-}" ]]; then
        info "🔧 Backend URL: ${NEXT_PUBLIC_SERVER_URL}"
    else
        warn "⚠️  Backend URL not set"
    fi
    
    # Display frontend URL
    if [[ -n "$frontend_url" ]]; then
        info "🌐 Frontend URL: $frontend_url"
    else
        warn "⚠️  Frontend URL not available"
    fi
    
    echo -e "\n${YELLOW}📝 Next steps:${NC}"
    
    # GitHub OAuth configuration
    if [[ -n "$frontend_url" ]]; then
        echo "1. Update GitHub OAuth app with these URLs:"
        echo "   - Homepage: $frontend_url"
        echo "   - Callback URL: $frontend_url/api/auth/callback/github"
    else
        echo "1. Update GitHub OAuth app with your Vercel URL"
    fi
    
    echo "2. Test the deployment by visiting your frontend URL"
    
    # Logs information
    echo -e "\n${YELLOW}🔍 Troubleshooting:${NC}"
    echo "- Check backend logs: ${GREEN}railway logs${NC}"
    echo "- Check frontend logs: ${GREEN}vercel logs${NC}"
    
    # Final success message
    echo -e "\n${GREEN}✅ Deployment completed!${NC} Your Shadow instance should now be up and running."
    
    if [[ -n "$frontend_url" ]]; then
        echo -e "\nOpen in your browser: ${BLUE}$frontend_url${NC}"
    fi
}

# Run main function
main "$@"
