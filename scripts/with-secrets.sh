#!/usr/bin/env bash
# App secrets only (what the Next.js app / Prisma CLI need to run). Fetched and
# injected only into the child process this execs — never exported into the
# calling shell, never written to disk. A sibling process (another terminal
# tab, an agent) never sees them.
#
# For Claude Code's own scoped credentials (Neon MCP), use with-claude-secrets.sh
# instead — Claude has no business holding app DB credentials it doesn't need.
#
# Usage: scripts/with-secrets.sh <command> [args...]
# Env:   PREPIFY_GCP_PROJECT (default: prepify-dev-vk)
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

project="${PREPIFY_GCP_PROJECT:-prepify-dev-vk}"

echo "Downloading secrets from $project GCP project..." >&2

secret() {
  gcloud secrets versions access latest --secret="$1" --project="$project"
}

env_vars=(
  "DATABASE_URL_POOLING=$(secret database-url-pooling)"
  "DATABASE_URL_DIRECT=$(secret database-url-direct)"
  "AUTH_SECRET=$(secret auth-secret)"
  "AUTH_GOOGLE_CLIENT_ID=$(secret auth-google-client-id)"
  "AUTH_GOOGLE_CLIENT_SECRET=$(secret auth-google-client-secret)"
  # Not a secret — deterministic from terraform/modules/environment/storage.tf.
  "GCS_BUCKET_NAME=${project}-storage"
)

exec env "${env_vars[@]}" "$@"
