setup() {
  load helpers
  setup_stubs
  export GITHUB_STEP_SUMMARY="$BATS_TEST_TMPDIR/summary.md"
  : >"$GITHUB_STEP_SUMMARY"
  EXEC="$BATS_TEST_TMPDIR/exec.json"
}

summary() { cat "$GITHUB_STEP_SUMMARY"; }

@test "coder: issue, round, PR outcome, checks, files, cost, final message" {
  echo '[{"type":"result","total_cost_usd":0.5,"num_turns":7,"result":"All steps done, opening the PR."}]' >"$EXEC"
  export STUB_ISSUE_TITLE="Add a widget"
  export STUB_PR_CHECKS='[{"name":"test","state":"SUCCESS"},{"name":"build","state":"SUCCESS"},{"name":"lint","state":"FAILURE"}]'
  export STUB_PR_FILES=$'src/a.ts\nsrc/b.ts\nsrc/c.ts'
  run "$PIPELINE_DIR/run-summary.sh" Coder "$EXEC" --issue 42 --pr 99 --round initial
  [ "$status" -eq 0 ]
  summary | grep -qF '## Coder run'
  summary | grep -qF '**Issue:** [#42](https://github.com/owner/repo/issues/42) — Add a widget'
  summary | grep -qF '**Round:** Initial implementation'
  summary | grep -qF '**Outcome:** PR opened — [#99](https://github.com/owner/repo/pull/99)'
  summary | grep -qF '**Checks:** test: SUCCESS, build: SUCCESS'
  summary | grep -qF '**Files changed:** 3'
  summary | grep -qF '**Cost:** $0.5000 · 7 turns'
  summary | grep -qF '> All steps done, opening the PR.'
}

@test "coder: no PR opened surfaces a blocked outcome without the log" {
  echo '[{"type":"result","result":"Could not push the branch: missing workflows permission."}]' >"$EXEC"
  run "$PIPELINE_DIR/run-summary.sh" Coder "$EXEC" --issue 42 --round initial
  [ "$status" -eq 0 ]
  summary | grep -qF '**Outcome:** ⚠️ No PR — see the final message below.'
  summary | grep -qF '> Could not push the branch: missing workflows permission.'
  ! summary | grep -q 'Files changed'
}

@test "coder: fix round shows the round number from prior changes-requested reviews" {
  echo '[{"type":"result"}]' >"$EXEC"
  export STUB_RC_COUNT=2
  run "$PIPELINE_DIR/run-summary.sh" Coder "$EXEC" --issue 42 --pr 99 --round fix
  [ "$status" -eq 0 ]
  summary | grep -qF '**Round:** Fix round 2'
  summary | grep -qF '**Outcome:** PR updated — [#99](https://github.com/owner/repo/pull/99)'
}

@test "review: approved verdict" {
  echo '[{"type":"result","total_cost_usd":0.1,"result":"Looks good, approving."}]' >"$EXEC"
  export STUB_PR_TITLE="feat: widget"
  export STUB_LAST_STATE="APPROVED"
  export STUB_RC_COUNT=0
  export REVIEWER_BOT="prepify-reviewer[bot]"
  run "$PIPELINE_DIR/run-summary.sh" Review "$EXEC" --pr 99 --issue 42
  [ "$status" -eq 0 ]
  summary | grep -qF '**PR:** [#99](https://github.com/owner/repo/pull/99) — feat: widget'
  summary | grep -qF '**Round:** initial review'
  summary | grep -qF '**Outcome:** ✅ Approved'
  summary | grep -qF '> Looks good, approving.'
}

@test "review: no verdict submitted" {
  echo '[{"type":"result","result":"Could not use the review tool, posting here."}]' >"$EXEC"
  export STUB_LAST_STATE=""
  export STUB_RC_COUNT=1
  run "$PIPELINE_DIR/run-summary.sh" Review "$EXEC" --pr 99
  [ "$status" -eq 0 ]
  summary | grep -qF '**Round:** re-review (after 1 changes-requested)'
  summary | grep -qF '**Outcome:** ⚠️ No verdict submitted — see the final message below.'
}

@test "refinement: body refined" {
  echo '[{"type":"result","total_cost_usd":0.02,"result":"Rewrote the body."}]' >"$EXEC"
  export STUB_ISSUE_TITLE="Vague idea"
  export STUB_ISSUE_LABELS="type:coding-task,status:refined"
  run "$PIPELINE_DIR/run-summary.sh" Refinement "$EXEC" --issue 7
  [ "$status" -eq 0 ]
  summary | grep -qF '## Refinement run'
  summary | grep -qF '**Outcome:** Body refined'
}

@test "refinement: stopped for clarification" {
  echo '[{"type":"result","result":"Need to know which API."}]' >"$EXEC"
  export STUB_ISSUE_LABELS="status:needs-attention"
  run "$PIPELINE_DIR/run-summary.sh" Refinement "$EXEC" --issue 7
  summary | grep -qF '**Outcome:** ⚠️ Stopped for clarification — see the final message below.'
}

@test "estimation: estimate posted with size label" {
  echo '[{"type":"result","total_cost_usd":0.03,"result":"SIZE: M"}]' >"$EXEC"
  export STUB_ISSUE_LABELS="type:coding-task,status:estimated,size:M"
  run "$PIPELINE_DIR/run-summary.sh" Estimation "$EXEC" --issue 7
  [ "$status" -eq 0 ]
  summary | grep -qF '**Outcome:** Estimate posted — `size:M`'
}

@test "missing execution file yields an unknown cost and a placeholder message" {
  run "$PIPELINE_DIR/run-summary.sh" Refinement /no/such/file --issue 7
  [ "$status" -eq 0 ]
  summary | grep -qF '**Cost:** $unknown'
  summary | grep -qF '> _No final message — the run produced no result output._'
}

@test "errors on an unknown phase" {
  echo '[]' >"$EXEC"
  run "$PIPELINE_DIR/run-summary.sh" Bogus "$EXEC" --issue 7
  [ "$status" -eq 1 ]
}
