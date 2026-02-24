# execute_workflow Explainer

I added a new tool called `execute_workflow` that lets the MCP server run multiple tool calls as one planned sequence instead of one-by-one ad hoc calls.

## What it does (simple)

Before:

- AI had to call tools step-by-step manually (`search_records`, then `create_record`, then `update_record`, etc.)
- Retries were risky (could duplicate writes)
- Hard to preview what would happen before changes

Now:

- You can send one payload with ordered steps
- You can run `dry_run: true` to preview/validate without writing anything
- You can add an `idempotency_key` so re-running the same workflow is safe and deterministic

## Why this matters

1. More reliable automation
   Multi-step CRM tasks are now structured and repeatable.

2. Safer writes
   `dry_run` gives a plan-first, execute-second flow.

3. Safer retries
   `idempotency_key` prevents accidental duplicate operations.

4. Better observability
   Response includes per-step status (`pending/completed/failed/skipped`) and a summary.

## How it works

1. Input validation
   Checks that `steps` exist, step count is within limit, and tools are valid.

2. Tool resolution
   Resolves aliases to canonical tool names and classifies steps as read/write.

3. Journal + fingerprint
   Creates a fingerprint of workflow payload; stores execution by `idempotency_key`.

4. Dry-run mode
   Returns a planned workflow result without executing steps.

5. Execution mode
   Runs steps in order via existing dispatcher, captures output preview/errors.

6. Error policy per step
   `on_error: "stop"` halts and marks remaining steps `skipped`.
   `on_error: "continue"` keeps going and returns `completed_with_errors` when any step fails.

## Phase 2: Compensation Rollback Hooks

The tool now supports optional compensation hooks for terminal failures:

- `rollback_on_failure` (default: `true`)
- Per-step `compensation` block with `tool` + `arguments`

Behavior:

- If a step fails with `on_error: "stop"`, the workflow enters failed state.
- Completed prior steps are rolled back in reverse order when compensation is defined.
- Rollback results are returned in `rollback.steps` with status per compensation step.

Limits:

- This is compensating rollback, not database transaction rollback.
- Atomic cross-tool transactions are not guaranteed.

## Key files

- Tool implementation: `src/handlers/tool-configs/universal/workflow-execute.ts`
- Universal registration: `src/handlers/tool-configs/universal/index.ts`
- Validator hook: `src/handlers/tool-configs/universal/validators/schema-validator.ts`
- Tests: `test/handlers/tool-configs/universal/workflow-execute.test.ts`
