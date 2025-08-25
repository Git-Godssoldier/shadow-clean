#!/bin/bash

# Verify Database Migrations Script
# This script checks if database migrations can be run successfully

# Exit on error
set -euo pipefail

# Set default database URLs if not provided
export DATABASE_URL=${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/shadow}
export DIRECT_URL=${DIRECT_URL:-$DATABASE_URL}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[MIGRATION]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

# Check if required commands are available
check_commands() {
    local required_commands=("node" "npm")
    local optional_commands=("psql")
    local missing=()
    
    # Check required commands
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done
    
    # Check optional commands
    local missing_optional=()
    for cmd in "${optional_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_optional+=("$cmd")
        fi
    done
    
    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing required commands: ${missing[*]}"
    fi
    
    if [ ${#missing_optional[@]} -gt 0 ]; then
        warn "Optional commands not found (some checks will be limited): ${missing_optional[*]}"
    fi
}

# Check if database is accessible
check_database_connection() {
    log "Checking database configuration..."
    
    if [ -z "${DATABASE_URL:-}" ]; then
        error "DATABASE_URL environment variable is not set"
    fi
    
    # Extract connection details from DATABASE_URL
    local db_user=$(echo "$DATABASE_URL" | sed -n 's/^postgres:\/\/\([^:]*\):.*/\1/p')
    local db_pass=$(echo "$DATABASE_URL" | sed -n 's/^postgres:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    local db_host=$(echo "$DATABASE_URL" | sed -n 's/^postgres:\/\/[^@]*@\([^:]*\).*/\1/p')
    local db_port=$(echo "$DATABASE_URL" | sed -n 's/^postgres:\/\/[^@]*@[^:]*:\([0-9]*\).*/\1/p')
    local db_name=$(echo "$DATABASE_URL" | sed -n 's/^postgres:\/\/[^@]*@[^/]*\/\([^?]*\).*/\1/p')
    
    if [ -z "$db_user" ] || [ -z "$db_pass" ] || [ -z "$db_host" ] || [ -z "$db_port" ] || [ -z "$db_name" ]; then
        error "Failed to parse DATABASE_URL. Format should be: postgres://user:password@host:port/dbname"
    fi
    
    # Only try to connect directly if psql is available
    if command -v psql &> /dev/null; then
        log "Testing database connection with psql..."
        if PGPASSWORD="$db_pass" psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" -c "SELECT 1" &> /dev/null; then
            success "Successfully connected to database using psql"
        else
            warn "Failed to connect to database using psql. Some checks will be limited."
        fi
    else
        success "Database configuration appears valid (psql not available for direct connection test)"
    fi
}

# Check if Prisma is properly configured
check_prisma() {
    log "Checking Prisma configuration..."
    
    if [ ! -f "package.json" ]; then
        error "package.json not found. Please run this script from the project root"
    fi
    
    # Look for Prisma schema in standard locations
    local prisma_schema_path=""
    local possible_paths=(
        "packages/db/prisma/schema.prisma"
        "prisma/schema.prisma"
        "apps/server/prisma/schema.prisma"
    )
    
    for path in "${possible_paths[@]}"; do
        if [ -f "$path" ]; then
            prisma_schema_path="$path"
            break
        fi
    done
    
    if [ -z "$prisma_schema_path" ]; then
        error "Prisma schema not found in any of the expected locations"
    fi
    
    log "Found Prisma schema at: $prisma_schema_path"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        log "node_modules not found. Installing dependencies..."
        npm install
    fi
    
    # Check if Prisma CLI is available
    if [ ! -f "node_modules/.bin/prisma" ] && [ ! -f "node_modules/.bin/prisma.cmd" ]; then
        log "Prisma CLI not found. Installing @prisma/cli..."
        npm install @prisma/cli --save-dev
    fi
    
    # Set PRISMA_SCHEMA_PATH environment variable for Prisma CLI
    export PRISMA_SCHEMA_PATH="$prisma_schema_path"
    
    # Set PRISMA_HIDE_UPDATE_MESSAGE to suppress update messages
    export PRISMA_HIDE_UPDATE_MESSAGE="1"
    
    success "Prisma is properly configured at $prisma_schema_path"
}

# Check if there are pending migrations
check_pending_migrations() {
    log "Checking for pending migrations..."
    
    # Create a temporary directory for migration output
    local temp_dir=$(mktemp -d)
    local output_file="$temp_dir/migration-status.txt"
    
    # Run prisma migrate status and capture output
    cd packages/db || error "Failed to change to packages/db directory"
    
    log "Running 'prisma migrate status' with DATABASE_URL and DIRECT_URL set"
    
    # Run with both DATABASE_URL and DIRECT_URL set to the same value
    local output
    output=$(npx prisma migrate status 2>&1) || true
    
    # Save the output for debugging
    echo "$output" > "$output_file"
    
    # Check for common success/error patterns
    if echo "$output" | grep -q "The following migrations have not yet been applied"; then
        warn "There are pending migrations that need to be applied"
        echo "$output" | grep -A 10 "not yet been applied"
        return 1
    elif echo "$output" | grep -q "Database schema is in sync with your migrations"; then
        success "Database is up to date with all migrations"
        return 0
    else
        warn "Could not determine migration status. Output saved to $output_file"
        echo "--- Migration Status Output ---"
        echo "$output"
        echo "-------------------------------"
        return 1
    fi
    
    # Clean up
    cd - > /dev/null
    rm -rf "$temp_dir"
}

# Try to apply migrations in dry-run mode
try_migrate() {
    log "Testing migrations (dry-run)..."
    
    cd packages/db || error "Failed to change to packages/db directory"
    
    log "Running 'prisma migrate dev --dry-run'..."
    
    # Run the migration in dry-run mode
    local output
    output=$(npx prisma migrate dev --dry-run 2>&1) || true
    
    # Check the output for success/error patterns
    if echo "$output" | grep -q "No pending migrations to apply"; then
        success "No pending migrations to apply"
        return 0
    elif echo "$output" | grep -q "The following migration(s) have been created and applied"; then
        success "Migrations can be applied successfully"
        return 0
    else
        warn "Could not determine migration status. Output:"
        echo "--- Migration Dry Run Output ---"
        echo "$output"
        echo "--------------------------------"
        return 1
    fi
    
    # Return to the original directory
    cd - > /dev/null
}

# Main function
main() {
    log "Starting database migration verification..."
    
    # Check prerequisites
    check_commands
    check_prisma
    
    # Check database connection
    check_database_connection
    
    # Check and test migrations
    check_pending_migrations || true  # Continue even if there are pending migrations
    try_migrate
    
    echo -e "\n${GREEN}✅ Migration verification completed successfully!${NC}"
    echo -e "\nNext steps:"
    echo "1. Run 'npx prisma migrate deploy' to apply pending migrations"
    echo "2. Check 'prisma/migrations' directory for migration files"
    echo "3. Review the migration SQL files if needed"
}

# Run main function
main
