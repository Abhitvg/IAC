/**
 * Experimentation Domain Types
 * Minimum-sample guardrails and significance testing for A/B tests on CV headlines and outreach hooks.
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

export interface ExperimentDefinition {
  id: string;
  tenantId: string;
  name: string;
  targetDimension: ExperimentDimension;
  status: ExperimentStatus;
  minSampleSize: number; // default 30 per variant
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
  totalImpressions: number;
  pVal?: number;
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

