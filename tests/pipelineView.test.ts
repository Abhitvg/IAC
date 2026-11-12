import { describe, it, expect } from 'vitest';
import type { JobApplication } from '../src/services/careerOps/types';
import { checkStrategyHold } from '../packages/cloud-core/src/apply/job-strategy';
import { detectGhostJobRisk } from '../src/services/careerOps/ghostJobDetector';

const sampleJobs: JobApplication[] = [
  {
    id: 'job-1',
    company: 'Anthropic',
    role: 'Systems Engineer',
    jdText: 'Python, distributed systems, Kafka, 50k QPS scale',
    status: 'evaluated',
    score: 4.8,
    strategy: 'referral_first',
    referralState: 'waiting',
    createdAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    updatedAt: Date.now(),
  },
  {
    id: 'job-2',
    company: 'Stripe',
    role: 'Backend Engineer',
    jdText: 'Idempotency, distributed ledger, Go, payment processing',
    status: 'applied',
    score: 4.4,
    strategy: 'apply_now',
    referralState: 'overridden',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
    updatedAt: Date.now(),
  },
  {
    id: 'job-3',
    company: 'Ghost Corp',
    role: 'Talent Pool Generalist',
    jdText: 'We are continually accepting applications for our future evergreen talent community.',
    status: 'scouted',
    score: 3.2,
    strategy: 'both',
    referralState: 'waiting',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 120, // 120 days ago (high ghost risk)
    updatedAt: Date.now(),
  },
];

describe('CareerOps Pipeline Dual-View & Query Layer', () => {
  it('correctly filters jobs by min score threshold across both views', () => {
    const highFit = sampleJobs.filter((j) => (j.score || 0) >= 4.0);
    expect(highFit.length).toBe(2);
    expect(highFit.map((j) => j.company)).toEqual(['Anthropic', 'Stripe']);
  });

  it('correctly identifies active referral-first holds', () => {
    const held = sampleJobs.filter((j) => {
      const hold = checkStrategyHold({
        createdAt: new Date(j.createdAt).toISOString(),
        strategy: j.strategy,
        referralState: j.referralState,
      });
      return hold.isHeld;
    });

    expect(held.length).toBe(1);
    expect(held[0].company).toBe('Anthropic');
  });

  it('detects ghost requisitions for sorting and badges', () => {
    const ghostAnalyses = sampleJobs.map((j) => ({
      job: j,
      ghost: detectGhostJobRisk(j.jdText, j.createdAt, j.location, j.salaryRange),
    }));

    const highRisk = ghostAnalyses.filter((g) => g.ghost.riskLevel === 'high_ghost_risk');
    expect(highRisk.length).toBe(1);
    expect(highRisk[0].job.company).toBe('Ghost Corp');
    expect(highRisk[0].ghost.ghostRiskScore).toBeGreaterThanOrEqual(45);
  });

  it('sorts jobs by fit score descending', () => {
    const sorted = [...sampleJobs].sort((a, b) => (b.score || 0) - (a.score || 0));
    expect(sorted.map((j) => j.company)).toEqual(['Anthropic', 'Stripe', 'Ghost Corp']);
  });

  it('sorts jobs by ghost risk score descending', () => {
    const sorted = [...sampleJobs].sort((a, b) => {
      const gA = detectGhostJobRisk(a.jdText, a.createdAt);
      const gB = detectGhostJobRisk(b.jdText, b.createdAt);
      return gB.ghostRiskScore - gA.ghostRiskScore;
    });
    expect(sorted[0].company).toBe('Ghost Corp');
  });
});
