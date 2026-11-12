/**
 * Experimentation Domain Types (Milestone M11 Item 5 Hardened)
 * Minimum-sample guardrails, Fisher Exact Test, Bayesian comparison,
 * and cross-tenant pooled experiments.
 */

export type ExperimentDimension = 'cv_headline' | 'outreach_hook';
export type ExperimentStatus = 'draft' | 'running' | 'concluded' | 'halted';

export interface ExperimentVariant {
  id: string;
  name: string;
  content: string;
  allocationWeight: number; // e.g. 0.5 for 50/50 split
  impressions: number;
  conversions: number;
}

export interface ExperimentPrior {
  alpha: number;
  beta: number;
  source: string; // e.g. "cross_tenant_pooled_benchmark" or "unvalidated"
}

export interface ExperimentDefinition {
  id: string;
  tenantId: string;
  name: string;
  targetDimension: ExperimentDimension;
  status: ExperimentStatus;
  minSampleSize: number; // default 30 per variant
  minSuccesses?: number; // default 5 per variant
  isPooled?: boolean;
  participatingTenantsCount?: number;
  prior?: ExperimentPrior;
  variants: ExperimentVariant[];
  winnerVariantId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StatisticalEvaluation {
  experimentId: string;
  status: ExperimentStatus;
  hasMinimumSample: boolean;
  hasMinimumSuccesses?: boolean;
  totalImpressions: number;
  pVal?: number; // Fisher's exact two-tailed p-value (or Z-test p-value)
  fisherPValue?: number;
  bayesianProbabilityWinner?: number; // P(p_winner > p_loser | data)
  priorSource?: string;
  isStatisticallySignificant: boolean;
  winnerVariantId?: string;
  rationale: string;
  variantMetrics: {
    variantId: string;
    impressions: number;
    conversions: number;
    conversionRate: number;
  }[];
}
