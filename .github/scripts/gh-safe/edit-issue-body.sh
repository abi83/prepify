#!/usr/bin/env bash
#
# Sets the body of the issue bound to the triggering event. Scoped so the
# agent can only rewrite the one issue that fired the workflow, not any
# issue number it might be tempted to pass.
#
# Usage: ./edit-issue-body.sh "<new body text>"

set -euo pipefail

ISSUE=$(jq -r '.issue.number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue number in event payload" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Error: expects exactly one argument, the new issue body" >&2
  exit 1
fi

gh issue edit "$ISSUE" --body "$1"
