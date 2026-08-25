/**
 * Unit tests for schema drift detection (generate-skill --check)
 */

import { describe, it, expect } from 'vitest';
import {
  computeSchemaHash,
  extractSchemaHash,
  compareSchemaToSkill,
} from '@/services/skill-generator/drift.js';
import type { WorkspaceSchema } from '@/services/skill-generator/types.js';

function buildSchema(overrides?: Partial<WorkspaceSchema>): WorkspaceSchema {
  return {
    metadata: {
      generatedAt: '2026-08-24T00:00:00.000Z',
      workspace: 'test-workspace',
      objects: ['companies'],
    },
    objects: [
      {
        objectSlug: 'companies',
        displayName: 'Companies',
        attributes: [
          {
            apiSlug: 'name',
            displayName: 'Name',
            type: 'text',
            isMultiselect: false,
            isUnique: false,
            isRequired: true,
            isWritable: true,
          },
          {
            apiSlug: 'industry',
            displayName: 'Industry',
            type: 'select',
            isMultiselect: false,
            isUnique: false,
            isRequired: false,
            isWritable: true,
            options: [
              { id: 'opt1', title: 'Technology', value: 'Technology' },
              { id: 'opt2', title: 'Healthcare', value: 'Healthcare' },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('computeSchemaHash', () => {
  it('produces a 64-char hex hash', () => {
    expect(computeSchemaHash(buildSchema())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across metadata differences (timestamps excluded)', () => {
    const a = buildSchema();
    const b = buildSchema();
    b.metadata.generatedAt = '2027-01-01T12:34:56.000Z';
    b.metadata.workspace = 'renamed-workspace';
    expect(computeSchemaHash(a)).toBe(computeSchemaHash(b));
  });

  it('is order-independent for objects, attributes, and options', () => {
    const a = buildSchema();
    const b = buildSchema();
    b.objects[0].attributes.reverse();
    b.objects[0].attributes
      .find((x) => x.apiSlug === 'industry')!
      .options!.reverse();
    expect(computeSchemaHash(a)).toBe(computeSchemaHash(b));
  });

  it('changes when an attribute is added', () => {
    const a = buildSchema();
    const b = buildSchema();
    b.objects[0].attributes.push({
      apiSlug: 'domains',
      displayName: 'Domains',
      type: 'domain',
      isMultiselect: true,
      isUnique: false,
      isRequired: false,
      isWritable: true,
    });
    expect(computeSchemaHash(a)).not.toBe(computeSchemaHash(b));
  });

  it('changes when an option value changes', () => {
    const a = buildSchema();
    const b = buildSchema();
    b.objects[0].attributes.find(
      (x) => x.apiSlug === 'industry'
    )!.options![0].title = 'Tech';
    expect(computeSchemaHash(a)).not.toBe(computeSchemaHash(b));
  });

  it('changes when lists change', () => {
    const a = buildSchema();
    const b = buildSchema({
      lists: [
        {
          listId: 'list-1',
          apiSlug: 'prospecting',
          name: 'Prospecting',
          parentObjects: ['companies'],
          attributes: [],
        },
      ],
    });
    expect(computeSchemaHash(a)).not.toBe(computeSchemaHash(b));
  });
});

describe('extractSchemaHash', () => {
  it('extracts the stamped hash from SKILL.md content', () => {
    const hash = computeSchemaHash(buildSchema());
    const skillMd = `---\nname: attio-workspace-schema\n---\n\n**Generated**: now\n**Schema Hash**: \`${hash}\`\n`;
    expect(extractSchemaHash(skillMd)).toBe(hash);
  });

  it('returns null when no stamp is present', () => {
    expect(extractSchemaHash('# No stamp here')).toBeNull();
  });
});

describe('compareSchemaToSkill', () => {
  it('reports in sync when hashes match', () => {
    const schema = buildSchema();
    const hash = computeSchemaHash(schema);
    const report = compareSchemaToSkill(schema, `**Schema Hash**: \`${hash}\``);
    expect(report.inSync).toBe(true);
    expect(report.liveHash).toBe(hash);
    expect(report.installedHash).toBe(hash);
  });

  it('reports drift when the live schema changed', () => {
    const schema = buildSchema();
    const staleHash = computeSchemaHash(schema);
    schema.objects[0].attributes.pop();
    const report = compareSchemaToSkill(
      schema,
      `**Schema Hash**: \`${staleHash}\``
    );
    expect(report.inSync).toBe(false);
    expect(report.installedHash).toBe(staleHash);
    expect(report.liveHash).not.toBe(staleHash);
  });

  it('reports out of sync when no stamp exists', () => {
    const report = compareSchemaToSkill(buildSchema(), '# unstamped');
    expect(report.inSync).toBe(false);
    expect(report.installedHash).toBeNull();
  });
});
