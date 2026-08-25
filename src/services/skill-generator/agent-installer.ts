/**
 * Multi-agent skill installation via the `skills` CLI
 * (https://www.npmjs.com/package/skills — "The open agent skills ecosystem").
 *
 * `skills add <dir> --global --agent '*' --yes` detects every supported
 * coding agent on the system (Claude Code, Cursor, Codex, opencode, …) and
 * installs the skill to all of them — the same targets as running
 * `npx skills add … -g -y` by hand. We shell out rather than reimplement
 * agent detection so the target list always matches the ecosystem tool.
 */

import { spawnSync } from 'node:child_process';

/** Result of a multi-agent install attempt */
export interface AgentInstallResult {
  /** True when a runner executed the skills CLI successfully */
  ok: boolean;

  /** The runner that succeeded (e.g. 'bunx'), when ok */
  runner?: string;

  /** Failure detail for the last attempted runner, when not ok */
  error?: string;
}

/** Runners tried in order to execute the skills CLI */
const DEFAULT_RUNNERS: string[][] = [
  ['bunx', 'skills'],
  ['npx', '-y', 'skills'],
];

/**
 * Installs a skill directory to all detected agents on the system via the
 * `skills` CLI. Output is streamed to the terminal so the user sees which
 * agents were detected and written.
 *
 * @param skillDir - Absolute path of the generated skill directory
 * @param runners - Override the runner commands (for testing)
 * @returns Result indicating whether any runner succeeded
 */
export function installToAllAgents(
  skillDir: string,
  runners: string[][] = DEFAULT_RUNNERS
): AgentInstallResult {
  let lastError = 'no runner available';

  for (const runner of runners) {
    const [command, ...prefixArgs] = runner;
    const result = spawnSync(
      command,
      [...prefixArgs, 'add', skillDir, '--global', '--agent', '*', '--yes'],
      { stdio: 'inherit' }
    );

    if (result.error) {
      lastError = result.error.message;
      continue; // Runner binary missing — try the next one
    }
    if (result.status === 0) {
      return { ok: true, runner: command };
    }
    lastError = `${command} skills add exited with status ${result.status}`;
  }

  return { ok: false, error: lastError };
}
