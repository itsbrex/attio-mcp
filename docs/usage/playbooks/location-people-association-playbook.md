# Location People Association Playbook

Use this playbook to associate all company-linked people to a location record after company linkage is confirmed.

## Goal

1. Confirm location -> company association.
2. Fetch people tied to that company.
3. Write people association onto location record.

## Recommended Sequence

1. Get location details:

- `get_record_details` for `resource_type: "locations"`

2. Find company people:

- `search_records_by_relationship`
- `relationship_type: "company_to_people"`
- `source_id: <company_record_id>`

3. Update location people relation:

- `update_record` for location with your people relation field.

## execute_workflow Template

```json
{
  "idempotency_key": "loc-people-sync-100-main-st-2026-02-24",
  "dry_run": true,
  "steps": [
    {
      "id": "location-details",
      "tool": "get_record_details",
      "arguments": {
        "resource_type": "locations",
        "record_id": "<location_record_id>"
      }
    },
    {
      "id": "company-people",
      "tool": "search_records_by_relationship",
      "arguments": {
        "relationship_type": "company_to_people",
        "source_id": "<company_record_id>",
        "target_resource_type": "people",
        "limit": 100
      }
    },
    {
      "id": "update-location-people",
      "tool": "update_record",
      "arguments": {
        "resource_type": "locations",
        "record_id": "<location_record_id>",
        "record_data": {
          "people": ["<person_record_id_1>", "<person_record_id_2>"]
        }
      },
      "on_error": "stop"
    }
  ]
}
```

## Compensation Example (Phase 2)

If you have a deterministic inverse operation, attach compensation to the update step:

```json
{
  "compensation": {
    "tool": "update_record",
    "arguments": {
      "resource_type": "locations",
      "record_id": "<location_record_id>",
      "record_data": {
        "people": []
      }
    }
  }
}
```

Only use this when emptying people is a safe rollback for your process.
