#!/usr/bin/env bash
#
# Squashes the current branch to a single commit, then pushes it to
# origin. Takes no arguments — anything the model types after the script
# name is ignored, not passed through — and refuses to push a protected
# branch directly.
#
# This is the one Bash-invoked git operation that leaves the sandbox and
# reaches a shared remote. checkout/add/commit stay broadly allowed
# (sandbox-local, no external blast radius per this repo's own tool-
# access philosophy), but push needs a script precisely so that untrusted
# issue/review text in the prompt can't steer it into force-pushing over
# main via an injected instruction — no argument the model is tricked
# into typing (--force, a different remote, an explicit main:main refspec)
# has any effect, since none of it is read.
#
# Squash-then-guard, in that order:
#   - Squash merge-base(origin/main, HEAD)..HEAD into one commit. Matches
#     the repo's one-commit-per-PR convention and clears any workflow /
#     gh-safe edit that only existed on an intermediate commit.
#   - Then check the squashed commit's file list for `.github/workflows/`
#     or `.github/scripts/gh-safe/`. The coder pushes as GITHUB_TOKEN,
#     which GitHub forbids from touching workflow files (per-commit, so a
#     later revert doesn't help) — and gh-safe defines the coder's own
#     sandbox. If the net change really touches those paths, abort with a
#     message naming the files so the agent can drop those edits.
#
# Usage: run with no arguments from the branch you want pushed.

set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)

case "$BRANCH" in
  main|master)
    echo "Error: refusing to push $BRANCH directly" >&2
    exit 1
    ;;
esac

git fetch origin main --quiet
BASE=$(git merge-base origin/main HEAD)

if [ "$BASE" = "$(git rev-parse HEAD)" ]; then
  echo "Error: branch has no commits beyond origin/main — nothing to push" >&2
  exit 1
fi

MESSAGE=$(git log -1 --format=%B)
git reset --soft "$BASE"
git commit --quiet -m "$MESSAGE"

PROTECTED=$(git diff-tree --no-commit-id --name-only -r HEAD \
  | grep -E '^\.github/(workflows|scripts/gh-safe)/' || true)

if [ -n "$PROTECTED" ]; then
  echo "Error: the squashed commit modifies paths the coder must not touch:" >&2
  echo "$PROTECTED" | sed 's/^/  /' >&2
  echo >&2
  echo "These define the coder's own sandbox and GITHUB_TOKEN cannot push" >&2
  echo "workflow changes. Drop these edits from your branch and try again." >&2
  exit 1
fi

git push --force-with-lease -u origin "$BRANCH"
