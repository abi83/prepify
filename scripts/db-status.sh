#!/bin/bash
set -e

ENV_FILE="$(dirname "$0")/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

SUPABASE_DATABASE_PASSWORD=$(grep '^SUPABASE_DATABASE_PASSWORD=' "$ENV_FILE" | cut -d '=' -f2-)

if [ -z "$SUPABASE_DATABASE_PASSWORD" ]; then
  echo "Error: SUPABASE_DATABASE_PASSWORD not set in .env"
  exit 1
fi

DB_URL="postgresql://postgres:${SUPABASE_DATABASE_PASSWORD}@db.yyqhjsdgemtcbgjcwhvm.supabase.co:5432/postgres"

supabase migration list --db-url "$DB_URL"
