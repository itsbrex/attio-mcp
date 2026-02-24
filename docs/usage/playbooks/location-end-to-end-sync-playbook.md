# Location End-to-End Sync Playbook

This is the full workflow you asked for:

1. Resolve location
2. Resolve and attach company
3. Update LXD/SF/Market/Submarket/Landlord
4. Find company people
5. Attach people to location

## End-to-End Template

```json
{
  "idempotency_key": "loc-e2e-sync-100-main-st-2026-02-24",
  "dry_run": true,
  "rollback_on_failure": true,
  "steps": [
    {
      "id": "find-location",
      "tool": "search_records",
      "arguments": {
        "resource_type": "locations",
        "query": "100 Main St Acme",
        "limit": 3
      }
    },
    {
      "id": "find-company",
      "tool": "search_records",
      "arguments": {
        "resource_type": "companies",
        "query": "Acme",
        "limit": 3
      }
    },
    {
      "id": "update-location-core-fields",
      "tool": "update_record",
      "arguments": {
        "resource_type": "locations",
        "record_id": "<location_record_id>",
        "record_data": {
          "company": "<company_record_id>",
          "lxd": "2027-01-01",
          "sf_occupied": 10000,
          "market": "Orange County",
          "submarket": "Irvine Spectrum",
          "landlord": "Landlord LLC"
        }
      },
      "on_error": "stop"
    },
    {
      "id": "find-company-people",
      "tool": "search_records_by_relationship",
      "arguments": {
        "relationship_type": "company_to_people",
        "source_id": "<company_record_id>",
        "target_resource_type": "people",
        "limit": 100
      }
    },
    {
      "id": "attach-people-to-location",
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

## Important

- Field slugs vary per workspace. Validate with `discover_record_attributes` before writes.
- Keep strict dry-run discipline: run once with `dry_run=true`, confirm IDs/fields, then execute unchanged with `dry_run=false`.
