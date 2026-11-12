import { describe, expect, it } from 'vitest';
import { AdaptiveAllocator } from '../packages/cloud-core/src/sprint/allocator';
import { AllocationArm } from '../packages/cloud-core/src/sprint/types';

describe('Milestone M9 - Contextual Multi-Armed Bandit Allocator', () => {
  const allocator = new AdaptiveAllocator({ minSampleSize: 8, explorationFloor: 0.1 });

  it('shifts allocation weights dynamically toward best-converting arms', () => {
    const initialArms: AllocationArm[] = [
      {
        channel: 'email',
        targetRole: 'Staff Backend Engineer',
        templateId: 'technical_depth_hook',
        weight: 1.0,
        pulls: 15,
        successes: 4, // 26.6% success
        status: 'active',
      },
      {
        channel: 'email',
        targetRole: 'Staff Backend Engineer',
        templateId: 'general_inquiry_hook',
        weight: 1.0,
        pulls: 15,
        successes: 1, // 6.6% success
        status: 'active',
      },
    ];

    const rebalanced = allocator.rebalance(initialArms);

    expect(rebalanced).toHaveLength(2);
    const topArm = rebalanced.find((a) => a.templateId === 'technical_depth_hook');
    const lowerArm = rebalanced.find((a) => a.templateId === 'general_inquiry_hook');

    expect(topArm).toBeDefined();
    expect(lowerArm).toBeDefined();
    // Top converting arm should receive significantly higher weight
    expect(topArm!.weight).toBeGreaterThan(lowerArm!.weight);
    expect(topArm!.status).toBe('active');
  });

  it('stops low-yield activity by halting arms with zero successes after minimum sample size', () => {
    const armsWithDud: AllocationArm[] = [
      {
        channel: 'ats',
        targetRole: 'Full Stack Engineer',
        templateId: 'standard_apply',
        weight: 1.0,
        pulls: 10,
        successes: 0, // 0 successes on 10 pulls
        status: 'active',
      },
      {
        channel: 'email',
        targetRole: 'Full Stack Engineer',
        templateId: 'custom_hook',
        weight: 1.0,
        pulls: 12,
        successes: 3,
        status: 'active',
      },
    ];

    const rebalanced = allocator.rebalance(armsWithDud);

    const haltedArm = rebalanced.find((a) => a.channel === 'ats');
    const activeArm = rebalanced.find((a) => a.channel === 'email');

    expect(haltedArm).toBeDefined();
    expect(haltedArm!.status).toBe('halted');
    expect(haltedArm!.weight).toBe(0);
    expect(haltedArm!.reason).toContain('Low yield halted');

    expect(activeArm).toBeDefined();
    expect(activeArm!.status).toBe('active');
    expect(activeArm!.weight).toBeGreaterThan(0.8);
  });

  it('selects active arms according to weighted probability', () => {
    const arms: AllocationArm[] = [
      {
        channel: 'email',
        targetRole: 'Senior Engineer',
        templateId: 't1',
        weight: 0.9,
        pulls: 20,
        successes: 6,
        status: 'active',
      },
      {
        channel: 'ats',
        targetRole: 'Senior Engineer',
        templateId: 't2',
        weight: 0.0,
        pulls: 10,
        successes: 0,
        status: 'halted',
      },
    ];

    const rebalanced = allocator.rebalance(arms);
    const selected = allocator.selectArm(rebalanced);

    expect(selected).toBeDefined();
    expect(selected?.status).toBe('active');
    expect(selected?.templateId).toBe('t1');
  });
});

