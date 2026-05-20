import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateUniversalToolParams } from '@/handlers/tool-configs/universal/schemas.js';
import { ErrorService } from '@/services/ErrorService.js';
import { UniversalToolConfig } from '@/handlers/tool-configs/universal/types.js';

const WORKFLOW_EXECUTE_TOOL = 'execute_workflow';
const MAX_STEPS = 25;
const MAX_OUTPUT_PREVIEW_LENGTH = 500;

const workflowCompensationSchema = z.object({
  tool: z.string().trim().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

const workflowStepSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  tool: z.string().trim().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
  on_error: z.enum(['stop', 'continue']).optional().default('stop'),
  compensation: workflowCompensationSchema.optional(),
});

const workflowExecuteSchema = z.object({
  workflow_id: z.string().trim().min(1).max(120).optional(),
  idempotency_key: z.string().trim().min(1).max(160).optional(),
  dry_run: z.boolean().optional().default(false),
  resume: z.boolean().optional().default(false),
  rollback_on_failure: z.boolean().optional().default(true),
  steps: z.array(workflowStepSchema).min(1).max(MAX_STEPS),
});

type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
type WorkflowExecuteInput = z.infer<typeof workflowExecuteSchema>;

interface ResolvedStep {
  index: number;
  id: string;
  requestedTool: string;
  tool: string;
  arguments: Record<string, unknown>;
  onError: 'stop' | 'continue';
  compensation?: {
    requestedTool: string;
    tool: string;
    arguments: Record<string, unknown>;
  };
  readOnly: boolean;
  valid: boolean;
  validationError?: string;
}

export interface WorkflowStepResult {
  index: number;
  id: string;
  tool: string;
  requested_tool: string;
  read_only: boolean;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  output_preview?: string;
  error?: string;
}

export interface WorkflowRollbackStepResult {
  source_step_id: string;
  compensation_tool: string;
  requested_compensation_tool: string;
  status: 'completed' | 'failed' | 'skipped';
  output_preview?: string;
  error?: string;
}

type WorkflowStatus =
  | 'planned'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export interface WorkflowExecutionResult {
  workflow_id: string;
  idempotency_key: string;
  dry_run: boolean;
  resume: boolean;
  rollback_on_failure: boolean;
  replayed: boolean;
  status: WorkflowStatus;
  summary: {
    total_steps: number;
    read_steps: number;
    write_steps: number;
    compensation_steps: number;
    completed_steps: number;
    failed_steps: number;
    skipped_steps: number;
  };
  steps: WorkflowStepResult[];
  rollback: {
    attempted: boolean;
    status: 'not_needed' | 'completed' | 'completed_with_errors' | 'failed';
    steps: WorkflowRollbackStepResult[];
  };
  journal: {
    created_at: string;
    updated_at: string;
    fingerprint: string;
  };
}

interface WorkflowJournalEntry {
  idempotencyKey: string;
  fingerprint: string;
  status: 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  response?: WorkflowExecutionResult;
}

interface ToolDefinitionLike {
  name?: string;
  annotations?: {
    readOnlyHint?: boolean;
  };
}

const workflowJournal = new Map<string, WorkflowJournalEntry>();

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

function createFingerprint(input: WorkflowExecuteInput): string {
  const payload = safeJson({
    dry_run: input.dry_run,
    rollback_on_failure: input.rollback_on_failure,
    steps: input.steps,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function trimPreview(value: string): string {
  if (value.length <= MAX_OUTPUT_PREVIEW_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_OUTPUT_PREVIEW_LENGTH)}...`;
}

function isLikelyWriteTool(toolName: string): boolean {
  return /(create|update|delete|remove|add|manage|batch_records|link|unlink|advance|log_activity)/i.test(
    toolName
  );
}

function findToolDefinition(
  toolDefinitions: Record<string, unknown>,
  toolName: string
): ToolDefinitionLike | undefined {
  for (const definitionGroup of Object.values(toolDefinitions)) {
    if (!definitionGroup || typeof definitionGroup !== 'object') {
      continue;
    }

    for (const definitionValue of Object.values(
      definitionGroup as Record<string, unknown>
    )) {
      if (
        definitionValue &&
        typeof definitionValue === 'object' &&
        (definitionValue as ToolDefinitionLike).name === toolName
      ) {
        return definitionValue as ToolDefinitionLike;
      }
    }
  }

  return undefined;
}

async function resolveStep(step: WorkflowStepInput, index: number) {
  const [{ resolveToolName }, { findToolConfig, TOOL_DEFINITIONS }] =
    await Promise.all([
      import('@/config/tool-aliases.js'),
      import('@/handlers/tools/registry.js'),
    ]);

  const resolved = resolveToolName(step.tool);
  const toolInfo = findToolConfig(resolved.name);

  if (!toolInfo) {
    return {
      index,
      id: step.id ?? `step_${index + 1}`,
      requestedTool: step.tool,
      tool: resolved.name,
      arguments: step.arguments ?? {},
      onError: step.on_error ?? 'stop',
      readOnly: false,
      valid: false,
      validationError: `Unknown tool: ${step.tool}`,
    } satisfies ResolvedStep;
  }

  if (resolved.name === WORKFLOW_EXECUTE_TOOL) {
    return {
      index,
      id: step.id ?? `step_${index + 1}`,
      requestedTool: step.tool,
      tool: resolved.name,
      arguments: step.arguments ?? {},
      onError: step.on_error ?? 'stop',
      readOnly: false,
      valid: false,
      validationError: 'Nested workflow execution is not allowed',
    } satisfies ResolvedStep;
  }

  let compensationResolved: ResolvedStep['compensation'];
  if (step.compensation) {
    const resolvedComp = resolveToolName(step.compensation.tool);

    if (resolvedComp.name === WORKFLOW_EXECUTE_TOOL) {
      return {
        index,
        id: step.id ?? `step_${index + 1}`,
        requestedTool: step.tool,
        tool: resolved.name,
        arguments: step.arguments ?? {},
        onError: step.on_error ?? 'stop',
        readOnly: false,
        valid: false,
        validationError:
          'Nested workflow execution is not allowed in compensation steps',
      } satisfies ResolvedStep;
    }

    const compensationToolInfo = findToolConfig(resolvedComp.name);
    if (!compensationToolInfo) {
      return {
        index,
        id: step.id ?? `step_${index + 1}`,
        requestedTool: step.tool,
        tool: resolved.name,
        arguments: step.arguments ?? {},
        onError: step.on_error ?? 'stop',
        readOnly: false,
        valid: false,
        validationError: `Unknown compensation tool: ${step.compensation.tool}`,
      } satisfies ResolvedStep;
    }

    compensationResolved = {
      requestedTool: step.compensation.tool,
      tool: resolvedComp.name,
      arguments: step.compensation.arguments ?? {},
    };
  }

  const definition = findToolDefinition(
    TOOL_DEFINITIONS as Record<string, unknown>,
    resolved.name
  );
  const readOnlyHint = definition?.annotations?.readOnlyHint;
  const readOnly =
    typeof readOnlyHint === 'boolean'
      ? readOnlyHint
      : !isLikelyWriteTool(resolved.name);

  return {
    index,
    id: step.id ?? `step_${index + 1}`,
    requestedTool: step.tool,
    tool: resolved.name,
    arguments: step.arguments ?? {},
    onError: step.on_error ?? 'stop',
    compensation: compensationResolved,
    readOnly,
    valid: true,
  } satisfies ResolvedStep;
}

function getTextFromMcpResult(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return safeJson(result);
  }

  const content = (result as { content?: unknown[] }).content;
  if (!Array.isArray(content)) {
    return safeJson(result);
  }

  const textBlocks = content
    .map((item) =>
      item && typeof item === 'object'
        ? ((item as { text?: unknown }).text ?? '')
        : ''
    )
    .filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    );

  if (textBlocks.length > 0) {
    return textBlocks.join('\n');
  }

  return safeJson(result);
}

function isMcpError(result: unknown): boolean {
  return Boolean(
    result &&
    typeof result === 'object' &&
    'isError' in result &&
    (result as { isError?: unknown }).isError === true
  );
}

async function executeStepTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const { executeToolRequest } =
    await import('@/handlers/tools/dispatcher/core.js');
  return executeToolRequest({
    params: {
      name: toolName,
      arguments: args,
    },
  } as never);
}

function toStepResult(step: ResolvedStep): WorkflowStepResult {
  return {
    index: step.index,
    id: step.id,
    tool: step.tool,
    requested_tool: step.requestedTool,
    read_only: step.readOnly,
    status: 'pending',
  };
}

function summarizeStepResults(stepResults: WorkflowStepResult[]) {
  const completedSteps = stepResults.filter(
    (step) => step.status === 'completed'
  ).length;
  const failedSteps = stepResults.filter(
    (step) => step.status === 'failed'
  ).length;
  const skippedSteps = stepResults.filter(
    (step) => step.status === 'skipped'
  ).length;

  return {
    completedSteps,
    failedSteps,
    skippedSteps,
  };
}

function formatWorkflowResult(result: WorkflowExecutionResult): string {
  const summary = result.summary;
  const base = [
    `Workflow ${result.status}`,
    `steps: ${summary.completed_steps}/${summary.total_steps} completed`,
    `writes: ${summary.write_steps}`,
    `reads: ${summary.read_steps}`,
    `compensations: ${summary.compensation_steps}`,
  ];

  if (result.replayed) {
    base.push('replayed from journal');
  }

  if (result.dry_run) {
    base.push('dry-run only');
  }

  if (result.rollback.attempted) {
    base.push(`rollback: ${result.rollback.status}`);
  }

  const failedSteps = result.steps.filter((step) => step.status === 'failed');
  if (failedSteps.length === 0) {
    return base.join(' | ');
  }

  const failurePreview = failedSteps
    .slice(0, 2)
    .map((step) => `${step.id}: ${step.error ?? 'unknown error'}`)
    .join(' ; ');
  return `${base.join(' | ')} | failures: ${failurePreview}`;
}

async function executeRollback(
  completedSteps: ResolvedStep[]
): Promise<WorkflowExecutionResult['rollback']> {
  const rollbackSteps: WorkflowRollbackStepResult[] = [];
  let failureCount = 0;

  for (let i = completedSteps.length - 1; i >= 0; i -= 1) {
    const step = completedSteps[i];
    const compensation = step.compensation;

    if (!compensation) {
      rollbackSteps.push({
        source_step_id: step.id,
        compensation_tool: 'none',
        requested_compensation_tool: 'none',
        status: 'skipped',
      });
      continue;
    }

    try {
      const response = await executeStepTool(
        compensation.tool,
        compensation.arguments
      );
      const preview = trimPreview(getTextFromMcpResult(response));

      if (isMcpError(response)) {
        failureCount += 1;
        rollbackSteps.push({
          source_step_id: step.id,
          compensation_tool: compensation.tool,
          requested_compensation_tool: compensation.requestedTool,
          status: 'failed',
          error: preview,
        });
      } else {
        rollbackSteps.push({
          source_step_id: step.id,
          compensation_tool: compensation.tool,
          requested_compensation_tool: compensation.requestedTool,
          status: 'completed',
          output_preview: preview,
        });
      }
    } catch (error: unknown) {
      failureCount += 1;
      rollbackSteps.push({
        source_step_id: step.id,
        compensation_tool: compensation.tool,
        requested_compensation_tool: compensation.requestedTool,
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'Unknown compensation execution error',
      });
    }
  }

  if (failureCount === 0) {
    return {
      attempted: true,
      status: 'completed',
      steps: rollbackSteps,
    };
  }

  if (failureCount === rollbackSteps.length) {
    return {
      attempted: true,
      status: 'failed',
      steps: rollbackSteps,
    };
  }

  return {
    attempted: true,
    status: 'completed_with_errors',
    steps: rollbackSteps,
  };
}

async function runWorkflowExecution(
  params: WorkflowExecuteInput
): Promise<WorkflowExecutionResult> {
  const workflowId = params.workflow_id ?? `wf_${randomUUID()}`;
  const idempotencyKey = params.idempotency_key ?? `wf-key_${randomUUID()}`;
  const fingerprint = createFingerprint(params);
  const nowIso = new Date().toISOString();

  const existingEntry = workflowJournal.get(idempotencyKey);
  if (existingEntry) {
    if (existingEntry.fingerprint !== fingerprint) {
      throw new Error(
        `Idempotency key '${idempotencyKey}' was used with a different workflow payload`
      );
    }

    if (
      existingEntry.response &&
      (existingEntry.status === 'completed' ||
        (existingEntry.status === 'failed' && !params.resume))
    ) {
      return {
        ...existingEntry.response,
        replayed: true,
        resume: params.resume,
      };
    }

    if (existingEntry.status === 'in_progress') {
      throw new Error(
        `Workflow with idempotency key '${idempotencyKey}' is already in progress`
      );
    }
  }

  const resolvedSteps = await Promise.all(
    params.steps.map((step, index) => resolveStep(step, index))
  );

  const invalidSteps = resolvedSteps.filter((step) => !step.valid);
  if (invalidSteps.length > 0) {
    const errorSummary = invalidSteps
      .map((step) => `${step.id}: ${step.validationError}`)
      .join('; ');
    throw new Error(`Workflow validation failed: ${errorSummary}`);
  }

  const readSteps = resolvedSteps.filter((step) => step.readOnly).length;
  const writeSteps = resolvedSteps.length - readSteps;
  const compensationSteps = resolvedSteps.filter(
    (step) => step.compensation !== undefined
  ).length;
  const stepResults = resolvedSteps.map((step) => toStepResult(step));

  const newEntry: WorkflowJournalEntry = {
    idempotencyKey,
    fingerprint,
    status: 'in_progress',
    createdAt: existingEntry?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  workflowJournal.set(idempotencyKey, newEntry);

  if (params.dry_run) {
    const plannedResult: WorkflowExecutionResult = {
      workflow_id: workflowId,
      idempotency_key: idempotencyKey,
      dry_run: true,
      resume: params.resume,
      rollback_on_failure: params.rollback_on_failure,
      replayed: false,
      status: 'planned',
      summary: {
        total_steps: resolvedSteps.length,
        read_steps: readSteps,
        write_steps: writeSteps,
        compensation_steps: compensationSteps,
        completed_steps: 0,
        failed_steps: 0,
        skipped_steps: 0,
      },
      steps: stepResults,
      rollback: {
        attempted: false,
        status: 'not_needed',
        steps: [],
      },
      journal: {
        created_at: newEntry.createdAt,
        updated_at: nowIso,
        fingerprint,
      },
    };

    workflowJournal.set(idempotencyKey, {
      ...newEntry,
      status: 'completed',
      updatedAt: nowIso,
      response: plannedResult,
    });

    return plannedResult;
  }

  let terminalStatus: WorkflowStatus = 'completed';
  let shouldRollback = false;
  const completedResolvedSteps: ResolvedStep[] = [];
  let rollback: WorkflowExecutionResult['rollback'] = {
    attempted: false,
    status: 'not_needed',
    steps: [],
  };

  for (let i = 0; i < resolvedSteps.length; i += 1) {
    const step = resolvedSteps[i];
    const stepResult = stepResults[i];

    try {
      const stepResponse = await executeStepTool(step.tool, step.arguments);
      const preview = trimPreview(getTextFromMcpResult(stepResponse));

      if (isMcpError(stepResponse)) {
        stepResult.status = 'failed';
        stepResult.error = preview;

        if (step.onError === 'continue') {
          terminalStatus = 'completed_with_errors';
          continue;
        }

        terminalStatus = 'failed';
        shouldRollback = true;
        for (let j = i + 1; j < stepResults.length; j += 1) {
          stepResults[j].status = 'skipped';
        }
        break;
      }

      stepResult.status = 'completed';
      stepResult.output_preview = preview;
      completedResolvedSteps.push(step);
    } catch (error: unknown) {
      stepResult.status = 'failed';
      stepResult.error =
        error instanceof Error ? error.message : 'Unknown step execution error';

      if (step.onError === 'continue') {
        terminalStatus = 'completed_with_errors';
        continue;
      }

      terminalStatus = 'failed';
      shouldRollback = true;
      for (let j = i + 1; j < stepResults.length; j += 1) {
        stepResults[j].status = 'skipped';
      }
      break;
    } finally {
      const updatedAt = new Date().toISOString();
      const partialResult: WorkflowExecutionResult = {
        workflow_id: workflowId,
        idempotency_key: idempotencyKey,
        dry_run: false,
        resume: params.resume,
        rollback_on_failure: params.rollback_on_failure,
        replayed: false,
        status: terminalStatus === 'failed' ? 'failed' : 'completed',
        summary: {
          total_steps: resolvedSteps.length,
          read_steps: readSteps,
          write_steps: writeSteps,
          compensation_steps: compensationSteps,
          completed_steps: stepResults.filter(
            (stepItem) => stepItem.status === 'completed'
          ).length,
          failed_steps: stepResults.filter(
            (stepItem) => stepItem.status === 'failed'
          ).length,
          skipped_steps: stepResults.filter(
            (stepItem) => stepItem.status === 'skipped'
          ).length,
        },
        steps: stepResults,
        rollback,
        journal: {
          created_at: newEntry.createdAt,
          updated_at: updatedAt,
          fingerprint,
        },
      };

      workflowJournal.set(idempotencyKey, {
        ...newEntry,
        status: 'in_progress',
        updatedAt,
        response: partialResult,
      });
    }
  }

  if (shouldRollback && params.rollback_on_failure) {
    rollback = await executeRollback(completedResolvedSteps);
  }

  const summary = summarizeStepResults(stepResults);
  const finalStatus: WorkflowStatus =
    terminalStatus === 'failed'
      ? 'failed'
      : terminalStatus === 'completed_with_errors'
        ? 'completed_with_errors'
        : summary.failedSteps > 0
          ? 'completed_with_errors'
          : 'completed';

  const finishedAt = new Date().toISOString();
  const finalResult: WorkflowExecutionResult = {
    workflow_id: workflowId,
    idempotency_key: idempotencyKey,
    dry_run: false,
    resume: params.resume,
    rollback_on_failure: params.rollback_on_failure,
    replayed: false,
    status: finalStatus,
    summary: {
      total_steps: resolvedSteps.length,
      read_steps: readSteps,
      write_steps: writeSteps,
      compensation_steps: compensationSteps,
      completed_steps: summary.completedSteps,
      failed_steps: summary.failedSteps,
      skipped_steps: summary.skippedSteps,
    },
    steps: stepResults,
    rollback,
    journal: {
      created_at: newEntry.createdAt,
      updated_at: finishedAt,
      fingerprint,
    },
  };

  workflowJournal.set(idempotencyKey, {
    ...newEntry,
    status: finalStatus === 'failed' ? 'failed' : 'completed',
    updatedAt: finishedAt,
    response: finalResult,
  });

  return finalResult;
}

export const workflowExecuteConfig: UniversalToolConfig<
  Record<string, unknown>,
  WorkflowExecutionResult
> = {
  name: WORKFLOW_EXECUTE_TOOL,
  handler: async (params): Promise<WorkflowExecutionResult> => {
    try {
      const sanitized = validateUniversalToolParams(
        WORKFLOW_EXECUTE_TOOL,
        params
      );
      const validated = workflowExecuteSchema.parse(sanitized);
      return runWorkflowExecution(validated);
    } catch (error: unknown) {
      throw ErrorService.createUniversalError(
        WORKFLOW_EXECUTE_TOOL,
        'records',
        error
      );
    }
  },
  formatResult: (result) => formatWorkflowResult(result),
  structuredOutput: (result) => result as unknown as Record<string, unknown>,
};

export const workflowExecuteInputSchema = {
  type: 'object' as const,
  properties: {
    workflow_id: {
      type: 'string' as const,
      description: 'Optional workflow identifier for traceability.',
    },
    idempotency_key: {
      type: 'string' as const,
      description:
        'Optional idempotency key to safely retry the same workflow payload.',
    },
    dry_run: {
      type: 'boolean' as const,
      description:
        'When true, validate and plan all steps without executing any tool.',
      default: false,
    },
    resume: {
      type: 'boolean' as const,
      description:
        'When true, allows rerunning a previously failed idempotency key.',
      default: false,
    },
    rollback_on_failure: {
      type: 'boolean' as const,
      description:
        'When true (default), run compensation hooks for completed steps after terminal failure.',
      default: true,
    },
    steps: {
      type: 'array' as const,
      minItems: 1,
      maxItems: MAX_STEPS,
      items: {
        type: 'object' as const,
        properties: {
          id: {
            type: 'string' as const,
            description: 'Optional step identifier.',
          },
          tool: {
            type: 'string' as const,
            description: 'Tool name to execute for this step.',
          },
          arguments: {
            type: 'object' as const,
            additionalProperties: true,
            description: 'Arguments to send to the step tool.',
          },
          on_error: {
            type: 'string' as const,
            enum: ['stop', 'continue'] as const,
            description: 'Stop or continue the workflow if this step fails.',
          },
          compensation: {
            type: 'object' as const,
            properties: {
              tool: {
                type: 'string' as const,
                description:
                  'Compensation tool to run during rollback when workflow fails.',
              },
              arguments: {
                type: 'object' as const,
                additionalProperties: true,
                description: 'Arguments to send to the compensation tool.',
              },
            },
            required: ['tool'] as const,
            additionalProperties: false,
          },
        },
        required: ['tool'] as const,
        additionalProperties: false,
      },
    },
  },
  required: ['steps'] as const,
  additionalProperties: false,
  examples: [
    {
      idempotency_key: 'wf-acme-onboarding-2026-02-24',
      dry_run: true,
      rollback_on_failure: true,
      steps: [
        {
          tool: 'aaa-health-check',
          compensation: {
            tool: 'aaa-health-check',
          },
        },
      ],
    },
  ],
};

export const workflowExecuteToolDefinition = {
  name: WORKFLOW_EXECUTE_TOOL,
  description:
    'Execute ordered tool steps with dry-run planning, idempotent retries, and optional compensation rollback hooks. Does not: provide atomic database transactions.',
  inputSchema: workflowExecuteInputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
};

export function __resetWorkflowExecutionJournalForTests(): void {
  workflowJournal.clear();
}
