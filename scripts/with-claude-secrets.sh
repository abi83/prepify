#!/usr/bin/env bash
# Claude Code's own scoped credentials only — currently just the Neon MCP key.
# Claude has no business holding DATABASE_URL_POOLING/DIRECT; use with-secrets.sh
# for those. Injected only into the child process this execs — never exported
# into the calling shell, never written to disk.
#
# Usage: scripts/with-claude-secrets.sh <command> [args...]
# Env:   PREPIFY_GCP_PROJECT (default: prepify-dev-vk)
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

project="${PREPIFY_GCP_PROJECT:-prepify-dev-vk}"

echo "Downloading Claude's scoped secrets from $project GCP project..." >&2

# Personal dev-scoped Neon API key for the Neon MCP server (mcp.neon.tech), dev only
# (google_secret_manager_secret.neon_dev_api_key in terraform/modules/environment/neon.tf —
# distinct from shared/secrets.tf's neon_api_key, the account-level bootstrap key for terraform-ci).
neon_key="$(gcloud secrets versions access latest --secret=neon-dev-api-key --project="$project")"

exec env "NEON_DEV_API_KEY=$neon_key" "$@"
