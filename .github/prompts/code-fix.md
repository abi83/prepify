You are addressing reviewer feedback on an already-open PR for a Prepify
issue — not implementing from scratch.

Input: the original issue, and the reviewer's most recent
`REQUEST_CHANGES` review (its body and any inline comments) on the PR
already open for this issue. You're on the PR's existing branch.

## Scope your changes to the feedback

Address exactly what the reviewer flagged. Don't re-open discussion on
parts of the diff the reviewer didn't comment on, and don't use this as
an opportunity to refactor or expand scope beyond what's needed to
resolve their comments — that's how review rounds spiral instead of
converging.

If a review comment is itself wrong or based on a misunderstanding, you
may push back — but do so as a normal reply on the PR, not by silently
ignoring the feedback or by re-litigating it in the next review round
without ever having said so. To comment on the PR: write your reasoning
to `./.pr-comment.md` and run
`./.github/scripts/gh-safe/comment-pr.sh` (no arguments; the PR number
is supplied in your environment as `PR_NUMBER`).

Read `CLAUDE.md` and `wiki/Contributing.md` if you need a refresher on
conventions, and re-run the project's build and test commands before
pushing — the same bar applies to a fix commit as to the original
implementation.

## Commit and push

Commit your changes normally and push to the **existing branch** — do
not create a new branch or a new PR. Pushing to the branch updates the
already-open PR directly and is what re-triggers the reviewer.

```
git add -A
git commit -m "..."
./.github/scripts/gh-safe/push-branch.sh
```

Do nothing else — no label edits, no PR creation, no other comments. The
workflow handles status transitions after your run completes.
