#!/bin/bash

# setup-production-env.sh
# Creates .env.production from .env.production.initial and adds K8s service account token

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[ENV-SETUP]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[ENV-SETUP]${NC} $1"
}

error() {
    echo -e "${RED}[ENV-SETUP]${NC} $1" >&2
    exit 1
}

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

log "Setting up production environment configuration..."
log "Project root: $PROJECT_ROOT"

# Validate that .env.production.initial exists
if [[ ! -f "$PROJECT_ROOT/.env.production.initial" ]]; then
    error ".env.production.initial not found in project root. This file is required for production deployment."
fi

log "Found .env.production.initial"

# Create .env.production from .env.production.initial
log "Creating .env.production from .env.production.initial..."
cp "$PROJECT_ROOT/.env.production.initial" "$PROJECT_ROOT/.env.production"

# Function to fetch K8s service account token
fetch_k8s_token() {
    log "Attempting to fetch K8s service account token..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        warn "kubectl not found - skipping K8s token fetch"
        warn "Remote mode may not work without this token"
        return 0
    fi
    
    # Check if the secret exists
    if ! kubectl get secret -n shadow-agents shadow-service-account-token &> /dev/null; then
        warn "K8s service account token secret not found"
        warn "Run deploy-remote-infrastructure.sh first for remote mode support"
        return 0
    fi
    
    # Fetch the token
    local k8s_token
    k8s_token=$(kubectl get secret -n shadow-agents shadow-service-account-token -o jsonpath='{.data.token}' | base64 -d)
    
    if [[ -n "$k8s_token" ]]; then
        log "K8s service account token fetched successfully"
        
        # Add the token to .env.production
        echo "K8S_SERVICE_ACCOUNT_TOKEN=$k8s_token" >> "$PROJECT_ROOT/.env.production"
        log "K8s token added to .env.production"
        return 0
    else
        warn "Failed to fetch K8s service account token"
        return 1
    fi
}

# Fetch K8s token and add to environment file
fetch_k8s_token

# Validate that required environment variables are present
log "Validating environment configuration..."

# List of required variables for basic functionality
REQUIRED_VARS=(
    "DATABASE_URL"
    "GITHUB_CLIENT_ID"
    "GITHUB_CLIENT_SECRET"
)

# Check each required variable
missing_vars=()
for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" "$PROJECT_ROOT/.env.production"; then
        missing_vars+=("$var")
    fi
done

# Report missing variables
if [[ ${#missing_vars[@]} -gt 0 ]]; then
    error "Missing required environment variables: ${missing_vars[*]}"
fi

# Optional variables (warn if missing but don't fail)
OPTIONAL_VARS=(
    "DIRECT_URL"
    "PINECONE_API_KEY"
    "PINECONE_INDEX_NAME"
    "GITHUB_WEBHOOK_SECRET"
)

missing_optional=()
for var in "${OPTIONAL_VARS[@]}"; do
    if ! grep -q "^${var}=" "$PROJECT_ROOT/.env.production"; then
        missing_optional+=("$var")
    fi
done

if [[ ${#missing_optional[@]} -gt 0 ]]; then
    warn "Optional environment variables not found: ${missing_optional[*]}"
    warn "Some features may not work without these variables"
fi

# Count total variables
total_vars=$(grep -c "^[A-Z_]*=" "$PROJECT_ROOT/.env.production" || echo "0")

log "Environment setup completed successfully!"
log "Total environment variables: $total_vars"

# Show a sample of what was created (without exposing sensitive values)
log "Preview of .env.production:"
while IFS='=' read -r key value; do
    if [[ $key =~ ^[A-Z_]+$ ]]; then
        # Show first 10 characters of value, then ... if longer
        if [[ ${#value} -gt 10 ]]; then
            preview_value="${value:0:10}..."
        else
            preview_value="$value"
        fi
        log "  $key=$preview_value"
    fi
done < <(head -10 "$PROJECT_ROOT/.env.production")

log "✅ .env.production is ready for deployment!"