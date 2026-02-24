# Location Company Resolution Playbook

Use this playbook when a location record has incomplete or incorrect company linkage and lease metadata.

## Goal

For each location:

1. Resolve the correct associated company.
2. Update `lxd`, `sf_occupied`, `market`, `submarket`, and `landlord`.
3. Keep workflow safe with `dry_run` before execution.

## Recommended Sequence

1. Discover location schema:

- `discover_record_attributes` with `resource_type: "locations"`
- Confirm your exact field slugs for company link and lease fields.

2. Locate target location record:

- `search_records` on `resource_type: "locations"` using tenant/building/address query.

3. Resolve company:

- Prefer explicit relation field already on location if present.
- Otherwise search companies by domain/legal name and confirm manually.

4. Update location:

- `update_record` with corrected company relation and lease fields.

## execute_workflow Template

```json
{
  "idempotency_key": "loc-update-100-main-st-2026-02-24",
  "dry_run": true,
  "steps": [
    {
      "id": "find-location",
      "tool": "search_records",
      "arguments": {
        "resource_type": "locations",
        "query": "100 Main St Acme HQ",
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
      "id": "update-location",
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
    }
  ]
}
```

Then rerun with `dry_run: false` after confirming IDs and field slugs.

## Notes

- Relation field names vary by workspace (`company`, `associated_company`, etc.).
- Always verify field slugs with `discover_record_attributes` before updates.
