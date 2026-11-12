/**
 * Unattended Sprint Mode Scheduler & Temporal Workflow Engine
 * Runs autonomous apply/outreach/inbox waves without human approvals (standing consent).
 */

import { SprintWorkflowActivities } from './activities';
import { SprintWorkflowInput, SprintWorkflowState, WaveExecutionResult } from './types';

export class UnattendedSprintScheduler {
  private readonly activities: SprintWorkflowActivities;

  constructor(activities: SprintWorkflowActivities) {
    this.activities = activities;
  }

  /**
   * Executes a scheduled tick of the unattended Sprint Mode pipeline.
   * Depending on elapsed wall-clock hours, dispatches discovery, apply, outreach, or inbox watch waves.
   */
  public async executeTick(
    input: SprintWorkflowInput,
    elapsedHours: number
  ): Promise<{
    state: SprintWorkflowState;
    results: WaveExecutionResult[];
    autoPauseTriggered: boolean;
  }> {
    const results: WaveExecutionResult[] = [];
    const remainingHours = Math.max(0, input.targetDurationHours - elapsedHours);

    // 1. Inbox watch runs every tick (5-minute cadence)
    const inboxResult = await this.activities.executeInboxWatch(input.tenantId, input.sprintId);
    results.push(inboxResult);

    // 2. Wave dispatch based on phase:
    // T+0 to T+6h: Discovery and initial prep
    if (elapsedHours < 6.0) {
      const discoveryResult = await this.activities.executeDiscoveryWave(input.tenantId, input.sprintId);
      results.push(discoveryResult);
    } else if (elapsedHours < input.targetDurationHours) {
      // T+6h onward: Apply waves and Outreach waves
      const applyResult = await this.activities.executeApplyWave(input.tenantId, input.sprintId);
      results.push(applyResult);

      const outreachResult = await this.activities.executeOutreachWave(input.tenantId, input.sprintId);
      results.push(outreachResult);
    }

    // 3. Daily Rebalance (runs once every ~24h intervals)
    if (elapsedHours > 0 && Math.floor(elapsedHours) % 24 === 0) {
      const rebalanceResult = await this.activities.executeDailyRebalance(input.tenantId, input.sprintId);
      results.push(rebalanceResult);
    }

    // 4. Standing-Consent Auto-Pause Safety Check (from REAL DB state)
    const autoPause = await this.activities.evaluateAutoPause(input.tenantId, input.sprintId);

    const isCompleted = elapsedHours >= input.targetDurationHours;

    const state: SprintWorkflowState = {
      sprintId: input.sprintId,
      tenantId: input.tenantId,
      status: isCompleted ? 'completed' : autoPause.shouldPause ? 'paused' : 'active',
      elapsedHours,
      remainingHours,
      wavesExecuted: results.length,
      activePausedChannels: autoPause.pausedChannels,
      lastAutoPauseCheck: new Date().toISOString(),
    };

    return {
      state,
      results,
      autoPauseTriggered: autoPause.shouldPause,
    };
  }
}
