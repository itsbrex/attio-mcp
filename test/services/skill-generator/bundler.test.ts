/**
 * Unit tests for web-client bundle packaging (.zip / .skill)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import {
  buildSkillArchive,
  bundleBaseName,
  writeWebBundles,
} from '@/services/skill-generator/bundler.js';

const FILES = {
  'SKILL.md': '# Test Skill',
  'resources/companies-attributes.md': '# Companies',
};

describe('buildSkillArchive', () => {
  it('places the skill folder at the archive root (Claude.ai requirement)', () => {
    const archive = buildSkillArchive(FILES, 'attio-workspace-schema');
    const entries = unzipSync(archive);

    expect(Object.keys(entries).sort()).toEqual([
      'attio-workspace-schema/SKILL.md',
      'attio-workspace-schema/resources/companies-attributes.md',
    ]);
    expect(strFromU8(entries['attio-workspace-schema/SKILL.md'])).toBe(
      '# Test Skill'
    );
  });
});

describe('bundleBaseName', () => {
  it('includes the date and short schema hash', () => {
    expect(
      bundleBaseName({
        folderName: 'attio-workspace-schema',
        outputDir: '/tmp',
        generatedAt: '2026-08-24T10:00:00.000Z',
        schemaHash: 'abcdef0123456789'.repeat(4),
      })
    ).toBe('attio-workspace-schema-2026-08-24-abcdef01');
  });

  it('omits the hash suffix when no hash is available', () => {
    expect(
      bundleBaseName({
        folderName: 'attio-workspace-schema',
        outputDir: '/tmp',
        generatedAt: '2026-08-24T10:00:00.000Z',
      })
    ).toBe('attio-workspace-schema-2026-08-24');
  });
});

describe('writeWebBundles', () => {
  const testDir = path.join(process.cwd(), 'test-output-temp-bundles');

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('writes identical .zip and .skill archives with versioned names', async () => {
    const result = await writeWebBundles(FILES, {
      folderName: 'attio-workspace-schema',
      outputDir: testDir,
      generatedAt: '2026-08-24T10:00:00.000Z',
      schemaHash: '1524'.repeat(16),
    });

    expect(path.basename(result.zipPath)).toBe(
      'attio-workspace-schema-2026-08-24-15241524.zip'
    );
    expect(path.basename(result.skillPath)).toBe(
      'attio-workspace-schema-2026-08-24-15241524.skill'
    );

    const zipBytes = await fs.readFile(result.zipPath);
    const skillBytes = await fs.readFile(result.skillPath);
    expect(Buffer.compare(zipBytes, skillBytes)).toBe(0);

    const entries = unzipSync(new Uint8Array(zipBytes));
    expect(entries['attio-workspace-schema/SKILL.md']).toBeDefined();
  });

  it('creates the output directory when missing', async () => {
    const nested = path.join(testDir, 'deep', 'nested');
    const result = await writeWebBundles(FILES, {
      folderName: 'attio-workspace-schema',
      outputDir: nested,
      generatedAt: '2026-08-24T10:00:00.000Z',
    });

    await expect(fs.stat(result.zipPath)).resolves.toBeDefined();
  });
});
