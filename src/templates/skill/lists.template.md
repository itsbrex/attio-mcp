# Workspace Lists

Lists are the workspace's pipelines and collections. Use the `list_id`
values below with the list tools (`get-list-entries`, `add-record-to-list`,
`manage-list-entry`, etc.).

## List Index

| List | API Slug | List ID | Parent Object(s) |
| ---- | -------- | ------- | ---------------- |

{{#each lists}}
| {{{name}}} | `{{apiSlug}}` | `{{listId}}` | {{#each parentObjects}}`{{this}}`{{#unless @last}}, {{/unless}}{{/each}} |
{{/each}}

---

{{#each lists}}

## {{{name}}} (`{{apiSlug}}`)

**List ID**: `{{listId}}`
{{#if parentObjects.length}}**Contains**: {{#each parentObjects}}`{{this}}`{{#unless @last}}, {{/unless}}{{/each}} records{{/if}}

{{#if attributes.length}}
| Attribute | API Slug | Type |
| --------- | -------- | ---- |
{{#each attributes}}
| {{displayName}} | `{{apiSlug}}` | {{type}} |
{{/each}}

{{#each attributes}}
{{#if options}}

### {{displayName}} (`{{apiSlug}}`) options

{{#each options}}

- {{title}}{{#if isArchived}} _(archived)_{{/if}}
  {{/each}}
  {{#if optionsTruncated}}_(showing {{options.length}} of {{totalOptions}})_{{/if}}
  {{/if}}
  {{/each}}
  {{else}}
  _No stage/select attributes discovered for this list._
  {{/if}}

---

{{/each}}
