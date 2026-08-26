#!/usr/bin/env bash
#
# Pushes the current branch to origin. Takes no arguments — anything the
# model types after the script name is ignored, not passed through — and
# refuses to push a protected branch directly.
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
# Usage: run with no arguments from the branch you want pushed.

set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)

case "$BRANCH" in
  main|master)
    echo "Error: refusing to push $BRANCH directly" >&2
    exit 1
    ;;
esac

git push -u origin "$BRANCH"
