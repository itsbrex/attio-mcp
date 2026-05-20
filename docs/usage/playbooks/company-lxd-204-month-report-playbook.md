# Company LXD 204-Month Report Playbook

Return all companies tied to locations with `LXD` in the next 204 months, including:

- Company name
- LXD
- SF occupied
- Company `last_call_date`
- Clickable link to the **company** record (not location)

## Goal

Produce a company-centric report from location lease data.

As of `2026-02-24`, 204 months from today is `2043-02-24`.

## Required Field Slugs

- Locations:
  - `company` (record-reference)
  - `exp_date` (LXD)
  - `sf_occupied`
- Companies:
  - `name`
  - `last_call_date`

## MCP Workflow

1. Discover fields (once per workspace)

```json
{
  "tool": "discover_record_attributes",
  "arguments": { "resource_type": "locations" }
}
```

```json
{
  "tool": "discover_record_attributes",
  "arguments": { "resource_type": "companies" }
}
```

2. Fetch locations with LXD in range (paginate with `offset`)

```json
{
  "tool": "search_records",
  "arguments": {
    "resource_type": "locations",
    "query": "",
    "date_field": "exp_date",
    "date_to": "2043-02-24",
    "limit": 100,
    "offset": 0
  }
}
```

3. For each returned location:

- Read `values.company[0].target_record_id`
- Read location `values.exp_date[0].value` and `values.sf_occupied[0].value`
- Fetch the company record:

```json
{
  "tool": "get_record_details",
  "arguments": {
    "resource_type": "companies",
    "record_id": "<company_record_id>"
  }
}
```

4. Build output rows:

- `Company Name` = company `values.name[0].value` (or `full_name`)
- `LXD` = location `exp_date`
- `SF` = location `sf_occupied`
- `Last Call Date` = company `values.last_call_date[0].value`
- `Company Link` = company `web_url`

5. De-duplicate (recommended):

- Keep one row per company.
- If multiple locations exist, keep earliest non-null `LXD` and sum `SF` (or keep per-location rows if you prefer).

## Output Format (Markdown)

```md
| Company   |        LXD |      SF | Last Call Date | Link                                                 |
| --------- | ---------: | ------: | -------------- | ---------------------------------------------------- |
| Acme Corp | 2027-06-30 | 164,908 | 2025-12-10     | [Open Company](https://app.attio.com/...company/...) |
```

## Prompt You Can Reuse

```text
Run the Company LXD 204-month report.

Requirements:
- Include all companies associated to locations where exp_date <= 204 months from today.
- Include Company name, LXD (location exp_date), SF (location sf_occupied), company last_call_date, and clickable company web_url.
- Use company links only (not location links).
- Paginate through all locations.
- Deduplicate to one row per company by earliest LXD and summed SF.
- Return a markdown table plus total companies count.
```
