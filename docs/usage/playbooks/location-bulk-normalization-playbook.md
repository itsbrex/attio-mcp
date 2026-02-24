# Location Bulk Normalization Playbook

Use this for quarterly cleanup of location portfolio fields.

## Goal

Normalize across locations:

- `market`
- `submarket`
- `landlord`
- `sf_occupied` format consistency

## Process

1. Pull candidate records by market/submarket variants.
2. Validate canonical target values.
3. Execute chunked updates with `batch_records` or controlled `execute_workflow` runs.
4. Re-query and verify no stragglers remain.

## Safety Rules

- Always run a dry-run first.
- Use idempotency keys per batch.
- Keep each workflow to <=25 steps.

## execute_workflow Skeleton

```json
{
  "idempotency_key": "loc-normalization-oc-irvine-batch-1-2026-02-24",
  "dry_run": true,
  "steps": [
    {
      "id": "verify-current-values",
      "tool": "search_records",
      "arguments": {
        "resource_type": "locations",
        "query": "Irvine Spec",
        "limit": 25
      }
    },
    {
      "id": "normalize-location-1",
      "tool": "update_record",
      "arguments": {
        "resource_type": "locations",
        "record_id": "<location_record_id_1>",
        "record_data": {
          "market": "Orange County",
          "submarket": "Irvine Spectrum"
        }
      }
    },
    {
      "id": "normalize-location-2",
      "tool": "update_record",
      "arguments": {
        "resource_type": "locations",
        "record_id": "<location_record_id_2>",
        "record_data": {
          "market": "Orange County",
          "submarket": "Irvine Spectrum"
        }
      }
    }
  ]
}
```
