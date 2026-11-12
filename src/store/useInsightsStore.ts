import { create } from 'zustand';
import {
  ExperimentDefinition,
  StatisticalEvaluation,
} from '../../packages/cloud-core/src/experiments/types';
import { ExperimentEngine } from '../../packages/cloud-core/src/experiments/experiment-engine';
import {
  FunnelAnalyticsEngine,
  FunnelAnalyticsReport,
  ChannelAttribution,
} from '../../packages/cloud-core/src/analytics/funnel';

const STORAGE_KEY = 'career_ops_insights_experiments_v1';
const engine = new ExperimentEngine();
const funnelEngine = new FunnelAnalyticsEngine();

export const INITIAL_DEMO_EXPERIMENTS: ExperimentDefinition[] = [
  {
    id: 'exp-cv-headline-1',
    tenantId: 'tenant-demo',
    name: 'CV Header: Systems Engineer vs. Distributed Systems Architect',
    targetDimension: 'cv_headline',
    status: 'running',
    minSampleSize: 30,
    minSuccesses: 5,
    prior: {
      alpha: 2,
      beta: 18,
      source: 'cross_tenant_pooled_benchmark',
    },
    variants: [
      {
        id: 'var-a-headline',
        name: 'Variant A: Senior Systems Engineer',
        content: 'Senior Software Engineer specializing in automated evaluation pipelines and AST validation',
        allocationWeight: 0.5,
        impressions: 42,
        conversions: 6,
      },
      {
        id: 'var-b-headline',
        name: 'Variant B: Staff Distributed Systems Architect',
        content: 'Staff Distributed Systems Architect specializing in low-latency Kafka ingestion and high-throughput telemetry',
        allocationWeight: 0.5,
        impressions: 45,
        conversions: 14,
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'exp-outreach-hook-2',
    tenantId: 'tenant-demo',
    name: 'LinkedIn Connect Hook: Technical Overlap vs. Mutual Mission',
    targetDimension: 'outreach_hook',
    status: 'running',
    minSampleSize: 30,
    minSuccesses: 5,
    prior: {
      alpha: 3,
      beta: 15,
      source: 'cross_tenant_pooled_benchmark',
    },
    variants: [
      {
        id: 'var-a-tech',
        name: 'Variant A: Direct Technical Proof (AST / 98% Test Coverage)',
        content: 'Hi {name}, saw your post on AI coding benchmarks. I built AST test suites with 98% coverage and would love to connect!',
        allocationWeight: 0.5,
        impressions: 34,
        conversions: 11,
      },
      {
        id: 'var-b-mission',
        name: 'Variant B: Mission & Trajectory Alignment',
        content: 'Hi {name}, inspired by your team\'s recent work in frontier model safety. Following your scaling initiatives with great interest!',
        allocationWeight: 0.5,
        impressions: 31,
        conversions: 4,
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'exp-cold-email-3',
    tenantId: 'tenant-demo',
    name: 'Email Subject: Referral Mention vs. Direct Role Follow-up',
    targetDimension: 'outreach_hook',
    status: 'draft',
    minSampleSize: 30,
    minSuccesses: 5,
    prior: {
      alpha: 1,
      beta: 10,
      source: 'unvalidated',
    },
    variants: [
      {
        id: 'var-a-sub',
        name: 'Variant A: [Candidate] - Staff Infrastructure Application',
        content: 'Candidate Engineer - Staff Infrastructure Application Follow-up',
        allocationWeight: 0.5,
        impressions: 12,
        conversions: 1,
      },
      {
        id: 'var-b-sub',
        name: 'Variant B: Referral follow-up via [Insider Name]',
        content: 'Internal Referral Follow-up for Staff Infrastructure Engineer',
        allocationWeight: 0.5,
        impressions: 14,
        conversions: 3,
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

export const INITIAL_CHANNEL_ATTRIBUTIONS: ChannelAttribution[] = [
  {
    channel: 'Referral-First Wave',
    volume: 18,
    conversions: 8,
    conversionRate: 0.4444, // 44.4%
  },
  {
    channel: 'Direct ATS Apply',
    volume: 32,
    conversions: 4,
    conversionRate: 0.125, // 12.5%
  },
  {
    channel: 'Cold Recruiter Outreach',
    volume: 24,
    conversions: 5,
    conversionRate: 0.2083, // 20.8%
  },
];

function loadSavedExperiments(): ExperimentDefinition[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[InsightsStore] Failed to load experiments:', e);
    }
  }
  return INITIAL_DEMO_EXPERIMENTS;
}

function persistExperiments(experiments: ExperimentDefinition[]) {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
    } catch (e) {
      console.warn('[InsightsStore] Failed to persist experiments:', e);
    }
  }
}

interface InsightsState {
  activeTab: 'funnel' | 'experiments' | 'forecast';
  experiments: ExperimentDefinition[];
  selectedExperimentId: string | null;
  channels: ChannelAttribution[];

  setActiveTab: (tab: 'funnel' | 'experiments' | 'forecast') => void;
  setSelectedExperimentId: (id: string | null) => void;
  evaluate: (exp: ExperimentDefinition) => StatisticalEvaluation;
  addExperiment: (data: Omit<ExperimentDefinition, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateVariantStats: (expId: string, variantId: string, impressions: number, conversions: number) => void;
  resetToDemo: () => void;
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  activeTab: 'funnel',
  experiments: loadSavedExperiments(),
  selectedExperimentId: 'exp-cv-headline-1',
  channels: INITIAL_CHANNEL_ATTRIBUTIONS,

  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedExperimentId: (id) => set({ selectedExperimentId: id }),

  evaluate: (exp) => {
    return engine.evaluateExperiment(exp);
  },

  addExperiment: (data) => {
    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const newExp: ExperimentDefinition = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newExp, ...get().experiments];
    persistExperiments(updated);
    set({ experiments: updated, selectedExperimentId: id });
    return id;
  },

  updateVariantStats: (expId, variantId, impressions, conversions) => {
    const updated = get().experiments.map((exp) => {
      if (exp.id === expId) {
        const updatedVariants = exp.variants.map((v) =>
          v.id === variantId ? { ...v, impressions, conversions } : v
        );
        return { ...exp, variants: updatedVariants, updatedAt: new Date().toISOString() };
      }
      return exp;
    });
    persistExperiments(updated);
    set({ experiments: updated });
  },

  resetToDemo: () => {
    persistExperiments(INITIAL_DEMO_EXPERIMENTS);
    set({
      experiments: INITIAL_DEMO_EXPERIMENTS,
      selectedExperimentId: 'exp-cv-headline-1',
      channels: INITIAL_CHANNEL_ATTRIBUTIONS,
    });
  },
}));
