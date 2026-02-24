import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetWorkflowExecutionJournalForTests,
  workflowExecuteConfig,
} from '../../../../src/handlers/tool-configs/universal/workflow-execute.js';

describe('execute_workflow', () => {
  beforeEach(() => {
    __resetWorkflowExecutionJournalForTests();
  });

  it('returns a dry-run plan with read/write step summary', async () => {
    const result = await workflowExecuteConfig.handler({
      idempotency_key: 'wf-dry-run',
      dry_run: true,
      steps: [
        { tool: 'aaa-health-check' },
        {
          tool: 'create_record',
          arguments: {
            resource_type: 'companies',
            record_data: { name: 'ACME Dry Run' },
          },
        },
      ],
    });

    expect(result.status).toBe('planned');
    expect(result.summary.total_steps).toBe(2);
    expect(result.summary.read_steps).toBe(1);
    expect(result.summary.write_steps).toBe(1);
    expect(result.summary.compensation_steps).toBe(0);
    expect(result.rollback.attempted).toBe(false);
    expect(result.rollback.status).toBe('not_needed');
    expect(result.steps[0].status).toBe('pending');
    expect(result.steps[1].status).toBe('pending');
  });

  it('executes a safe read-only step end-to-end', async () => {
    const result = await workflowExecuteConfig.handler({
      idempotency_key: 'wf-exec-health',
      steps: [{ tool: 'aaa-health-check' }],
    });

    expect(result.status).toBe('completed');
    expect(result.summary.completed_steps).toBe(1);
    expect(result.steps[0].status).toBe('completed');
    expect(result.steps[0].output_preview).toContain('"ok": true');
    expect(result.rollback.attempted).toBe(false);
  });

  it('replays completed idempotent workflows without re-executing', async () => {
    const first = await workflowExecuteConfig.handler({
      idempotency_key: 'wf-replay',
      dry_run: true,
      steps: [{ tool: 'aaa-health-check' }],
    });

    const second = await workflowExecuteConfig.handler({
      idempotency_key: 'wf-replay',
      dry_run: true,
      steps: [{ tool: 'aaa-health-check' }],
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.workflow_id).toBe(first.workflow_id);
  });

  it('rejects idempotency key reuse with a different payload', async () => {
    await workflowExecuteConfig.handler({
      idempotency_key: 'wf-collision',
      dry_run: true,
      steps: [{ tool: 'aaa-health-check' }],
    });

    await expect(
      workflowExecuteConfig.handler({
        idempotency_key: 'wf-collision',
        dry_run: true,
        steps: [
          { tool: 'aaa-health-check' },
          { tool: 'aaa-health-check', id: 'second' },
        ],
      })
    ).rejects.toThrow(
      "Idempotency key 'wf-collision' was used with a different workflow payload"
    );
  });

  it('rejects nested workflow execution steps', async () => {
    await expect(
      workflowExecuteConfig.handler({
        dry_run: true,
        steps: [{ tool: 'execute_workflow' }],
      })
    ).rejects.toThrow('Nested workflow execution is not allowed');
  });

  it('runs compensation steps on terminal failure', async () => {
    const result = await workflowExecuteConfig.handler({
      idempotency_key: 'wf-rollback',
      rollback_on_failure: true,
      steps: [
        {
          id: 'first-step',
          tool: 'aaa-health-check',
          compensation: {
            tool: 'aaa-health-check',
          },
        },
        {
          id: 'failing-step',
          tool: 'fetch',
          arguments: {
            id: 'invalid-id-format',
          },
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.rollback.attempted).toBe(true);
    expect(result.rollback.status).toBe('completed');
    expect(result.rollback.steps).toHaveLength(1);
    expect(result.rollback.steps[0].source_step_id).toBe('first-step');
    expect(result.rollback.steps[0].status).toBe('completed');
  });

  it('can disable rollback on terminal failure', async () => {
    const result = await workflowExecuteConfig.handler({
      idempotency_key: 'wf-no-rollback',
      rollback_on_failure: false,
      steps: [
        {
          id: 'first-step',
          tool: 'aaa-health-check',
          compensation: {
            tool: 'aaa-health-check',
          },
        },
        {
          id: 'failing-step',
          tool: 'fetch',
          arguments: {
            id: 'invalid-id-format',
          },
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.rollback.attempted).toBe(false);
    expect(result.rollback.status).toBe('not_needed');
    expect(result.rollback.steps).toHaveLength(0);
  });
});
