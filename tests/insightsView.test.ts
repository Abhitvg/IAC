import { describe, it, expect } from 'vitest';
import { ExperimentEngine, calculateFisherExactPValue } from '../packages/cloud-core/src/experiments/experiment-engine';
import { FunnelAnalyticsEngine } from '../packages/cloud-core/src/analytics/funnel';
import { useInsightsStore } from '../src/store/useInsightsStore';

describe('CareerOps Screen 7: Insights & A/B Experimentation Engine (Hard Line H6)', () => {
  const experimentEngine = new ExperimentEngine();
  const funnelEngine = new FunnelAnalyticsEngine();

  it('calculates funnel conversion metrics across sequential stages', () => {
    const report = funnelEngine.computeFunnel(
      'tenant-test',
      {
        discovered: 100,
        evaluated: 80,
        appliedOrContacted: 40,
        repliesReceived: 10,
        interviewsScheduled: 5,
        offersReceived: 1,
      },
      [],
      {}
    );

    expect(report.conversionRates.evaluationRate).toBe(0.8);
    expect(report.conversionRates.applicationRate).toBe(0.5);
    expect(report.conversionRates.replyRate).toBe(0.25);
    expect(report.conversionRates.interviewConversionRate).toBe(0.5);
    expect(report.conversionRates.overallYield).toBe(0.125);
  });

  it('calculates Fisher exact p-value and Bayesian winner probability', () => {
    // 2x2 contingency:
    // Variant A: 6 conversions / 42 total (36 non-conversions)
    // Variant B: 14 conversions / 45 total (31 non-conversions)
    const pVal = calculateFisherExactPValue(6, 36, 14, 31);
    expect(pVal).toBeGreaterThan(0);
    expect(pVal).toBeLessThan(0.1); // Strong signal
  });

  it('strictly blocks declaring a winner when sample size guardrail is violated (N < 30)', () => {
    const underSampled = {
      id: 'test-small-sample',
      tenantId: 'tenant-test',
      name: 'Under-sampled Test',
      targetDimension: 'cv_headline' as const,
      status: 'running' as const,
      minSampleSize: 30,
      minSuccesses: 5,
      variants: [
        { id: 'v1', name: 'V1', content: 'C1', allocationWeight: 0.5, impressions: 12, conversions: 2 },
        { id: 'v2', name: 'V2', content: 'C2', allocationWeight: 0.5, impressions: 15, conversions: 4 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const evaluation = experimentEngine.evaluateExperiment(underSampled);
    expect(evaluation.hasMinimumSample).toBe(false);
    expect(evaluation.isStatisticallySignificant).toBe(false);
    expect(evaluation.rationale).toContain('Minimum sample guardrail not met');
  });

  it('declares statistical evaluation when N >= 30 and successes >= 5', () => {
    const adequatelySampled = {
      id: 'test-adequate-sample',
      tenantId: 'tenant-test',
      name: 'Adequate Sample Test',
      targetDimension: 'cv_headline' as const,
      status: 'running' as const,
      minSampleSize: 30,
      minSuccesses: 5,
      variants: [
        { id: 'v1', name: 'V1', content: 'C1', allocationWeight: 0.5, impressions: 40, conversions: 6 },
        { id: 'v2', name: 'V2', content: 'C2', allocationWeight: 0.5, impressions: 45, conversions: 18 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const evaluation = experimentEngine.evaluateExperiment(adequatelySampled);
    expect(evaluation.hasMinimumSample).toBe(true);
    expect(evaluation.hasMinimumSuccesses).toBe(true);
    expect(evaluation.winnerVariantId).toBe('v2');
    expect(evaluation.bayesianProbabilityWinner).toBeGreaterThan(0.9);
  });

  it('manages active experiment tabs and state in useInsightsStore', () => {
    const store = useInsightsStore.getState();
    store.setActiveTab('experiments');
    expect(useInsightsStore.getState().activeTab).toBe('experiments');

    store.setActiveTab('forecast');
    expect(useInsightsStore.getState().activeTab).toBe('forecast');

    store.setActiveTab('funnel');
    expect(useInsightsStore.getState().activeTab).toBe('funnel');
  });
});

