/**
 * CLI command handler for generating Claude Skills from Attio workspace schema
 *
 * @see Issue #983
 */

import * as fs from 'fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import {
  WorkspaceSchemaService,
  SchemaFormatterService,
  OutputWriterService,
} from '@/services/skill-generator/index.js';
import { compareSchemaToSkill } from '@/services/skill-generator/drift.js';
import { DEFAULT_CONCURRENCY } from '@/services/skill-generator/concurrency.js';
import { installToAllAgents } from '@/services/skill-generator/agent-installer.js';
import { writeWebBundles } from '@/services/skill-generator/bundler.js';
import type { GenerateSkillConfig } from '@/services/skill-generator/types.js';
import { getAvailableObjects } from './attributes.js';

/**
 * Interface for command arguments
 */
interface GenerateSkillArgs {
  object?: string;
  objects?: string;
  all?: boolean;
  format?: 'skill' | 'markdown' | 'json';
  output?: string;
  zip?: boolean;
  maxOptions?: number;
  includeArchived?: boolean;
  optionFetchDelay?: number;
  concurrency?: number;
  lists?: boolean;
  install?: boolean;
  installDir?: string;
  bundles?: boolean;
  bundleDir?: string;
  check?: boolean;
  apiKey?: string;
  [key: string]: unknown;
}

/** Directory name of the generated skill (matches the SKILL.md name) */
const SKILL_DIR_NAME = 'attio-workspace-schema';

/**
 * Resolves the skill install directory (~/.claude/skills by default)
 */
function resolveInstallPath(installDir?: string): string {
  const baseDir = installDir
    ? path.resolve(installDir)
    : path.join(os.homedir(), '.claude', 'skills');
  return path.join(baseDir, SKILL_DIR_NAME);
}

/**
 * Command handler for generating skills
 *
 * @param argv - Command arguments from yargs
 */
export async function generateSkill(argv: GenerateSkillArgs): Promise<void> {
  const spinner = ora('Initializing skill generator...').start();

  try {
    // 1. Validate API key
    const apiKey = argv.apiKey || process.env.ATTIO_API_KEY;
    if (!apiKey) {
      spinner.fail(
        'No API key provided. Set ATTIO_API_KEY env var or pass --api-key'
      );
      process.exit(1);
    }

    // 2. Determine objects to process
    let objects: string[];
    if (argv.all) {
      spinner.text = 'Discovering workspace objects...';
      const available = await getAvailableObjects(apiKey);
      objects = available
        .map((o) => o.api_slug)
        .filter((s): s is string => typeof s === 'string' && s.length > 0);
      if (objects.length === 0) {
        spinner.fail('No objects discovered in workspace.');
        process.exit(1);
      }
      spinner.text = `Generating skill for ${objects.length} object(s): ${objects.join(', ')}...`;
    } else if (argv.objects) {
      objects = argv.objects
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (objects.length === 0) {
        spinner.fail('--objects requires at least one slug.');
        process.exit(1);
      }
      spinner.text = `Generating skill for ${objects.join(', ')}...`;
    } else {
      objects = [argv.object!];
      spinner.text = `Generating skill for ${argv.object}...`;
    }

    // 3. Build configuration
    const config: GenerateSkillConfig = {
      objects,
      format: (argv.format as 'skill' | 'markdown' | 'json') || 'skill',
      outputDir: argv.output || './output',
      zip: argv.zip || false,
      maxOptionsPerAttribute: argv.maxOptions || 20,
      includeArchived: argv.includeArchived || false,
      optionFetchDelayMs: argv.optionFetchDelay ?? 100,
      concurrency: argv.concurrency ?? DEFAULT_CONCURRENCY,
      includeLists: argv.lists !== false,
      install: argv.install || false,
      installDir: argv.installDir,
      bundles: argv.bundles !== false,
      bundleDir: argv.bundleDir,
      apiKey,
    };

    // 4. Fetch workspace schema
    spinner.text = `Fetching workspace schema for ${objects.length} object(s)...`;
    const schemaService = new WorkspaceSchemaService();
    const schema = await schemaService.fetchSchema(objects, {
      maxOptionsPerAttribute: config.maxOptionsPerAttribute,
      includeArchived: config.includeArchived,
      optionFetchDelayMs: config.optionFetchDelayMs,
      concurrency: config.concurrency,
      includeLists: config.includeLists,
    });

    if (schema.objects.length === 0) {
      spinner.fail(
        'No objects could be fetched. Check API key and object names.'
      );
      process.exit(1);
    }

    if (schema.objects.length < objects.length) {
      spinner.warn(
        chalk.yellow(
          `⚠️  Only ${schema.objects.length} of ${objects.length} objects were fetched successfully`
        )
      );
      spinner.start('Continuing with available data...');
    }

    spinner.succeed(
      `Fetched schema for ${chalk.green(schema.objects.length.toString())} object(s)` +
        (schema.lists
          ? ` and ${chalk.green(String(schema.lists.length))} list(s)`
          : '')
    );

    // 5. Drift check mode: compare live schema hash against installed skill
    if (argv.check) {
      await runDriftCheck(schema, argv.installDir);
      return; // runDriftCheck exits the process
    }

    // 6. Format schema
    spinner.start(`Formatting output as ${config.format}...`);
    const formatterService = new SchemaFormatterService();
    const formatted = await formatterService.format(schema, config.format);
    spinner.succeed(`Formatted as ${chalk.cyan(config.format)}`);

    // 7. Write output (install mode: stage, install to all agents, bundle)
    const writerService = new OutputWriterService();
    let output;
    if (config.install) {
      if (config.format !== 'skill') {
        spinner.fail('--install requires --format skill (the default).');
        process.exit(1);
      }

      // 7a. Stage the skill folder (./output/attio-workspace-skill)
      spinner.start('Staging skill files...');
      output = await writerService.write(formatted, { ...config, zip: false });
      spinner.succeed(`Staged skill at ${chalk.white(output.path)}`);

      // 7b. Install to ALL detected agents via the skills CLI
      // (same targets as `npx skills add <dir> -g -y`); the CLI's own
      // output streams below so the detected agents are visible.
      spinner.stop();
      process.stdout.write(
        chalk.cyan('  Installing to all detected agents (skills CLI)...') + '\n'
      );
      const agentInstall = installToAllAgents(output.path);
      if (agentInstall.ok) {
        spinner.succeed(
          chalk.green(
            `✓ Installed to all detected agents via ${agentInstall.runner}`
          )
        );
      } else {
        // Fallback: direct copy into the Claude skills directory
        const installPath = resolveInstallPath(config.installDir);
        spinner.warn(
          chalk.yellow(
            `skills CLI unavailable (${agentInstall.error}); falling back to direct install`
          )
        );
        spinner.start(`Installing skill to ${installPath}...`);
        await writerService.writeTo(formatted, installPath);
        spinner.succeed(chalk.green(`✓ Installed to ${installPath}`));
      }

      // 7c. Web-client bundles: dated .zip + .skill onto the Desktop
      // (.skill for Claude.ai, .zip for other web clients)
      if (config.bundles !== false) {
        const bundleDir =
          config.bundleDir ?? path.join(os.homedir(), 'Desktop');
        spinner.start(`Writing web-client bundles to ${bundleDir}...`);
        const bundles = await writeWebBundles(formatted.files, {
          folderName: SKILL_DIR_NAME,
          outputDir: bundleDir,
          generatedAt: schema.metadata.generatedAt,
          schemaHash: schema.metadata.schemaHash,
        });
        spinner.succeed(chalk.green('✓ Web-client bundles written\n'));
        process.stdout.write(chalk.cyan('  Bundles:') + '\n');
        process.stdout.write(
          chalk.white(`    - ${bundles.skillPath}  (Claude.ai upload)`) + '\n'
        );
        process.stdout.write(
          chalk.white(`    - ${bundles.zipPath}  (other web clients)`) + '\n'
        );
      } else {
        process.stdout.write('\n');
      }
    } else {
      spinner.start('Writing files to disk...');
      output = await writerService.write(formatted, config);
      spinner.succeed(chalk.green('✓ Skill generated successfully!\n'));
    }

    // 8. Success message
    process.stdout.write(chalk.cyan('  Output:') + '\n');
    process.stdout.write(chalk.white(`    ${output.path}`) + '\n');
    process.stdout.write('\n');
    process.stdout.write(chalk.cyan('  Files:') + '\n');
    output.files.forEach((file) => {
      process.stdout.write(chalk.white(`    - ${file}`) + '\n');
    });

    if (config.zip && !config.install) {
      process.stdout.write('\n');
      process.stdout.write(
        chalk.green('  ✓ ZIP package ready for Claude upload!') + '\n'
      );
    }

    // Note: TTLCache uses unref() on its cleanup interval (ttl-cache.ts:38-40)
    // so it won't prevent the process from exiting naturally
  } catch (error: unknown) {
    spinner.fail(
      chalk.red(
        `Generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Compares the live schema against the installed skill and exits with:
 * - 0 when in sync
 * - 1 when the workspace has drifted from the installed skill
 * - 2 when no installed skill (or hash stamp) was found
 */
async function runDriftCheck(
  schema: Awaited<ReturnType<WorkspaceSchemaService['fetchSchema']>>,
  installDir?: string
): Promise<void> {
  const installPath = resolveInstallPath(installDir);
  const skillMdPath = path.join(installPath, 'SKILL.md');

  let skillMdContent: string;
  try {
    skillMdContent = await fs.readFile(skillMdPath, 'utf8');
  } catch {
    process.stdout.write(
      chalk.yellow(`✗ No installed skill found at ${skillMdPath}\n`) +
        chalk.white('  Run with --install to install it.\n')
    );
    process.exit(2);
  }

  const report = compareSchemaToSkill(schema, skillMdContent);

  if (report.installedHash === null) {
    process.stdout.write(
      chalk.yellow(
        `✗ Installed skill at ${skillMdPath} has no schema hash stamp.\n`
      ) +
        chalk.white(
          '  Regenerate with --install to stamp it for drift checking.\n'
        )
    );
    process.exit(2);
  }

  if (report.inSync) {
    process.stdout.write(
      chalk.green('✓ Installed skill is in sync with the workspace.\n') +
        chalk.white(`  Schema hash: ${report.liveHash}\n`)
    );
    process.exit(0);
  }

  process.stdout.write(
    chalk.red('✗ Workspace schema has drifted from the installed skill.\n') +
      chalk.white(`  Installed: ${report.installedHash}\n`) +
      chalk.white(`  Live:      ${report.liveHash}\n`) +
      chalk.white('  Regenerate with --install to update.\n')
  );
  process.exit(1);
}
