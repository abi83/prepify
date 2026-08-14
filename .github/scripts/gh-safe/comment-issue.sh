#!/usr/bin/env bash
#
# Posts a comment on the issue bound to the triggering event.
#
# Usage: ./comment-issue.sh "<comment body>"

set -euo pipefail

ISSUE=$(jq -r '.issue.number // .inputs.issue_number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue number in event payload" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Error: expects exactly one argument, the comment body" >&2
  exit 1
fi

gh issue comment "$ISSUE" --body "$1"
