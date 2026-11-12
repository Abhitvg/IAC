/**
 * Rigorous A/B Experimentation Engine
 * Enforces minimum-sample guardrails and two-proportion hypothesis testing.
 */

import { createHash } from 'node:crypto';
import {
  ExperimentDefinition,
  ExperimentDimension,
  ExperimentVariant,
  StatisticalEvaluation,
} from './types';

export class ExperimentEngine {
  public static readonly DEFAULT_MIN_SAMPLE_SIZE = 30; // Min 30 impressions per variant
  public static readonly SIGNIFICANCE_ALPHA = 0.05; // 95% confidence level

  /**
   * Deterministically assigns a variant to a given subject (job id, recipient email, or application id)
   * using SHA-256 modulus over the variant allocation weights.
   */
  public assignVariant(experiment: ExperimentDefinition, subjectKey: string): ExperimentVariant {
    const activeVariants = experiment.variants.filter((v) => v.allocationWeight > 0);
    if (activeVariants.length === 0) {
      throw new Error(`Experiment ${experiment.id} has no active variants with positive weight.`);
    }

    if (activeVariants.length === 1) {
      return activeVariants[0];
    }

    const hash = createHash('sha256').update(`${experiment.id}:${subjectKey}`).digest('hex');
    const bucket = parseInt(hash.slice(0, 8), 16) % 10000; // 0 to 9999

    const totalWeight = activeVariants.reduce((sum, v) => sum + v.allocationWeight, 0);
    let cumulative = 0;

    for (const variant of activeVariants) {
      const normalizedShare = (variant.allocationWeight / totalWeight) * 10000;
      cumulative += normalizedShare;
      if (bucket < cumulative) {
        return variant;
      }
    }

    return activeVariants[activeVariants.length - 1];
  }

  /**
   * Evaluates experiment results, enforcing minimum-sample guardrails before declaring any winner.
   */
  public evaluateExperiment(experiment: ExperimentDefinition): StatisticalEvaluation {
    const minSample = experiment.minSampleSize || ExperimentEngine.DEFAULT_MIN_SAMPLE_SIZE;
    const variants = experiment.variants;

    const variantMetrics = variants.map((v) => ({
      variantId: v.id,
      impressions: v.impressions,
      conversions: v.conversions,
      conversionRate: v.impressions > 0 ? Number((v.conversions / v.impressions).toFixed(4)) : 0,
    }));

    const totalImpressions = variants.reduce((sum, v) => sum + v.impressions, 0);
    const hasMinimumSample = variants.every((v) => v.impressions >= minSample);

    // Guardrail: Do not declare winner if sample size is insufficient
    if (!hasMinimumSample) {
      const underSampled = variants.filter((v) => v.impressions < minSample);
      return {
        experimentId: experiment.id,
        status: experiment.status,
        hasMinimumSample: false,
        totalImpressions,
        isStatisticallySignificant: false,
        rationale: `Minimum sample guardrail not met: ${underSampled.map((u) => `${u.name} has ${u.impressions}/${minSample}`).join(', ')}. No winner declared to prevent false positives.`,
        variantMetrics,
      };
    }

    if (variants.length !== 2) {
      // For multi-variant (> 2), rank by conversion rate
      const sorted = [...variantMetrics].sort((a, b) => b.conversionRate - a.conversionRate);
      return {
        experimentId: experiment.id,
        status: experiment.status,
        hasMinimumSample: true,
        totalImpressions,
        isStatisticallySignificant: false,
        winnerVariantId: sorted[0].variantId,
        rationale: `Multi-variant test evaluated on ${totalImpressions} samples. Highest conversion: ${sorted[0].variantId} (${(sorted[0].conversionRate * 100).toFixed(1)}%).`,
        variantMetrics,
      };
    }

    // Two-proportion Z-test for A/B (2 variants)
    const [vA, vB] = variants;
    const nA = vA.impressions;
    const nB = vB.impressions;
    const cA = vA.conversions;
    const cB = vB.conversions;

    const pA = cA / nA;
    const pB = cB / nB;

    const pooledP = (cA + cB) / (nA + nB);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / nA + 1 / nB));

    if (se === 0 || pA === pB) {
      return {
        experimentId: experiment.id,
        status: experiment.status,
        hasMinimumSample: true,
        totalImpressions,
        pVal: 1.0,
        isStatisticallySignificant: false,
        rationale: 'No conversion rate difference observed between variants (p = 1.0).',
        variantMetrics,
      };
    }

    const zScore = (pA - pB) / se;
    const pVal = Number(this.calculateTwoTailedPValue(Math.abs(zScore)).toFixed(4));
    const isStatisticallySignificant = pVal < ExperimentEngine.SIGNIFICANCE_ALPHA;

    let winnerVariantId: string | undefined;
    let rationale = '';

    if (isStatisticallySignificant) {
      winnerVariantId = pA > pB ? vA.id : vB.id;
      const winnerName = pA > pB ? vA.name : vB.name;
      const lift = Math.abs(((pA - pB) / Math.min(pA, pB || 0.001)) * 100).toFixed(1);
      rationale = `Statistically significant difference detected (Z = ${zScore.toFixed(2)}, p = ${pVal} < 0.05). Variant "${winnerName}" declared winner with ${lift}% relative lift.`;
    } else {
      rationale = `Inconclusive evidence (Z = ${zScore.toFixed(2)}, p = ${pVal} >= 0.05). The observed difference is not statistically distinguishable from random variation.`;
    }

    return {
      experimentId: experiment.id,
      status: isStatisticallySignificant ? 'concluded' : experiment.status,
      hasMinimumSample: true,
      totalImpressions,
      pVal,
      isStatisticallySignificant,
      winnerVariantId,
      rationale,
      variantMetrics,
    };
  }

  /**
   * Approximates standard normal cumulative distribution function for two-tailed p-value.
   */
  private calculateTwoTailedPValue(absZ: number): number {
    // Abramowitz and Stegun approximation for standard normal CDF
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;

    const t = 1.0 / (1.0 + p * absZ);
    const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
    const oneTail = c * Math.exp(-0.5 * absZ * absZ) * poly;

    return Math.max(0.0001, Math.min(1.0, 2 * oneTail));
  }
}
