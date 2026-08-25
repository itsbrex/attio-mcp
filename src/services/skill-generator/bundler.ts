/**
 * Web-client bundle packaging for generated skills.
 *
 * Produces versioned, dated `.zip` and `.skill` archives of the skill
 * folder for upload into web clients (`.skill` for Claude.ai, `.zip` for
 * others). Both are ZIP archives whose root is the skill folder itself
 * (e.g. `attio-workspace-schema/SKILL.md`), per Anthropic's packaging
 * convention and Claude.ai's upload requirement.
 */

import * as fs from 'fs/promises';
import * as path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

/** Options for writing web-client bundles */
export interface BundleOptions {
  /** Skill folder name used as the archive root (e.g. 'attio-workspace-schema') */
  folderName: string;

  /** Directory to write the bundles into (e.g. ~/Desktop) */
  outputDir: string;

  /** ISO 8601 timestamp the schema was generated at (date part is used) */
  generatedAt: string;

  /** Schema content hash (first 8 chars version the filename); optional */
  schemaHash?: string;
}

/** Result of writing web-client bundles */
export interface BundleResult {
  /** Absolute path of the written .zip bundle */
  zipPath: string;

  /** Absolute path of the written .skill bundle */
  skillPath: string;
}

/**
 * Builds a ZIP archive of the skill files with the skill folder as the
 * archive root.
 *
 * @param files - Map of skill-relative paths to file contents
 * @param folderName - Folder name to prefix every entry with
 * @returns ZIP bytes
 */
export function buildSkillArchive(
  files: Record<string, string>,
  folderName: string
): Uint8Array {
  const fileMap: Record<string, Uint8Array> = {};
  for (const [relativePath, content] of Object.entries(files)) {
    fileMap[`${folderName}/${relativePath}`] = strToU8(content);
  }
  return zipSync(fileMap, { level: 6 });
}

/**
 * Derives the versioned bundle base name: `<folder>-<YYYY-MM-DD>[-<hash8>]`.
 * The date is rendered in LOCAL time (the UTC date can already be tomorrow
 * for evening runs, which reads wrong on a dated artifact).
 *
 * @param options - Bundle options
 * @returns Base filename without extension
 */
export function bundleBaseName(options: BundleOptions): string {
  const generated = new Date(options.generatedAt);
  const date = Number.isNaN(generated.getTime())
    ? options.generatedAt.slice(0, 10)
    : [
        generated.getFullYear(),
        String(generated.getMonth() + 1).padStart(2, '0'),
        String(generated.getDate()).padStart(2, '0'),
      ].join('-');
  const version = options.schemaHash
    ? `-${options.schemaHash.slice(0, 8)}`
    : '';
  return `${options.folderName}-${date}${version}`;
}

/**
 * Writes the `.zip` and `.skill` web-client bundles.
 *
 * @param files - Map of skill-relative paths to file contents
 * @param options - Bundle options
 * @returns Paths of the written bundles
 */
export async function writeWebBundles(
  files: Record<string, string>,
  options: BundleOptions
): Promise<BundleResult> {
  const archive = buildSkillArchive(files, options.folderName);
  const baseName = bundleBaseName(options);

  await fs.mkdir(options.outputDir, { recursive: true });

  const zipPath = path.join(options.outputDir, `${baseName}.zip`);
  const skillPath = path.join(options.outputDir, `${baseName}.skill`);

  await fs.writeFile(zipPath, archive);
  await fs.writeFile(skillPath, archive);

  return { zipPath, skillPath };
}
