import { z } from 'zod';

export const ApplicationStatusEnum = z.enum([
  'scouted',
  'evaluated',
  'tailored',
  'queued',
  'submitting',
  'applied',
  'outreach_sent',
  'replied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'archived',
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatusEnum>;

export const ApplicationChannelEnum = z.enum(['ats', 'email', 'linkedin_assist', 'calendar']);
export type ApplicationChannel = z.infer<typeof ApplicationChannelEnum>;

export const SubmissionProofSchema = z
  .object({
    submissionId: z.string().min(1).max(256),
    submittedAt: z.string().datetime(),
    proofUrl: z.string().url().max(1024).optional(),
    payloadSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    confirmationNumber: z.string().max(256).optional(),
  })
  .strict();

export type SubmissionProof = z.infer<typeof SubmissionProofSchema>;

export const ApplicationInputSchema = z
  .object({
    company: z.string().trim().min(1).max(160),
    role: z.string().trim().min(1).max(160),
    sourceUrl: z.string().url().max(1024).optional(),
    externalJobId: z.string().trim().min(1).max(256).optional(),
    channel: ApplicationChannelEnum.default('ats'),
    score: z.number().min(1.0).max(5.0).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;

export interface ApplicationRecord {
  id: string;
  tenantId: string;
  company: string;
  role: string;
  sourceUrl?: string;
  externalJobId?: string;
  status: ApplicationStatus;
  channel: ApplicationChannel;
  score?: number;
  submissionProof?: SubmissionProof;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationTimelineEvent {
  id: string;
  tenantId: string;
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  reason?: string;
  actorSubject: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const ActivitySeverityEnum = z.enum(['info', 'warn', 'error', 'success']);
export type ActivitySeverity = z.infer<typeof ActivitySeverityEnum>;

export interface ActivityFeedEvent {
  id: string;
  tenantId: string;
  eventType: string;
  severity: ActivitySeverity;
  title: string;
  description: string;
  actorSubject: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Valid state transitions table for the job search autonomous lifecycle.
 */
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  scouted: ['evaluated', 'archived'],
  evaluated: ['tailored', 'archived'],
  tailored: ['queued', 'archived'],
  queued: ['submitting', 'withdrawn', 'archived'],
  submitting: ['applied', 'queued', 'withdrawn', 'archived'],
  applied: ['outreach_sent', 'replied', 'interviewing', 'rejected', 'withdrawn', 'archived'],
  outreach_sent: ['replied', 'interviewing', 'rejected', 'withdrawn', 'archived'],
  replied: ['interviewing', 'rejected', 'withdrawn', 'archived'],
  interviewing: ['offer', 'rejected', 'withdrawn', 'archived'],
  offer: ['archived'],
  rejected: ['archived'],
  withdrawn: ['archived'],
  archived: [],
};

export interface TransitionRequest {
  toStatus: ApplicationStatus;
  reason?: string;
  submissionProof?: SubmissionProof;
  metadata?: Record<string, unknown>;
}

/**
 * Validates state transition invariants:
 * 1. Legal state machine path
 * 2. Submission proof required when transitioning to 'applied'
 * 3. Reason required when transitioning to 'withdrawn'
 * 4. Terminal state invariants
 */
export function assertValidTransition(
  currentStatus: ApplicationStatus,
  request: TransitionRequest
): void {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(request.toStatus)) {
    throw new Error(
      `Illegal application status transition from '${currentStatus}' to '${request.toStatus}'`
    );
  }

  // Invariant 1: Proof required for 'applied'
  if (request.toStatus === 'applied') {
    if (!request.submissionProof) {
      throw new Error(
        "Proof of submission (submissionProof) is required to transition to 'applied' status"
      );
    }
    SubmissionProofSchema.parse(request.submissionProof);
  }

  // Invariant 2: Reason required for 'withdrawn'
  if (request.toStatus === 'withdrawn') {
    if (!request.reason || request.reason.trim().length === 0) {
      throw new Error('A clear reason is required to withdraw an application');
    }
  }
}

export interface DashboardMetrics {
  totalTracked: number;
  statusCounts: Record<ApplicationStatus, number>;
  appliedCount: number;
  interviewingCount: number;
  offerCount: number;
  rejectedCount: number;
  withdrawnCount: number;
  todayAppliedCount: number;
  dailyApplicationCap: number;
  applicationCapRemaining: number;
  interviewConversionRate: number; // percentage 0 - 100
  channelDistribution: Record<ApplicationChannel, number>;
}

/**
 * Aggregates dashboard metrics from application records and sprint limits.
 */
export function computeDashboardMetrics(
  applications: ApplicationRecord[],
  dailyApplicationCap = 25
): DashboardMetrics {
  const statusCounts: Record<ApplicationStatus, number> = {
    scouted: 0,
    evaluated: 0,
    tailored: 0,
    queued: 0,
    submitting: 0,
    applied: 0,
    outreach_sent: 0,
    replied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
    archived: 0,
  };

  const channelDistribution: Record<ApplicationChannel, number> = {
    ats: 0,
    email: 0,
    linkedin_assist: 0,
    calendar: 0,
  };

  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).getTime();
  let todayAppliedCount = 0;

  for (const app of applications) {
    statusCounts[app.status] = (statusCounts[app.status] ?? 0) + 1;
    channelDistribution[app.channel] = (channelDistribution[app.channel] ?? 0) + 1;

    if (
      ['applied', 'outreach_sent', 'replied', 'interviewing', 'offer'].includes(app.status) &&
      app.submissionProof?.submittedAt
    ) {
      const submittedTime = Date.parse(app.submissionProof.submittedAt);
      if (!isNaN(submittedTime) && submittedTime >= startOfDay) {
        todayAppliedCount++;
      }
    }
  }

  const appliedTotal =
    statusCounts.applied +
    statusCounts.outreach_sent +
    statusCounts.replied +
    statusCounts.interviewing +
    statusCounts.offer;

  const interviewTotal = statusCounts.interviewing + statusCounts.offer;
  const interviewConversionRate =
    appliedTotal > 0 ? Math.round((interviewTotal / appliedTotal) * 1000) / 10 : 0;

  return {
    totalTracked: applications.length,
    statusCounts,
    appliedCount: appliedTotal,
    interviewingCount: statusCounts.interviewing,
    offerCount: statusCounts.offer,
    rejectedCount: statusCounts.rejected,
    withdrawnCount: statusCounts.withdrawn,
    todayAppliedCount,
    dailyApplicationCap,
    applicationCapRemaining: Math.max(0, dailyApplicationCap - todayAppliedCount),
    interviewConversionRate,
    channelDistribution,
  };
}
