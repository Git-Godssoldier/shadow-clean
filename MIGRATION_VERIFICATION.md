# Database Migration Verification

## Overview

The Shadow deployment includes a robust, non-interactive migration verification system that ensures database schema consistency before every deployment.

## Migration Verification Script

The `check-migrations.sh` script performs comprehensive database migration verification:

```bash
./check-migrations.sh
```

### What it does:
- ✅ Validates Prisma schema syntax
- ✅ Checks database connectivity
- ✅ Verifies migration status
- ✅ Generates non-interactive migration diffs
- ✅ Cleans up temporary migration files
- ✅ Runs completely non-interactively (CI/CD friendly)

## Integration with Deployment

The migration verification is automatically integrated into the deployment pipeline:

```bash
# Called automatically by auto-deploy.sh
verify_migrations() {
    log "Verifying local database migrations..."
    if ! ./check-migrations.sh; then
        error "Migration verification failed. Please fix migrations before deploying."
        exit 1
    fi
    log "Local database migration verification passed."
}
```

## Key Features

### Non-Interactive Operation
- Uses `--create-only` flag to prevent interactive prompts
- Automatically cleans up generated test migrations
- No user input required during CI/CD

### Comprehensive Validation
1. **Schema Validation**: Ensures Prisma schema is syntactically correct
2. **Database Connectivity**: Verifies connection to local database
3. **Migration Status**: Checks current migration state
4. **Diff Generation**: Creates SQL diff for schema changes

### Error Handling
- Clear error messages for common issues
- Graceful handling of missing migrations
- Proper cleanup of temporary files

## Usage in CI/CD

The script is designed for automated environments:

```yaml
# Example GitHub Actions usage
- name: Verify Database Migrations
  run: ./check-migrations.sh
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Local Development

For local development, ensure you have:

```bash
# Local PostgreSQL database
DATABASE_URL="postgresql://postgres:@localhost:5432/shadow?schema=public"

# Run verification
./check-migrations.sh
```

## Troubleshooting

### Common Issues

**Schema Validation Errors**:
- Check Prisma schema syntax in `packages/db/prisma/schema.prisma`
- Ensure all models and relationships are properly defined

**Database Connection Issues**:
- Verify PostgreSQL is running locally
- Check DATABASE_URL format and credentials
- Ensure database exists

**Migration Conflicts**:
- Review migration files in `packages/db/prisma/migrations/`
- Resolve any conflicting schema changes
- Run `npx prisma migrate reset` if needed (development only)

## Technical Implementation

The script uses these Prisma CLI commands:

```bash
# Schema validation
npx prisma validate --schema="$SCHEMA_PATH"

# Migration status check
npx prisma migrate status --schema="$SCHEMA_PATH"

# Non-interactive diff generation
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel="$SCHEMA_PATH" \
  --script \
  --output /dev/stdout
```

## Benefits

- **Prevents deployment failures** due to migration issues
- **Ensures schema consistency** across environments
- **Non-interactive operation** suitable for automated pipelines
- **Early error detection** before production deployment
- **Clean temporary file management** prevents repository pollution
