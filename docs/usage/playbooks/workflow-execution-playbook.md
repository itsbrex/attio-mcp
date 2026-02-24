# Workflow Execution Playbook

Use `execute_workflow` when you need deterministic multi-step orchestration with:

- `dry_run` planning before writes
- idempotent retries via `idempotency_key`
- step-by-step execution status in one response
- optional compensation rollback hooks (Phase 2)

## Quick Pattern

```json
{
  "idempotency_key": "lead-onboarding-acme-2026-02-24",
  "dry_run": true,
  "steps": [
    {
      "id": "search-company",
      "tool": "search_records",
      "arguments": {
        "resource_type": "companies",
        "query": "Acme Inc",
        "limit": 1
      }
    },
    {
      "id": "create-followup-task",
      "tool": "create_record",
      "arguments": {
        "resource_type": "tasks",
        "record_data": {
          "title": "Follow up with Acme",
          "content": "Send pricing and schedule demo"
        }
      }
    }
  ]
}
```

Then execute with the same payload and `dry_run=false`.

## On-Error Behavior

- `on_error: "stop"` (default): fail fast, remaining steps are marked `skipped`
- `on_error: "continue"`: keep running and return `completed_with_errors` when any step fails

## Phase 2: Compensation Rollback

Add:

- `rollback_on_failure` at workflow level (default `true`)
- `compensation` per step (optional)

When a stop-failure happens, completed prior steps are compensated in reverse order.

Example snippet:

```json
{
  "rollback_on_failure": true,
  "steps": [
    {
      "tool": "update_record",
      "arguments": {
        "resource_type": "locations",
        "record_id": "<location_record_id>",
        "record_data": { "market": "Orange County" }
      },
      "compensation": {
        "tool": "update_record",
        "arguments": {
          "resource_type": "locations",
          "record_id": "<location_record_id>",
          "record_data": { "market": "Old Market Value" }
        }
      }
    }
  ]
}
```

Compensation is best-effort and not a database transaction.

## Operational Guidance

- Keep workflows at 25 steps or fewer
- Use a stable `idempotency_key` for safe retries
- Start every new workflow with `dry_run=true`
