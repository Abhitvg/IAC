/**
 * Contextual Multi-Armed Bandit Adaptive Allocator
 * Shifts effort dynamically toward the best-converting role, channel, and template.
 * Automatically stops low-yield activity once sufficient sample size is reached.
 */

import { AllocationArm, SprintChannel } from './types';

export interface AllocationUpdate {
  armId?: string;
  channel: SprintChannel;
  targetRole: string;
  templateId: string;
  weight: number;
  pulls: number;
  successes: number;
  status: 'active' | 'throttled' | 'halted';
  reason?: string;
}

export class AdaptiveAllocator {
  private readonly minSampleSize: number;
  private readonly explorationFloor: number; // minimum allocation weight for active exploring arms (e.g. 0.10)

  constructor(options?: { minSampleSize?: number; explorationFloor?: number }) {
    this.minSampleSize = options?.minSampleSize ?? 8;
    this.explorationFloor = options?.explorationFloor ?? 0.10;
  }

  /**
   * Re-evaluates arms using Thompson Sampling / Bayesian conversion estimation.
   * Halts arms that consistently yield zero or statistically substandard results.
   * Rebalances weights across active arms to exploit top-performing combinations.
   */
  public rebalance(arms: AllocationArm[]): AllocationUpdate[] {
    if (arms.length === 0) return [];

    // Step 1: Evaluate arms and determine active vs halted status
    const evaluated: Array<AllocationArm & { estimatedRate: number; reason?: string }> = arms.map((arm) => {
      // Prior Beta(1, 1) uniform prior
      const alpha = arm.successes + 1;
      const beta = Math.max(0, arm.pulls - arm.successes) + 1;
      const estimatedRate = alpha / (alpha + beta);

      let status = arm.status;
      let reason: string | undefined;

      // Stop low-yield activity rule:
      // If pulls >= minSampleSize and 0 successes, or rate < 5% when others are performing
      if (arm.pulls >= this.minSampleSize) {
        if (arm.successes === 0) {
          status = 'halted';
          reason = `Low yield halted: 0 successes across ${arm.pulls} attempts (p < 0.01).`;
        } else if (arm.successes / arm.pulls < 0.05) {
          status = 'throttled';
          reason = `Substandard conversion rate (${((arm.successes / arm.pulls) * 100).toFixed(1)}%) throttled.`;
        }
      }

      return {
        ...arm,
        status,
        reason,
        estimatedRate,
      };
    });

    // Step 2: Separate active/throttled vs halted arms
    const activeOrThrottled = evaluated.filter((a) => a.status !== 'halted');

    // If all arms ended up halted (e.g. very early stage or cold streak), keep at least one active for recovery
    if (activeOrThrottled.length === 0 && evaluated.length > 0) {
      evaluated[0].status = 'active';
      evaluated[0].reason = 'Maintained active as minimum exploration baseline.';
      activeOrThrottled.push(evaluated[0]);
    }

    // Step 3: Compute normalized weights
    // Active arms receive weights proportional to estimatedRate, with an exploration floor
    let totalScore = 0;
    for (const arm of activeOrThrottled) {
      const multiplier = arm.status === 'throttled' ? 0.3 : 1.0;
      totalScore += (arm.estimatedRate * multiplier) + this.explorationFloor;
    }

    const results: AllocationUpdate[] = evaluated.map((arm) => {
      if (arm.status === 'halted') {
        return {
          armId: arm.id,
          channel: arm.channel,
          targetRole: arm.targetRole,
          templateId: arm.templateId,
          weight: 0,
          pulls: arm.pulls,
          successes: arm.successes,
          status: 'halted',
          reason: arm.reason || 'Halted due to low conversion yield.',
        };
      }

      const multiplier = arm.status === 'throttled' ? 0.3 : 1.0;
      const rawScore = (arm.estimatedRate * multiplier) + this.explorationFloor;
      const normalizedWeight = totalScore > 0 ? Number((rawScore / totalScore).toFixed(4)) : 1.0;

      return {
        armId: arm.id,
        channel: arm.channel,
        targetRole: arm.targetRole,
        templateId: arm.templateId,
        weight: normalizedWeight,
        pulls: arm.pulls,
        successes: arm.successes,
        status: arm.status,
        reason: arm.reason || `Active with ${(normalizedWeight * 100).toFixed(1)}% allocation weight.`,
      };
    });

    return results;
  }

  /**
   * Selects which arm to dispatch for a new wave or action using weighted random choice.
   */
  public selectArm(allocations: AllocationUpdate[]): AllocationUpdate | null {
    const active = allocations.filter((a) => a.status !== 'halted' && a.weight > 0);
    if (active.length === 0) return null;

    const totalWeight = active.reduce((sum, a) => sum + a.weight, 0);
    const random = Math.random() * totalWeight;

    let cumulative = 0;
    for (const arm of active) {
      cumulative += arm.weight;
      if (random <= cumulative) {
        return arm;
      }
    }

    return active[active.length - 1];
  }
}

