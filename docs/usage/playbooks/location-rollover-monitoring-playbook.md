# Location Rollover Monitoring Playbook

Use this weekly to identify near-term lease expirations and trigger follow-up tasks.

## Goal

1. Find locations with `lxd` in the next 30/60/90/120 days.
2. Prioritize by square footage and strategic market.
3. Create follow-up tasks for account teams.

## Query Pattern

- `search_records` on `locations` with date filters for `lxd`
- Sort or segment by `sf_occupied`, `market`, `submarket`

## execute_workflow Template

```json
{
  "idempotency_key": "weekly-lxd-watch-2026-02-24",
  "dry_run": true,
  "steps": [
    {
      "id": "find-upcoming-lxd",
      "tool": "search_records",
      "arguments": {
        "resource_type": "locations",
        "query": "",
        "date_field": "updated_at",
        "limit": 100
      }
    },
    {
      "id": "create-rollover-task",
      "tool": "create_record",
      "arguments": {
        "resource_type": "tasks",
        "record_data": {
          "title": "Review upcoming LXD locations",
          "content": "Review top expiring locations by SF and market and confirm renewal strategy"
        }
      },
      "on_error": "continue"
    }
  ]
}
```

After dry-run review, execute with `dry_run: false` and then replace placeholder query/filter logic with your validated location field slugs.
