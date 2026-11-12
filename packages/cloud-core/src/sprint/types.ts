/**
 * Sprint Mode & Orchestration Domain Types
 * Hard Line H6: Forecasts are ranges with calibration notes; no outcome guarantees.
 */

export type SprintStatus = 'scheduled' | 'active' | 'paused' | 'completed' | 'aborted';

export type SprintChannel = 'ats' | 'email' | 'referral' | 'linkedin_assist';

export interface SprintConfig {
  targetRoles: string[];
  seniority?: string;
  enabledChannels: SprintChannel[];
  targetDurationHours: number; // 72 to 96 hours
  dailyAtsCap?: number;
  dailyEmailCap?: number;
  minRelevanceScore?: number; // default 3.5
}

export interface SprintMetrics {
  discoveredJobsCount: number;
  evaluatedJobsCount: number;
  tailoredArtifactsCount: number;
  atsApplicationsSubmitted: number;
  atsApplicationsFailed: number;
  emailOutreachSent: number;
  emailBounces: number;
  emailComplaints: number;
  emailRepliesReceived: number;
  negativeReplies: number;
  referralsInitiated: number;
  linkedinAssistItemsGenerated: number;
  truthfulnessGateChecks: number;
  truthfulnessGateFailures: number;
  interviewsScheduled: number;
}

export interface SprintRun {
  id: string;
  tenantId: string;
  contractId?: string;
  status: SprintStatus;
  targetDurationHours: number;
  startedAt: string;
  endedAt?: string;
  config: SprintConfig;
  metrics: SprintMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationArm {
  id?: string;
  channel: SprintChannel;
  targetRole: string;
  templateId: string;
  weight: number;
  pulls: number;
  successes: number;
  status: 'active' | 'throttled' | 'halted';
  priorSource?: string;
}

export type AutoPauseTriggerType =
  | 'bounce_rate_spike'
  | 'spam_complaint'
  | 'mailbox_warning'
  | 'ats_error_spike'
  | 'truthfulness_gate_spike'
  | 'negative_reply_spike'
  | 'linkedin_restriction';

export interface AutoPauseEvent {
  id?: string;
  sprintId: string;
  channel: SprintChannel;
  triggerType: AutoPauseTriggerType;
  metricValue: number;
  threshold: number;
  details: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface CalibratedForecast {
  expectedInterviewsMin: number;
  expectedInterviewsMax: number;
  expectedApplicationsMin: number;
  expectedApplicationsMax: number;
  confidenceInterval: string; // e.g. "80% Bayesian credible interval"
  calibrationNotes: string[];
  hardLineH6Notice: string;
}

export interface SprintReport {
  sprintId: string;
  durationHours: number;
  status: SprintStatus;
  funnel: {
    jobsDiscovered: number;
    jobsEvaluated: number;
    applicationsSubmitted: number;
    outreachSent: number;
    repliesReceived: number;
    interviewsScheduled: number;
  };
  conversionRates: {
    evaluationPassRate: number;
    replyRate: number;
    interviewYieldRate: number;
  };
  channelPerformance: {
    channel: SprintChannel;
    volume: number;
    successRate: number;
    status: 'active' | 'throttled' | 'halted';
  }[];
  learnings: string[];
  nextSteps: string[];
}

