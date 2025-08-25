#!/usr/bin/env bash
set -Eeuo pipefail

# --- Configuration / Paths ---
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRISMA_DIR="$ROOT_DIR/packages/db"
SCHEMA="$PRISMA_DIR/prisma/schema.prisma"

if [[ ! -f "$SCHEMA" ]]; then
  echo "[ERROR] Prisma schema not found at: $SCHEMA"
  exit 1
fi

# --- Environment ---
# Use a sensible local default; override by exporting DATABASE_URL/DIRECT_URL before calling this script.
: "${DATABASE_URL:=postgresql://$(whoami)@localhost:5432/shadow?schema=public}"
: "${DIRECT_URL:=$DATABASE_URL}"
export DATABASE_URL DIRECT_URL

echo "[MIGRATION] Starting database migration verification..."
echo "[MIGRATION] Using SCHEMA: $SCHEMA"
echo "[MIGRATION] Using DATABASE_URL: ${DATABASE_URL%%:*}:****@${DATABASE_URL#*@}" | sed 's/:\*\*\*\*@/:****@/'

# --- Ensure Prisma CLI is present (non-interactive) ---
pushd "$PRISMA_DIR" >/dev/null

# Prefer project-local prisma if present; fall back to npx without reinstalling every run
if ! npx --yes prisma --version >/dev/null 2>&1; then
  echo "[MIGRATION] Installing Prisma CLI..."
  npm i -D prisma >/dev/null 2>&1
fi

# 1) Static schema validation (NO DB required, NO prompts)
echo "[MIGRATION] Validating Prisma schema..."
npx --yes prisma validate --schema "$SCHEMA"

# 2) Connectivity status (DB required). If DB is down, warn but continue.
echo "[MIGRATION] Checking migration status (DB connectivity)..."
set +e
STATUS_OUT="$(npx --yes prisma migrate status --schema "$SCHEMA" 2>&1)"
STATUS_CODE=$?
set -e

if [[ $STATUS_CODE -ne 0 ]]; then
  echo "[WARNING] migrate status failed (likely DB not reachable yet)."
  echo "---------- migrate status output ----------"
  echo "$STATUS_OUT"
  echo "------------------------------------------"
else
  echo "[MIGRATION] migrate status succeeded."
  # Optional: summarize interesting lines
  echo "$STATUS_OUT" | awk 'NR<=40{print}'
fi

# 3) Non-interactive diff (NO DB when diffing from empty) — never blocks
# Exit codes: 0 = no diff, 2 = diff present, others = failure
echo "[MIGRATION] Computing non-interactive diff vs empty database..."
set +e
npx --yes prisma migrate diff \
  --from-empty \
  --to-schema-datamodel "$SCHEMA" \
  --script \
  --exit-code \
  > /tmp/prisma-diff.sql 2> /tmp/prisma-diff.err
DIFF_CODE=$?
set -e

if [[ $DIFF_CODE -eq 0 ]]; then
  echo "[SUCCESS] No changes relative to an empty database (no SQL would be generated)."
elif [[ $DIFF_CODE -eq 2 ]]; then
  echo "[INFO] Schema would produce migrations. Previewing first 50 lines of generated SQL:"
  head -n 50 /tmp/prisma-diff.sql
else
  echo "[ERROR] prisma migrate diff failed with code $DIFF_CODE"
  echo "--- stdout ---"; cat /tmp/prisma-diff.sql || true
  echo "--- stderr ---"; cat /tmp/prisma-diff.err || true
  exit $DIFF_CODE
fi

# 4) Optional: Prove create-only migration works non-interactively (then clean)
# Set VERIFY_CREATE_ONLY=1 to enable; default on (1). Set to 0 to skip.
: "${VERIFY_CREATE_ONLY:=1}"
if [[ "$VERIFY_CREATE_ONLY" == "1" ]]; then
  NAME="verify_init_$(date +%s)"
  echo "[MIGRATION] Generating a create-only migration non-interactively with name: $NAME"
  npx --yes prisma migrate dev \
    --schema "$SCHEMA" \
    --create-only \
    --name "$NAME" \
    --skip-generate

  # Clean up the generated folder so the working tree stays clean
  # Migration folders look like prisma/migrations/2025XXXXXX_<name>
  GEN_DIR="$(find "$PRISMA_DIR/prisma/migrations" -maxdepth 1 -type d -name "*_${NAME}" -print -quit || true)"
  if [[ -n "${GEN_DIR:-}" && -d "$GEN_DIR" ]]; then
    rm -rf "$GEN_DIR"
    echo "[MIGRATION] Cleaned up generated test migration: $GEN_DIR"
  else
    echo "[WARNING] Could not locate generated migration folder to clean up (ok if nothing was generated)."
  fi
fi

popd >/dev/null
echo "[SUCCESS] Migration verification completed without prompts."
