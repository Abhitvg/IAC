import { describe, expect, it } from 'vitest';
import { ExperimentEngine } from '../packages/cloud-core/src/experiments/experiment-engine';
import { ExperimentDefinition } from '../packages/cloud-core/src/experiments/types';

describe('Milestone M10 - A/B Experimentation Engine & Minimum Sample Guardrails', () => {
  const engine = new ExperimentEngine();

  const baseExperiment: ExperimentDefinition = {
    id: 'exp-cv-headline-001',
    tenantId: 'tenant-100',
    name: 'Staff Backend CV Headline: Distributed Systems vs Cloud Infrastructure',
    targetDimension: 'cv_headline',
    status: 'running',
    minSampleSize: 30,
    variants: [
      {
        id: 'var_a',
        name: 'Distributed Systems Specialist',
        content: 'Staff Backend Engineer | Distributed Systems & High-Throughput Microservices',
        allocationWeight: 0.5,
        impressions: 0,
        conversions: 0,
      },
      {
        id: 'var_b',
        name: 'Cloud Infrastructure Leader',
        content: 'Staff Backend Engineer | Cloud Infrastructure & Scalable Architecture',
        allocationWeight: 0.5,
        impressions: 0,
        conversions: 0,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('deterministically assigns variants according to subject key hashing', () => {
    const v1 = engine.assignVariant(baseExperiment, 'job-posting-apple-001');
    const v2 = engine.assignVariant(baseExperiment, 'job-posting-apple-001');
    const v3 = engine.assignVariant(baseExperiment, 'job-posting-stripe-002');

    // Deterministic assignment for the same subject key
    expect(v1.id).toBe(v2.id);
    expect(['var_a', 'var_b']).toContain(v3.id);
  });

  it('enforces minimum-sample guardrail: blocks declaring winners when impressions < 30', () => {
    const underSampledExperiment: ExperimentDefinition = {
      ...baseExperiment,
      variants: [
        { ...baseExperiment.variants[0], impressions: 25, conversions: 5 }, // 25 < 30
        { ...baseExperiment.variants[1], impressions: 20, conversions: 1 }, // 20 < 30
      ],
    };

    const evaluation = engine.evaluateExperiment(underSampledExperiment);

    expect(evaluation.hasMinimumSample).toBe(false);
    expect(evaluation.isStatisticallySignificant).toBe(false);
    expect(evaluation.winnerVariantId).toBeUndefined();
    expect(evaluation.rationale).toContain('Minimum sample guardrail not met');
  });

  it('detects statistically significant conversion difference with two-proportion Z-test (p < 0.05)', () => {
    const significantExperiment: ExperimentDefinition = {
      ...baseExperiment,
      variants: [
        { ...baseExperiment.variants[0], impressions: 100, conversions: 8 }, // 8% conversion
        { ...baseExperiment.variants[1], impressions: 100, conversions: 24 }, // 24% conversion
      ],
    };

    const evaluation = engine.evaluateExperiment(significantExperiment);

    expect(evaluation.hasMinimumSample).toBe(true);
    expect(evaluation.isStatisticallySignificant).toBe(true);
    expect(evaluation.winnerVariantId).toBe('var_b');
    expect(evaluation.pVal).toBeLessThan(0.05);
    expect(evaluation.rationale).toContain('Statistically significant difference detected');
    expect(evaluation.rationale).toContain('Variant "Cloud Infrastructure Leader" declared winner');
  });

  it('marks inconclusive when observed conversion rate difference is not statistically significant', () => {
    const inconclusiveExperiment: ExperimentDefinition = {
      ...baseExperiment,
      variants: [
        { ...baseExperiment.variants[0], impressions: 50, conversions: 6 }, // 12%
        { ...baseExperiment.variants[1], impressions: 50, conversions: 7 }, // 14%
      ],
    };

    const evaluation = engine.evaluateExperiment(inconclusiveExperiment);

    expect(evaluation.hasMinimumSample).toBe(true);
    expect(evaluation.isStatisticallySignificant).toBe(false);
    expect(evaluation.winnerVariantId).toBeUndefined();
    expect(evaluation.pVal).toBeGreaterThan(0.05);
    expect(evaluation.rationale).toContain('Inconclusive evidence');
  });
});
