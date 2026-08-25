#!/usr/bin/env node
/**
 * CLI tool for discovering Attio attributes and generating mapping files
 */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { discoverAttributes } from './commands/attributes.js';
import { generateSkill } from './commands/generate-skill.js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ debug: false });

/**
 * Main CLI entrypoint
 */
yargs(hideBin(process.argv))
  .scriptName('attio-discover')
  .usage('$0 <cmd> [args]')
  .command(
    'attributes',
    'Discover Attio attribute mappings',
    (yargs) => {
      return yargs
        .option('object', {
          alias: 'o',
          description:
            'Object type to discover attributes for (e.g., companies, people)',
          type: 'string',
        })
        .option('all', {
          alias: 'a',
          description: 'Discover attributes for all objects',
          type: 'boolean',
          default: false,
        })
        .option('output', {
          alias: 'f',
          description: 'Output file path',
          default: 'configs/runtime/mappings/user.json',
          type: 'string',
        })
        .option('reset', {
          alias: 'r',
          description: 'Reset existing mappings instead of merging',
          type: 'boolean',
          default: false,
        })
        .option('api-key', {
          alias: 'k',
          description: 'Attio API key (defaults to ATTIO_API_KEY env var)',
          type: 'string',
        })
        .conflicts('object', 'all')
        .check((argv) => {
          if (!argv.object && !argv.all) {
            throw new Error('You must specify either --object or --all');
          }
          return true;
        });
    },
    discoverAttributes
  )
  .command(
    'generate-skill',
    'Generate Claude Skill from workspace schema',
    (yargs) => {
      yargs
        .option('object', {
          alias: 'o',
          description: 'Single object to generate skill for (e.g., companies)',
          type: 'string',
        })
        .option('objects', {
          description:
            'Comma-separated subset of object slugs (e.g., companies,people,custom_x)',
          type: 'string',
        })
        .option('all', {
          alias: 'a',
          description: 'Generate for all workspace objects (standard + custom)',
          type: 'boolean',
          default: false,
        })
        .option('format', {
          alias: 'f',
          description: 'Output format (skill, markdown, json)',
          type: 'string',
          choices: ['skill', 'markdown', 'json'] as const,
          default: 'skill',
        })
        .option('output', {
          description: 'Output directory',
          type: 'string',
          default: './output',
        })
        .option('zip', {
          alias: 'z',
          description: 'Package as ZIP file',
          type: 'boolean',
          default: false,
        })
        .option('max-options', {
          description: 'Max options per attribute (default: 20)',
          type: 'number',
          default: 20,
        })
        .option('include-archived', {
          description: 'Include archived options',
          type: 'boolean',
          default: false,
        })
        .option('option-fetch-delay', {
          description:
            'Delay between attribute option fetches in milliseconds (default: 100)',
          type: 'number',
          default: 100,
        })
        .option('concurrency', {
          description:
            'Concurrent option/attribute fetches (default: 4); 429s are retried with backoff',
          type: 'number',
          default: 4,
        })
        .option('lists', {
          description:
            'Include workspace lists (list_id + stage options) in the skill; disable with --no-lists',
          type: 'boolean',
          default: true,
        })
        .option('install', {
          description:
            'Install the generated skill directly into the Claude skills directory',
          type: 'boolean',
          default: false,
        })
        .option('install-dir', {
          description:
            'Claude skills directory (default: ~/.claude/skills); used by --install and --check',
          type: 'string',
        })
        .option('check', {
          description:
            'Drift check: compare live workspace schema against the installed skill. ' +
            'Exit 0 = in sync, 1 = drifted, 2 = not installed. No files are written.',
          type: 'boolean',
          default: false,
        })
        .option('api-key', {
          alias: 'k',
          description: 'Attio API key (defaults to ATTIO_API_KEY env var)',
          type: 'string',
        })
        .check((argv) => {
          const provided = [
            argv.object ? 'object' : null,
            argv.objects ? 'objects' : null,
            argv.all ? 'all' : null,
          ].filter(Boolean);
          if (provided.length === 0) {
            throw new Error('You must specify --object, --objects, or --all');
          }
          if (provided.length > 1) {
            throw new Error(
              `--${provided.join(', --')} are mutually exclusive; pick one`
            );
          }
          if (argv.install && argv.check) {
            throw new Error(
              '--install and --check are mutually exclusive; pick one'
            );
          }
          if (
            typeof argv.optionFetchDelay !== 'number' ||
            !Number.isFinite(argv.optionFetchDelay) ||
            argv.optionFetchDelay < 0
          ) {
            throw new Error(
              '--option-fetch-delay must be a non-negative number'
            );
          }
          if (
            typeof argv.concurrency !== 'number' ||
            !Number.isFinite(argv.concurrency) ||
            argv.concurrency < 1
          ) {
            throw new Error('--concurrency must be a positive number');
          }
          return true;
        });
    },
    generateSkill
  )
  /*
  // These commands will be implemented in future phases
  .command('objects', 'Discover object mappings', (yargs) => {
    // ... object discovery options
  }, discoverObjects)
  .command('lists', 'Discover list mappings', (yargs) => {
    // ... list discovery options
  }, discoverLists)
  .command('all', 'Discover all mappings', (yargs) => {
    // ... options for discovering everything
  }, discoverAll)
  */
  .demandCommand(1, 'You must specify a discovery command')
  .help()
  .alias('help', 'h')
  .epilog('For more information, visit https://github.com/hmk/attio-mcp-server')
  .parse();
