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

database_url_pooling="$(secret database-url-pooling)"
database_url_direct="$(secret database-url-direct)"
auth_secret="$(secret auth-secret)"
auth_google_client_id="$(secret auth-google-client-id)"
auth_google_client_secret="$(secret auth-google-client-secret)"

env_vars=(
  "DATABASE_URL_POOLING=$database_url_pooling"
  "DATABASE_URL_DIRECT=$database_url_direct"
  "AUTH_SECRET=$auth_secret"
  "AUTH_GOOGLE_CLIENT_ID=$auth_google_client_id"
  "AUTH_GOOGLE_CLIENT_SECRET=$auth_google_client_secret"
  # Not a secret — deterministic from terraform/modules/environment/storage.tf.
  "GCS_BUCKET_NAME=${project}-storage"
)

exec env "${env_vars[@]}" "$@"
