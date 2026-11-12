import { describe, expect, it } from 'vitest';
import {
  AdaptiveAllocator,
  betaCdf,
  type BayesianPrior,
} from '../packages/cloud-core/src/sprint/allocator';
import {
  ExperimentEngine,
  calculateFisherExactPValue,
} from '../packages/cloud-core/src/experiments/experiment-engine';
import { ExperimentDefinition } from '../packages/cloud-core/src/experiments/types';
import { OutcomeForecaster } from '../packages/cloud-core/src/sprint/forecaster';
import { AllocationArm } from '../packages/cloud-core/src/sprint/types';

describe('Milestone M11 Item 5: Statistics Hardening & Provenance Guardrails', () => {
  describe('1. Adaptive Allocator: Minimum Exposure & Posterior-Based Stopping', () => {
    it('refuses to halt arms that have not met the minimum exposure threshold', () => {
      const allocator = new AdaptiveAllocator({
        minExposure: 15,
        minViableConversionRate: 0.05,
      });

      const arms: AllocationArm[] = [
        {
          channel: 'ats',
          targetRole: 'Site Reliability Engineer',
          templateId: 'standard_v1',
          weight: 1.0,
          pulls: 5, // 5 < 15 pulls
          successes: 0,
          status: 'active',
          priorSource: 'industry_benchmark_q4_2025',
        },
        {
          channel: 'email',
          targetRole: 'Site Reliability Engineer',
          templateId: 'hook_v1',
          weight: 1.0,
          pulls: 18,
          successes: 4,
          status: 'active',
          priorSource: 'industry_benchmark_q4_2025',
        },
      ];

      const rebalanced = allocator.rebalance(arms);
      const atsArm = rebalanced.find((a) => a.channel === 'ats');

      expect(atsArm).toBeDefined();
      // Even with 0 successes, must NOT halt before minExposure
      expect(atsArm!.status).toBe('active');
      expect(atsArm!.reason).toContain('Under minimum exposure (5/15 pulls)');
      expect(atsArm!.priorSource).toBe('industry_benchmark_q4_2025');
      expect(atsArm!.weight).toBeGreaterThan(0);
    });

    it('halts arms via posterior-based stopping when conversion rate is reliably substandard after minimum exposure', () => {
      const allocator = new AdaptiveAllocator({
        minExposure: 10,
        minViableConversionRate: 0.05,
        haltCredibleProbability: 0.85,
      });

      const arms: AllocationArm[] = [
        {
          channel: 'email',
          targetRole: 'Staff Infrastructure',
          templateId: 'generic_intro',
          weight: 1.0,
          pulls: 25, // Well past minExposure
          successes: 0, // 0 / 25
          status: 'active',
        },
        {
          channel: 'email',
          targetRole: 'Staff Infrastructure',
          templateId: 'tech_deep_dive',
          weight: 1.0,
          pulls: 25,
          successes: 5, // 5 / 25 = 20%
          status: 'active',
        },
      ];

      const rebalanced = allocator.rebalance(arms);
      const dudArm = rebalanced.find((a) => a.templateId === 'generic_intro');
      const topArm = rebalanced.find((a) => a.templateId === 'tech_deep_dive');

      expect(dudArm).toBeDefined();
      expect(dudArm!.status).toBe('halted');
      expect(dudArm!.weight).toBe(0);
      expect(dudArm!.reason).toContain('Low yield halted: posterior probability P(rate < 5%)');
      expect(dudArm!.priorSource).toBe('unvalidated'); // Default prior labeled unvalidated

      expect(topArm).toBeDefined();
      expect(topArm!.status).toBe('active');
      expect(topArm!.weight).toBeGreaterThan(0.8);
    });

    it('verifies exact Beta CDF computation for posterior probabilities', () => {
      // Beta(1, 1) is standard uniform: P(theta <= 0.3) = 0.3
      const unifCdf = betaCdf(0.3, 1, 1);
      expect(unifCdf).toBeCloseTo(0.3, 2);

      // Beta(1, 20): P(theta <= 0.05) = 1 - (1 - 0.05)^20 = 1 - 0.358 = ~0.6415
      const betaAnalytical = 1 - Math.pow(0.95, 20);
      const computed = betaCdf(0.05, 1, 20);
      expect(computed).toBeCloseTo(betaAnalytical, 2);
    });
  });

  describe('2. Experiment Engine: Fisher Exact Test & Minimum Successes', () => {
    const engine = new ExperimentEngine();

    it('enforces minimum-successes guardrail: blocks declaring winner when conversions < 5 even if impressions >= 30', () => {
      const experiment: ExperimentDefinition = {
        id: 'exp-low-successes',
        tenantId: 'tenant-1',
        name: 'Outreach Hook Test',
        targetDimension: 'outreach_hook',
        status: 'running',
        minSampleSize: 30,
        minSuccesses: 5,
        variants: [
          { id: 'v1', name: 'Hook A', content: '...', allocationWeight: 0.5, impressions: 50, conversions: 3 }, // 3 < 5
          { id: 'v2', name: 'Hook B', content: '...', allocationWeight: 0.5, impressions: 50, conversions: 1 }, // 1 < 5
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = engine.evaluateExperiment(experiment);

      expect(result.hasMinimumSample).toBe(true);
      expect(result.hasMinimumSuccesses).toBe(false);
      expect(result.isStatisticallySignificant).toBe(false);
      expect(result.winnerVariantId).toBeUndefined();
      expect(result.rationale).toContain('Minimum successes guardrail not met');
      expect(result.rationale).toContain('At least 5 successes required per variant');
    });

    it('uses exact Fisher Exact Test and Bayesian comparison for significance testing', () => {
      // Direct validation of Fisher exact test calculation
      const pVal = calculateFisherExactPValue(10, 90, 25, 75);
      expect(pVal).toBeLessThan(0.05);

      const experiment: ExperimentDefinition = {
        id: 'exp-stat-sig',
        tenantId: 'tenant-1',
        name: 'Headline Test',
        targetDimension: 'cv_headline',
        status: 'running',
        minSampleSize: 30,
        minSuccesses: 5,
        prior: {
          alpha: 1,
          beta: 1,
          source: 'historical_benchmark_2025',
        },
        variants: [
          { id: 'v1', name: 'Standard Headline', content: '...', allocationWeight: 0.5, impressions: 100, conversions: 6 }, // 6%
          { id: 'v2', name: 'Quantified Headline', content: '...', allocationWeight: 0.5, impressions: 100, conversions: 22 }, // 22%
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = engine.evaluateExperiment(experiment);

      expect(result.hasMinimumSample).toBe(true);
      expect(result.hasMinimumSuccesses).toBe(true);
      expect(result.isStatisticallySignificant).toBe(true);
      expect(result.winnerVariantId).toBe('v2');
      expect(result.fisherPValue).toBeDefined();
      expect(result.fisherPValue!).toBeLessThan(0.05);
      expect(result.bayesianProbabilityWinner).toBeDefined();
      expect(result.bayesianProbabilityWinner!).toBeGreaterThanOrEqual(0.95);
      expect(result.priorSource).toBe('historical_benchmark_2025');
      expect(result.rationale).toContain('Fisher exact p =');
      expect(result.rationale).toContain('Bayesian P(winner|data) =');
      expect(result.rationale).toContain('prior: "historical_benchmark_2025"');
    });
  });

  describe('3. Cross-Tenant Pooled Experiments', () => {
    const engine = new ExperimentEngine();

    it('aggregates multiple tenant experiments into an anonymized pooled experiment with provenance', () => {
      // 3 independent tenants each running small experiments with insufficient individual sample size
      const tenant1Exp: ExperimentDefinition = {
        id: 'exp-t1',
        tenantId: 'tenant-1',
        name: 'Pooled SRE Headline',
        targetDimension: 'cv_headline',
        status: 'running',
        minSampleSize: 50,
        minSuccesses: 5,
        variants: [
          { id: 'headline_a', name: 'Headline A', content: 'SRE Specialist', allocationWeight: 0.5, impressions: 20, conversions: 1 },
          { id: 'headline_b', name: 'Headline B', content: 'Reliability Architect', allocationWeight: 0.5, impressions: 20, conversions: 4 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const tenant2Exp: ExperimentDefinition = {
        id: 'exp-t2',
        tenantId: 'tenant-2',
        name: 'Pooled SRE Headline',
        targetDimension: 'cv_headline',
        status: 'running',
        minSampleSize: 50,
        minSuccesses: 5,
        variants: [
          { id: 'headline_a', name: 'Headline A', content: 'SRE Specialist', allocationWeight: 0.5, impressions: 25, conversions: 2 },
          { id: 'headline_b', name: 'Headline B', content: 'Reliability Architect', allocationWeight: 0.5, impressions: 25, conversions: 6 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const tenant3Exp: ExperimentDefinition = {
        id: 'exp-t3',
        tenantId: 'tenant-3',
        name: 'Pooled SRE Headline',
        targetDimension: 'cv_headline',
        status: 'running',
        minSampleSize: 50,
        minSuccesses: 5,
        variants: [
          { id: 'headline_a', name: 'Headline A', content: 'SRE Specialist', allocationWeight: 0.5, impressions: 20, conversions: 1 },
          { id: 'headline_b', name: 'Headline B', content: 'Reliability Architect', allocationWeight: 0.5, impressions: 20, conversions: 5 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Individually, none has minSampleSize of 50
      expect(engine.evaluateExperiment(tenant1Exp).hasMinimumSample).toBe(false);
      expect(engine.evaluateExperiment(tenant2Exp).hasMinimumSample).toBe(false);

      // Pool across the 3 tenants
      const pooled = engine.poolExperiments(
        {
          pooledId: 'pooled-sre-headline-q4',
          name: 'Cross-Tenant Pooled SRE Headline',
          targetDimension: 'cv_headline',
          priorSource: 'cross_tenant_pooled_benchmark_2025',
          minSampleSize: 50,
          minSuccesses: 5,
        },
        [tenant1Exp, tenant2Exp, tenant3Exp]
      );

      expect(pooled.isPooled).toBe(true);
      expect(pooled.participatingTenantsCount).toBe(3);
      expect(pooled.tenantId).toBe('cross_tenant_pooled');
      expect(pooled.prior?.source).toBe('cross_tenant_pooled_benchmark_2025');

      // Total impressions: 20 + 25 + 20 = 65 per variant (>= 50)
      const varA = pooled.variants.find((v) => v.id === 'headline_a');
      const varB = pooled.variants.find((v) => v.id === 'headline_b');
      expect(varA?.impressions).toBe(65);
      expect(varA?.conversions).toBe(4); // 1 + 2 + 1
      expect(varB?.impressions).toBe(65);
      expect(varB?.conversions).toBe(15); // 4 + 6 + 5

      // Evaluate the pooled experiment: has sufficient pooled sample and successes
      const evaluation = engine.evaluateExperiment(pooled);
      expect(evaluation.hasMinimumSample).toBe(true);
      expect(evaluation.hasMinimumSuccesses).toBe(false); // varA has 4 < 5
      expect(evaluation.rationale).toContain('Minimum successes guardrail not met');

      // If varA gains 1 more conversion (5 conversions):
      varA!.conversions = 5;
      const fullSigEvaluation = engine.evaluateExperiment(pooled);
      expect(fullSigEvaluation.hasMinimumSample).toBe(true);
      expect(fullSigEvaluation.hasMinimumSuccesses).toBe(true);
      expect(fullSigEvaluation.isStatisticallySignificant).toBe(true);
      expect(fullSigEvaluation.winnerVariantId).toBe('headline_b');
      expect(fullSigEvaluation.priorSource).toBe('cross_tenant_pooled_benchmark_2025');
    });
  });

  describe('4. Explicit Prior Labeling & Provenance', () => {
    it('labels every prior with its concrete benchmark source or "unvalidated"', () => {
      expect(OutcomeForecaster.PRIOR_ATS.source).toBe('industry_ats_benchmark_2025');
      expect(OutcomeForecaster.PRIOR_EMAIL.source).toBe('outreach_deliverability_index_2025');
      expect(OutcomeForecaster.PRIOR_REFERRAL.source).toBe('employee_referral_survey_2024');
      expect(OutcomeForecaster.UNVALIDATED_PRIOR.source).toBe('unvalidated');

      expect(AdaptiveAllocator.DEFAULT_PRIOR.source).toBe('unvalidated');
      expect(ExperimentEngine.DEFAULT_PRIOR.source).toBe('unvalidated');

      const forecaster = new OutcomeForecaster();
      const forecast = forecaster.generateForecast({
        config: {
          targetRoles: ['Staff Site Reliability Engineer'],
          enabledChannels: ['ats', 'email', 'referral'],
          targetDurationHours: 72,
        },
      });

      // Verify that calibration notes surface the explicit prior sources
      const priorNote = forecast.calibrationNotes.find((n) => n.includes('Bayesian prior initialized'));
      expect(priorNote).toBeDefined();
      expect(priorNote).toContain('source: "industry_ats_benchmark_2025"');
      expect(priorNote).toContain('source: "outreach_deliverability_index_2025"');
      expect(priorNote).toContain('source: "employee_referral_survey_2024"');
    });
  });
});

