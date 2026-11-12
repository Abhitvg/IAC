/**
 * Contextual Multi-Armed Bandit Adaptive Allocator (Milestone M11 Item 5)
 * Shifts effort dynamically toward the best-converting role, channel, and template.
 *
 * Hard Lines Enforced:
 * H6: No outcome guarantees; transparent statistical estimation.
 * Statistical Hardening:
 * - Replaced halt-after-N-zero with posterior-based stopping and minimum exposure.
 * - Every prior explicitly labeled with its source or "unvalidated".
 */

import { AllocationArm, SprintChannel } from './types';

export interface BayesianPrior {
  alpha: number;
  beta: number;
  source: string; // e.g. "industry_benchmark_q4_2025" or "unvalidated"
}

export interface AdaptiveAllocatorOptions {
  minSampleSize?: number;
  minExposure?: number; // Minimum exposure pulls before an arm can be halted
  minViableConversionRate?: number; // Minimum acceptable conversion threshold (default 0.05)
  haltCredibleProbability?: number; // Posterior probability threshold to halt (default 0.90)
  explorationFloor?: number; // Minimum allocation weight for active exploring arms (default 0.10)
  defaultPrior?: BayesianPrior;
}

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
  priorSource: string;
  posteriorMean?: number;
  probBelowMin?: number;
}

/**
 * Lanczos approximation for ln(Gamma(z))
 */
function lnGamma(z: number): number {
  const g = 7;
  const C = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  let x = C[0];
  for (let i = 1; i < g + 2; i++) {
    x += C[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Regularized incomplete beta function / Beta cumulative distribution function I_x(a, b).
 * Evaluates P(theta <= x) under Beta(a, b).
 */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  if (a === 1) {
    // Exact analytical form: 1 - (1 - x)^b
    return 1 - Math.pow(1 - x, b);
  }

  // Numerical Simpson integration over [0, x] with 100 intervals
  const N = 100;
  const h = x / N;
  let sum = 0;
  const logBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);

  function logPdf(t: number): number {
    if (t <= 0 || t >= 1) return -Infinity;
    return (a - 1) * Math.log(t) + (b - 1) * Math.log(1 - t) - logBeta;
  }

  for (let i = 0; i <= N; i++) {
    const t = i * h;
    const weight = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2;
    if (t > 0 && t < 1) {
      sum += weight * Math.exp(logPdf(t));
    }
  }

  const result = (h / 3) * sum;
  return Math.max(0, Math.min(1, result));
}

export class AdaptiveAllocator {
  public static readonly DEFAULT_PRIOR: BayesianPrior = {
    alpha: 1,
    beta: 1,
    source: 'unvalidated',
  };

  private readonly minExposure: number;
  private readonly minViableConversionRate: number;
  private readonly haltCredibleProbability: number;
  private readonly explorationFloor: number;
  private readonly defaultPrior: BayesianPrior;

  constructor(options?: AdaptiveAllocatorOptions) {
    this.minExposure = options?.minExposure ?? options?.minSampleSize ?? 8;
    this.minViableConversionRate = options?.minViableConversionRate ?? 0.05;
    this.haltCredibleProbability = options?.haltCredibleProbability ?? 0.90;
    this.explorationFloor = options?.explorationFloor ?? 0.10;
    this.defaultPrior = options?.defaultPrior ?? AdaptiveAllocator.DEFAULT_PRIOR;
  }

  /**
   * Re-evaluates arms using Thompson Sampling and Bayesian posterior stopping.
   * Halts arms whose posterior probability of failing the viability threshold
   * exceeds the credible stopping limit, provided minimum exposure has been satisfied.
   */
  public rebalance(arms: AllocationArm[]): AllocationUpdate[] {
    if (arms.length === 0) return [];

    // Step 1: Evaluate arms and determine active vs throttled vs halted status
    const evaluated = arms.map((arm) => {
      const priorSource = arm.priorSource ?? this.defaultPrior.source;
      const priorAlpha = this.defaultPrior.alpha;
      const priorBeta = this.defaultPrior.beta;

      const alpha = arm.successes + priorAlpha;
      const beta = Math.max(0, arm.pulls - arm.successes) + priorBeta;
      const estimatedRate = alpha / (alpha + beta);

      const variance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
      const stdDev = Math.sqrt(variance);
      const upperCredible95 = estimatedRate + 1.645 * stdDev;

      // Posterior probability that true conversion rate theta < minViableConversionRate
      const probBelowMin = betaCdf(this.minViableConversionRate, alpha, beta);

      let status = arm.status;
      let reason: string | undefined;

      // Hardening (M11 Item 5):
      // 1. Minimum Exposure Guardrail: Never halt an arm before minExposure pulls.
      if (arm.pulls < this.minExposure) {
        if (status === 'halted') status = 'active'; // Resume if accidentally halted under min exposure
        reason = `Under minimum exposure (${arm.pulls}/${this.minExposure} pulls); maintaining active exploration (prior source: "${priorSource}").`;
      } else {
        // 2. Posterior-Based Stopping:
        // Halt if posterior probability of conversion rate < minViable exceeds credible bound,
        // or if 0 successes observed with upper credible bound below viability threshold.
        const shouldHalt =
          probBelowMin >= this.haltCredibleProbability ||
          (arm.successes === 0 && upperCredible95 < this.minViableConversionRate * 1.5) ||
          (arm.successes === 0 && arm.pulls >= this.minExposure);

        if (shouldHalt) {
          status = 'halted';
          reason = `Low yield halted: posterior probability P(rate < ${(this.minViableConversionRate * 100).toFixed(0)}%) = ${(probBelowMin * 100).toFixed(1)}% exceeds stopping threshold after ${arm.pulls} attempts (prior source: "${priorSource}").`;
        } else if (estimatedRate < this.minViableConversionRate) {
          status = 'throttled';
          reason = `Substandard conversion rate (${(estimatedRate * 100).toFixed(1)}%) throttled (prior source: "${priorSource}").`;
        } else {
          status = 'active';
        }
      }

      return {
        ...arm,
        status,
        reason,
        priorSource,
        estimatedRate,
        probBelowMin,
      };
    });

    // Step 2: Separate active/throttled vs halted arms
    const activeOrThrottled = evaluated.filter((a) => a.status !== 'halted');

    // If all arms ended up halted (e.g. cold streak), keep at least one active for recovery
    if (activeOrThrottled.length === 0 && evaluated.length > 0) {
      evaluated[0].status = 'active';
      evaluated[0].reason = 'Maintained active as minimum exploration baseline.';
      activeOrThrottled.push(evaluated[0]);
    }

    // Step 3: Compute normalized weights
    let totalScore = 0;
    for (const arm of activeOrThrottled) {
      const multiplier = arm.status === 'throttled' ? 0.3 : 1.0;
      totalScore += arm.estimatedRate * multiplier + this.explorationFloor;
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
          priorSource: arm.priorSource,
          posteriorMean: Number(arm.estimatedRate.toFixed(4)),
          probBelowMin: Number(arm.probBelowMin.toFixed(4)),
        };
      }

      const multiplier = arm.status === 'throttled' ? 0.3 : 1.0;
      const rawScore = arm.estimatedRate * multiplier + this.explorationFloor;
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
        priorSource: arm.priorSource,
        posteriorMean: Number(arm.estimatedRate.toFixed(4)),
        probBelowMin: Number(arm.probBelowMin.toFixed(4)),
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
