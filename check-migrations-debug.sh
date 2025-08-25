#!/bin/bash

# Check Database Migrations Script (DEBUG VERSION)
# This script verifies if database migrations can be applied

# Exit on error and print commands
set -euo pipefail
set -x

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[MIGRATION-DEBUG]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS-DEBUG]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING-DEBUG]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR-DEBUG]${NC} $1" >&2
    exit 1
}

# Check if required commands are available
check_commands() {
    log "Checking required commands..."
    local commands=("node" "npm" "psql")
    local missing=()
    
    for cmd in "${commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done
    
    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing required commands: ${missing[*]}"
    fi
    success "All required commands are available."
}

# Check database configuration
check_database_config() {
    log "Checking database configuration..."
    
    if [ -z "${DATABASE_URL:-}" ]; then
        warn "DATABASE_URL is not set. Using default local database."
        export DATABASE_URL="postgresql://$(whoami)@localhost:5432/shadow?schema=public"
    fi
    
    if [ -z "${DIRECT_URL:-}" ]; then
        export DIRECT_URL="$DATABASE_URL"
    fi
    
    log "Using DATABASE_URL: $(echo "$DATABASE_URL" | sed -E 's/:([^@]*)@/:****@/')"
    success "Database configuration checked."
}

# Check Prisma setup
check_prisma() {
    log "Checking Prisma setup..."
    
    if [ ! -d "packages/db" ]; then
        error "Database package not found at packages/db"
    fi
    
    cd packages/db || error "Failed to change to packages/db directory"
    
    if [ ! -f "prisma/schema.prisma" ]; then
        error "Prisma schema not found at packages/db/prisma/schema.prisma"
    fi
    
    if [ ! -d "node_modules" ]; then
        log "'node_modules' not found. Running 'npm install'. This may take a few minutes..."
        npm install
        log "'npm install' completed."
    fi
    
    if [ ! -f "node_modules/.bin/prisma" ]; then
        log "Prisma CLI not found. Installing 'prisma' package..."
        npm install prisma --save-dev
        log "'prisma' package installed."
    fi
    
    success "Prisma is properly configured."
}

# Check migration status
check_migration_status() {
    log "Checking migration status..."
    
    log "Attempting to connect to the database with psql..."
    if ! psql -h localhost -U "$(whoami)" -d shadow -c "SELECT 1;" &>/dev/null; then
        error "Cannot connect to the database using psql. Please ensure the database server is running and accessible."
    fi
    success "Successfully connected to the database with psql."
    
    log "Checking if migrations table exists..."
    local table_exists
    table_exists=$(psql -h localhost -U "$(whoami)" -d shadow -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations');" | tr -d '[:space:]' || echo 'f')
    
    if [ "$table_exists" = "f" ]; then
        warn "No migrations have been applied yet (_prisma_migrations table does not exist)."
        return 1
    fi
    success "Migrations table exists."
    
    log "Checking for pending migrations with 'prisma migrate status'..."
    local pending_migrations
    pending_migrations=$(npx prisma migrate status 2>&1)
    
    if echo "$pending_migrations" | grep -q "following migrations have not yet been applied"; then
        warn "There are pending migrations:"
        echo "$pending_migrations" | grep -A 10 "not yet been applied"
        return 1
    elif echo "$pending_migrations" | grep -q "Database schema is in sync with your migrations"; then
        success "Database is up to date with all migrations."
        return 0
    else
        warn "Could not determine migration status. Output:"
        echo "$pending_migrations"
        return 1
    fi
}

# Main function
main() {
    log "Starting database migration verification (DEBUG MODE)..."
    
    check_commands
    check_database_config
    check_prisma
    check_migration_status
    
    echo -e "\n${GREEN}✅ Migration verification completed!${NC}"
}

# Run main function
main
